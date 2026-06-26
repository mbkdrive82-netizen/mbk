const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const { StudentActivity, Attendance } = require('../models');

// Ensure imageDir exists
const imageDir = './uploads/attendance/images';
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imageDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const { uploadAttendance } = require('../config/upload');
const uploadMiddle = uploadAttendance;
const uploadSingleImage = multer({ storage }).single('image');

// Helper to upload files to trainer's specific day-folder on Google Drive
async function uploadTrainerFileToDrive({ trainer, collegeId, dayNumber, file, isExcel }) {
  try {
    const { isTrainingDriveEnabled, uploadToDriveWithRetry } = require("../modules/drive/driveGateway");
    if (!isTrainingDriveEnabled()) return null;

    // Fetch the freshest trainer document to ensure dayFolders are present
    const { Trainer } = require("../models");
    const freshTrainer = await Trainer.findById(trainer._id);
    if (!freshTrainer) {
      console.warn(`[DRIVE-UPLOAD] Trainer ${trainer._id} not found in DB`);
      return null;
    }

    const collegeEntry = freshTrainer.colleges?.find(c => String(c.collegeId) === String(collegeId));
    let targetFolderId = null;

    if (collegeEntry && collegeEntry.dayFolders) {
      const dayFolder = collegeEntry.dayFolders.find(df => df.day === dayNumber);
      if (dayFolder) {
        targetFolderId = isExcel ? dayFolder.attendance : dayFolder.geo_tag;
      }
    }

    if (!targetFolderId) {
      targetFolderId = freshTrainer.collegeDriveFolderId || freshTrainer.driveFolderId;
    }

    if (!targetFolderId) {
      console.warn(`[DRIVE-UPLOAD] Target folder not found for trainer ${freshTrainer._id}`);
      return null;
    }

    const fileBuffer = await fs.promises.readFile(file.path);
    const mimeType = file.mimetype;
    const originalName = file.originalname || path.basename(file.path);

    const driveUpload = await uploadToDriveWithRetry(
      {
        fileBuffer,
        mimeType,
        originalName,
        folderId: targetFolderId,
        fileName: originalName
      },
      { attempts: 3, initialDelayMs: 500 }
    );

    console.log(`[DRIVE-UPLOAD] File ${originalName} uploaded to Drive folder ${targetFolderId}`);
    return driveUpload;
  } catch (error) {
    console.error("[DRIVE-UPLOAD] Error uploading file:", error.message);
    return null;
  }
}

// Fetch student activities & attendance submissions
router.get('/', authenticate, async (req, res) => {
  try {
    // If trainer, only return their activities
    const filter = {};
    if (req.user && req.user.role === 'trainer') {
      filter.trainerId = req.user.id;
    }
    const activities = await StudentActivity.find(filter).sort({ uploadedAt: -1 });
    return res.json({ success: true, activities });
  } catch (err) {
    console.error('Fetch activities error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Attendance submission with geo-tagged check-in and optional check-out image
const normalizeAttendanceStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  switch (normalized) {
    case 'present':
      return 'Present';
    case 'absent':
      return 'Absent';
    case 'leave':
      return 'Leave';
    case 'late':
      return 'Late';
    case 'pending':
      return 'Pending';
    case 'cancelled':
      return 'cancelled';
    default:
      return null;
  }
};

router.post('/attendance/submit', authenticate, uploadMiddle, async (req, res) => {
  try {
    const trainerIdRaw = req.body.trainer_id || req.body.trainerId || req.body.trainerid || req.body.trainer || null;
    const attendanceDateRaw = req.body.attendance_date || req.body.attendanceDate || req.body.date || null;
    const statusRaw = req.body.status || req.body.attendance_status || req.body.attendanceStatus || null;
    const normalizedStatus = normalizeAttendanceStatus(statusRaw);

    // Parse check-in and check-out times
    const checkInTime = req.body.checkInTime || req.body.check_in_time || new Date().toTimeString().slice(0, 5);
    const checkOutTime = req.body.checkOutTime || req.body.check_out_time || null;

    // Parse optional location if provided
    let location = req.body.location || req.body.locationData || req.body.geoLocation || null;
    if (typeof location === 'string') {
      try {
        location = JSON.parse(location);
      } catch (e) {
        // Keep as string to allow fallback parsing below
      }
    }
    if (location && typeof location === 'string') {
      const parsed = location.match(/(-?\d+\.\d+).*(-?\d+\.\d+)/);
      if (parsed) {
        location = {
          latitude: Number(parsed[1]),
          longitude: Number(parsed[2]),
        };
      }
    }
    const latitude = location?.latitude || location?.lat || null;
    const longitude = location?.longitude || location?.lng || null;
    const accuracy = location?.accuracy || null;

    const trainerId = trainerIdRaw ? String(trainerIdRaw).trim() : null;
    const attendanceDate = attendanceDateRaw ? String(attendanceDateRaw).trim() : null;

    // Validate required fields
    if (!trainerId || !attendanceDate || !normalizedStatus) {
      return res.status(400).json({ success: false, message: 'Missing or invalid required fields' });
    }

    // Debug file upload metadata when available
    if (process.env.NODE_ENV !== 'production') {
      console.log('[ATTENDANCE SUBMIT] req.body keys:', Object.keys(req.body));
      console.log('[ATTENDANCE SUBMIT] req.files keys:', req.files ? Object.keys(req.files) : []);
    }
    // Process uploaded files
    const excelFile = req.files && req.files['attendanceExcel'] ? req.files['attendanceExcel'][0] : null;
    const photoFile = req.files && req.files['studentsPhoto'] ? req.files['studentsPhoto'][0] : null;
    const pdfFile = req.files && req.files['attendancePdf'] ? req.files['attendancePdf'][0] : null;
    const checkInFile = req.files && (req.files['check_in_image'] || req.files['clock_in_image'])
      ? (req.files['check_in_image'] || req.files['clock_in_image'])[0]
      : null;
    const checkOutFile = req.files && (req.files['check_out_image'] || req.files['clock_out_image'])
      ? (req.files['check_out_image'] || req.files['clock_out_image'])[0]
      : null;

    let attendanceExcelUrl = null;
    let studentsPhotoUrl = null;
    let attendancePdfUrl = null;
    let checkInImageUrl = null;
    let checkOutImageUrl = null;

    if (excelFile) {
      attendanceExcelUrl = `/uploads/attendance/excels/${excelFile.filename}`;
    }
    if (photoFile) {
      studentsPhotoUrl = `/uploads/attendance/photos/${photoFile.filename}`;
    }
    if (pdfFile) {
      attendancePdfUrl = `/uploads/attendance/pdfs/${pdfFile.filename}`;
    }
    if (checkInFile) {
      checkInImageUrl = `/uploads/attendance/images/${checkInFile.filename}`;
    }
    if (checkOutFile) {
      checkOutImageUrl = `/uploads/attendance/images/${checkOutFile.filename}`;
    }

    const attendancePayload = {
      trainerId,
      trainerName: req.user.name || 'Unknown',
      attendanceDate,
      status: normalizedStatus,
      date: new Date(attendanceDate || Date.now()),
      checkInTime,
      checkOutTime,
      attendanceExcelUrl,
      studentsPhotoUrl,
      attendancePdfUrl,
      scannedAttendancePdfUrl: attendancePdfUrl,
      uploadedAt: new Date(),
      latitude,
      longitude,
      accuracy,
    };

    if (checkInImageUrl) {
      attendancePayload.checkIn = {
        time: new Date(),
        location: {
          lat: latitude,
          lng: longitude,
          accuracy,
          address: null,
        },
      };
      attendancePayload.imageUrl = checkInImageUrl;
      attendancePayload.studentsPhotoUrl = attendancePayload.studentsPhotoUrl || checkInImageUrl;
    }

    if (checkOutImageUrl) {
      attendancePayload.checkOut = {
        time: new Date(),
        finalStatus: 'COMPLETED',
        location: {
          lat: latitude,
          lng: longitude,
          accuracy,
          address: null,
        },
      };
      attendancePayload.checkOutGeoImageUrl = checkOutImageUrl;
      attendancePayload.checkOutGeoImageUrls = [checkOutImageUrl];
      attendancePayload.finalStatus = 'COMPLETED';
    }

    // Find if there is an existing attendance record for today to merge/update
    const targetDate = new Date(attendanceDate || Date.now());
    const todayStart = new Date(targetDate);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(targetDate);
    todayEnd.setHours(23, 59, 59, 999);

    let attendanceRecord = await Attendance.findOne({
      trainerId,
      date: { $gte: todayStart, $lte: todayEnd }
    });

    if (attendanceRecord) {
      if (attendanceExcelUrl) attendanceRecord.attendanceExcelUrl = attendanceExcelUrl;
      if (studentsPhotoUrl) attendanceRecord.studentsPhotoUrl = studentsPhotoUrl;
      if (attendancePdfUrl) {
        attendanceRecord.attendancePdfUrl = attendancePdfUrl;
        attendanceRecord.scannedAttendancePdfUrl = attendancePdfUrl;
      }
      if (normalizedStatus) attendanceRecord.status = normalizedStatus;
      if (checkInTime) attendanceRecord.checkInTime = checkInTime;
      if (checkOutTime) attendanceRecord.checkOutTime = checkOutTime;

      if (checkInImageUrl) {
        attendanceRecord.imageUrl = checkInImageUrl;
        attendanceRecord.studentsPhotoUrl = attendanceRecord.studentsPhotoUrl || checkInImageUrl;
        attendanceRecord.checkIn = {
          time: attendanceRecord.checkIn?.time || new Date(),
          location: {
            lat: latitude,
            lng: longitude,
            accuracy,
            address: attendanceRecord.checkIn?.location?.address || null,
          }
        };
      }

      if (checkOutImageUrl) {
        attendanceRecord.checkOut = {
          time: new Date(),
          finalStatus: 'COMPLETED',
          location: {
            lat: latitude,
            lng: longitude,
            accuracy,
            address: attendanceRecord.checkOut?.location?.address || null,
          }
        };
        attendanceRecord.checkOutGeoImageUrl = checkOutImageUrl;
        attendanceRecord.checkOutGeoImageUrls = [checkOutImageUrl];
        attendanceRecord.finalStatus = 'COMPLETED';
        attendanceRecord.completedAt = new Date();
      }
      await attendanceRecord.save();
    } else {
      attendanceRecord = await Attendance.create(attendancePayload);
    }

    // Asynchronously upload all files to Google Drive in the background
    try {
      const { Trainer, Schedule } = require('../models');
      const { getActiveAssignment } = require("../utils/trainerAssignmentResolver");
      const trainerDoc = await Trainer.findById(trainerId);
      const activeAssign = trainerDoc ? await getActiveAssignment(trainerDoc) : null;
      const resolvedCollegeId = attendanceRecord.collegeId || activeAssign?.college?._id;

      // Dynamically resolve dayNumber from schedule
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const schedule = trainerDoc ? await Schedule.findOne({
        trainerId: trainerDoc._id,
        scheduledDate: { $gte: todayStart, $lte: todayEnd },
        isActive: { $ne: false }
      }) : null;
      const dayNumber = schedule?.dayNumber || attendanceRecord.dayNumber || 1;

      // Keep Attendance DB record in sync with dayNumber & collegeId if missing
      if (!attendanceRecord.dayNumber || !attendanceRecord.collegeId) {
        await Attendance.findByIdAndUpdate(attendanceRecord._id, {
          $set: {
            dayNumber: dayNumber,
            collegeId: resolvedCollegeId
          }
        });
      }

      if (trainerDoc && resolvedCollegeId) {
        if (excelFile) {
          uploadTrainerFileToDrive({
            trainer: trainerDoc,
            collegeId: resolvedCollegeId,
            dayNumber,
            file: excelFile,
            isExcel: true
          }).then(driveFile => {
            const fileId = driveFile?.fileId || driveFile?.driveFileId || driveFile?.id;
            if (fileId) {
              Attendance.findByIdAndUpdate(attendanceRecord._id, {
                $set: { "driveAssets.excelDriveFileId": fileId, driveSyncStatus: "SYNCED" }
              }).catch(err => console.error("Error updating excel drive ID:", err));
            }
          }).catch(err => console.error("Drive upload failed for excel:", err));
        }

        if (pdfFile) {
          uploadTrainerFileToDrive({
            trainer: trainerDoc,
            collegeId: resolvedCollegeId,
            dayNumber,
            file: pdfFile,
            isExcel: true
          }).then(driveFile => {
            const fileId = driveFile?.fileId || driveFile?.driveFileId || driveFile?.id;
            if (fileId) {
              Attendance.findByIdAndUpdate(attendanceRecord._id, {
                $set: { "attendancePdfDriveFileId": fileId }
              }).catch(err => console.error("Error updating pdf drive ID:", err));
            }
          }).catch(err => console.error("Drive upload failed for pdf:", err));
        }

        if (photoFile) {
          uploadTrainerFileToDrive({
            trainer: trainerDoc,
            collegeId: resolvedCollegeId,
            dayNumber,
            file: photoFile,
            isExcel: false
          }).catch(err => console.error("Drive upload failed for photo:", err));
        }

        if (checkInFile) {
          uploadTrainerFileToDrive({
            trainer: trainerDoc,
            collegeId: resolvedCollegeId,
            dayNumber,
            file: checkInFile,
            isExcel: false
          }).then(driveFile => {
            const fileId = driveFile?.fileId || driveFile?.driveFileId || driveFile?.id;
            if (fileId) {
              Attendance.findByIdAndUpdate(attendanceRecord._id, {
                $set: { "checkIn.driveFileId": fileId }
              }).catch(err => console.error("Error updating checkIn drive ID:", err));
            }
          }).catch(err => console.error("Drive upload failed for checkIn:", err));
        }

        if (checkOutFile) {
          uploadTrainerFileToDrive({
            trainer: trainerDoc,
            collegeId: resolvedCollegeId,
            dayNumber,
            file: checkOutFile,
            isExcel: false
          }).then(driveFile => {
            const fileId = driveFile?.fileId || driveFile?.driveFileId || driveFile?.id;
            if (fileId) {
              Attendance.findByIdAndUpdate(attendanceRecord._id, {
                $set: { "checkOut.driveFileId": fileId }
              }).catch(err => console.error("Error updating checkOut drive ID:", err));
            }
          }).catch(err => console.error("Drive upload failed for checkOut:", err));
        }
      }
    } catch (driveSyncErr) {
      console.error("[DRIVE-SYNC-TRIGGER] Failed to initiate async uploads:", driveSyncErr.message);
    }

    return res.json({ success: true, attendanceId: attendanceRecord._id });
  } catch (err) {
    console.error('Attendance submit error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.use('/attendance/submit', (err, req, res, next) => {
  if (err) {
    const isMulterError = err.name === 'MulterError' || err.code === 'LIMIT_UNEXPECTED_FILE';
    const isUnsupportedField = String(err.message || '').includes('Unsupported upload field');
    if (isMulterError || isUnsupportedField) {
      console.error('Attendance submit upload error:', err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }
  next(err);
});

// Live class image upload endpoint
router.post('/class/image-upload', authenticate, uploadSingleImage, async (req, res) => {
  try {
    const { class_id, trainer_id, timestamp } = req.body;
    const geoImage = req.file;
    if (!class_id || !trainer_id || !geoImage) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const activity = await StudentActivity.create({
      photoUrl: `/uploads/attendance/images/${geoImage.filename}`,
      classId: class_id,
      trainerId: trainer_id,
      trainerName: req.user.name || 'Unknown',
      uploadedAt: timestamp || new Date().toISOString(),
      latitude: parseFloat(req.body.geo_latitude),
      longitude: parseFloat(req.body.geo_longitude),
      accuracy: parseFloat(req.body.geo_accuracy),
      address: null,
    });
    return res.json({ success: true, image_id: activity._id, geo_status: 'verified', archive_location: activity.photoUrl, metadata: { file_size: geoImage.size, file_hash: null } });
  } catch (err) {
    console.error('Class image upload error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
