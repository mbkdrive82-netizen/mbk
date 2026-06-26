import TrainerUpload from '../models/TrainerUpload.mjs';
import Trainer from '../models/Trainer.mjs';
import ErrorLog from '../models/ErrorLog.mjs';
import { uploadFileToGoogleDrive, verifyFolderStructure } from '../services/googleDriveService.mjs';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { createRequire } from 'module';

// Canonical Drive hierarchy (shared with documents + college assignment) so a
// missing Day/Attendance/Geo Tag folder can be auto-created on upload instead
// of failing the upload.
const require = createRequire(import.meta.url);
const { ensureTrainerCollegeHierarchy } = require('../modules/drive/driveTrainerDocuments.service.js');

const mapHierarchyDayFolders = (dayFoldersByDayNumber = {}) =>
  Object.keys(dayFoldersByDayNumber)
    .map((dayString) => {
      const meta = dayFoldersByDayNumber[dayString] || {};
      return {
        day: Number(dayString),
        dayFolderId: meta.id || null,
        attendance: meta.attendanceFolder?.id || null,
        geo_tag: meta.geoTagFolder?.id || null,
        excel_sheet: meta.excelSheetFolder?.id || null,
      };
    })
    .sort((a, b) => a.day - b.day);

// Create event emitter for real-time notifications
export const uploadEventEmitter = new EventEmitter();

// Upload file for specific day
export const uploadDailyFile = async (req, res) => {
  const { trainerId, collegeId, day, uploadType } = req.body;
  const file = req.file;

  try {
    // Validation
    if (!trainerId || !collegeId || !day || !uploadType || !file) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields or file',
      });
    }

    if (!['attendance', 'geo_tag', 'excel_sheet'].includes(uploadType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid upload type',
      });
    }

    if (day < 1 || day > 12) {
      return res.status(400).json({
        success: false,
        message: 'Day must be between 1 and 12',
      });
    }

    // Get trainer info
    const trainer = await Trainer.findById(trainerId);
    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: 'Trainer not found',
      });
    }

    // Get college assignment
    const collegeAssignment = trainer.colleges.find(c => c.collegeId.toString() === collegeId);
    if (!collegeAssignment) {
      return res.status(404).json({
        success: false,
        message: 'College not assigned to this trainer',
      });
    }

    // Create upload record
    const upload = await TrainerUpload.create({
      trainerId,
      trainerName: `${trainer.firstName} ${trainer.lastName}`,
      collegeId,
      collegeName: collegeAssignment.collegeName,
      day: parseInt(day),
      uploadType,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      uploadStatus: 'pending',
    });

    // Emit real-time event
    uploadEventEmitter.emit('upload:started', {
      uploadId: upload._id,
      trainerId,
      fileName: file.originalname,
    });

    // Upload to Google Drive asynchronously
    uploadToGoogleDrive(upload, file, collegeAssignment);

    res.status(202).json({
      success: true,
      message: 'Upload started. You will receive a notification when complete.',
      data: {
        uploadId: upload._id,
        uploadStatus: upload.uploadStatus,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);

    await ErrorLog.create({
      errorType: 'VALIDATION_ERROR',
      severity: 'high',
      message: error.message,
      metadata: req.body,
    });

    res.status(500).json({
      success: false,
      message: 'Upload failed',
      error: error.message,
    });
  }
};

// Background upload to Google Drive
const uploadToGoogleDrive = async (uploadRecord, file, collegeAssignment) => {
  try {
    const dayFolderPath = `Day ${uploadRecord.day}`;
    const uploadTypeFolder = uploadRecord.uploadType;
    const uploadTypeFolderDisplay = {
      attendance: 'Attendance',
      geo_tag: 'Geo Tag',
      excel_sheet: 'Excel Sheet',
    }[uploadTypeFolder] || uploadTypeFolder;

    // Determine the correct target folder for this day and upload type
    const dayFolder = (collegeAssignment.dayFolders || []).find(
      (entry) => Number(entry.day) === Number(uploadRecord.day),
    );

    let targetFolderId = dayFolder ? dayFolder[uploadTypeFolder] : null;

    // Auto-heal: if the day/subfolder mapping is missing (older assignment or a
    // partially-created structure), (re)build it in Google Drive and persist the
    // mapping back onto the trainer's college assignment, then continue.
    if (!targetFolderId) {
      const trainerDoc = await Trainer.findById(uploadRecord.trainerId);
      if (trainerDoc) {
        const hierarchy = await ensureTrainerCollegeHierarchy({
          trainer: trainerDoc,
          collegeName: uploadRecord.collegeName,
          totalDays: 12,
        });

        const meta = (hierarchy.dayFoldersByDayNumber || {})[uploadRecord.day] || {};
        targetFolderId =
          {
            attendance: meta.attendanceFolder?.id,
            geo_tag: meta.geoTagFolder?.id,
            excel_sheet: meta.excelSheetFolder?.id,
          }[uploadTypeFolder] || null;

        const assignment = (trainerDoc.colleges || []).find(
          (c) => String(c.collegeId) === String(uploadRecord.collegeId),
        );
        if (assignment) {
          assignment.dayFolders = mapHierarchyDayFolders(
            hierarchy.dayFoldersByDayNumber,
          );
          if (hierarchy.collegeFolder?.id) {
            assignment.googleDriveFolderId = hierarchy.collegeFolder.id;
          }
          await trainerDoc.save();
        }
      }
    }

    if (!targetFolderId) {
      throw new Error(`Google Drive folder not configured for upload type '${uploadTypeFolder}' on day ${uploadRecord.day}`);
    }

    // Update status to uploading
    uploadRecord.uploadStatus = 'uploading';
    await uploadRecord.save();

    // Upload file with retry logic
    const uploadResult = await uploadFileToGoogleDrive(
      file.path,
      file.originalname,
      targetFolderId,
      3 // 3 retry attempts
    );

    // Update upload record with success
    uploadRecord.uploadStatus = 'success';
    uploadRecord.driveFileId = uploadResult.driveFileId;
    uploadRecord.driveFolderPath = `NM Trainers/${uploadRecord.trainerName}/${uploadRecord.collegeName}/${dayFolderPath}/${uploadTypeFolderDisplay}`;
    uploadRecord.uploadedAt = new Date();
    await uploadRecord.save();

    // Clean up temporary file
    try {
      fs.unlinkSync(file.path);
    } catch (err) {
      console.warn('Could not delete temporary file:', err);
    }

    // Emit success event
    uploadEventEmitter.emit('upload:success', {
      uploadId: uploadRecord._id,
      trainerId: uploadRecord.trainerId,
      fileName: uploadRecord.fileName,
      driveLink: uploadResult.webViewLink,
    });

    console.log(`✅ Upload completed: ${uploadRecord.fileName}`);
  } catch (error) {
    console.error('Google Drive upload error:', error);

    // Update upload record with failure
    uploadRecord.uploadStatus = 'failed';
    uploadRecord.errorLog = {
      message: error.message || error.type,
      code: error.type || 'UNKNOWN_ERROR',
      timestamp: new Date(),
    };
    uploadRecord.retryCount += 1;

    await uploadRecord.save();

    // Log error
    await ErrorLog.create({
      uploadId: uploadRecord._id,
      trainerId: uploadRecord.trainerId,
      errorType: error.type || 'FILE_UPLOAD_FAILED',
      severity: error.type === 'PERMISSION_DENIED' || error.type === 'QUOTA_EXCEEDED' ? 'critical' : 'high',
      message: error.message,
      metadata: {
        trainerId: uploadRecord.trainerId,
        trainerName: uploadRecord.trainerName,
        collegeId: uploadRecord.collegeId,
        collegeName: uploadRecord.collegeName,
        day: uploadRecord.day,
        uploadType: uploadRecord.uploadType,
        fileName: uploadRecord.fileName,
        attemptNumber: uploadRecord.retryCount,
      },
    });

    // Emit failure event
    uploadEventEmitter.emit('upload:failed', {
      uploadId: uploadRecord._id,
      trainerId: uploadRecord.trainerId,
      fileName: uploadRecord.fileName,
      error: error.message,
      retryCount: uploadRecord.retryCount,
    });

    console.error(`❌ Upload failed: ${uploadRecord.fileName} (Attempt ${uploadRecord.retryCount})`);
  }
};

// Get upload history for trainer
export const getUploadHistory = async (req, res) => {
  try {
    const { trainerId, collegeId, day, uploadType } = req.query;
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;

    const skip = (page - 1) * limit;
    const query = {};

    if (trainerId) query.trainerId = trainerId;
    if (collegeId) query.collegeId = collegeId;
    if (day) query.day = parseInt(day);
    if (uploadType) query.uploadType = uploadType;

    const uploads = await TrainerUpload.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await TrainerUpload.countDocuments(query);

    res.status(200).json({
      success: true,
      data: uploads,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get upload history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch upload history',
      error: error.message,
    });
  }
};

// Get upload status
export const getUploadStatus = async (req, res) => {
  try {
    const { uploadId } = req.params;

    const upload = await TrainerUpload.findById(uploadId);

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: 'Upload not found',
      });
    }

    res.status(200).json({
      success: true,
      data: upload,
    });
  } catch (error) {
    console.error('Get upload status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch upload status',
      error: error.message,
    });
  }
};

// Get daily upload summary
export const getDailySummary = async (req, res) => {
  try {
    const { trainerId, collegeId, day } = req.query;

    const query = {};
    if (trainerId) query.trainerId = trainerId;
    if (collegeId) query.collegeId = collegeId;
    if (day) query.day = parseInt(day);

    const uploads = await TrainerUpload.find(query);

    const summary = {
      total: uploads.length,
      success: uploads.filter(u => u.uploadStatus === 'success').length,
      failed: uploads.filter(u => u.uploadStatus === 'failed').length,
      pending: uploads.filter(u => u.uploadStatus === 'pending' || u.uploadStatus === 'uploading').length,
      byType: {
        attendance: uploads.filter(u => u.uploadType === 'attendance').length,
        geo_tag: uploads.filter(u => u.uploadType === 'geo_tag').length,
        excel_sheet: uploads.filter(u => u.uploadType === 'excel_sheet').length,
      },
    };

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Get daily summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily summary',
      error: error.message,
    });
  }
};

export default {
  uploadDailyFile,
  getUploadHistory,
  getUploadStatus,
  getDailySummary,
};
