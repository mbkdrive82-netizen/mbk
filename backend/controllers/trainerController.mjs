import Trainer from '../models/Trainer.mjs';
import College from '../models/College.mjs';
import TrainerUpload from '../models/TrainerUpload.mjs';
import ErrorLog from '../models/ErrorLog.mjs';
import { createRequire } from 'module';

// Reuse the canonical CommonJS Drive hierarchy so that documents AND college
// folders always live under ONE trainer folder (NM Trainers/<Trainer>) using
// the same OAuth2 Drive client. This avoids duplicate trainer folders that
// could otherwise be created by the legacy ESM folder helpers.
const require = createRequire(import.meta.url);
const {
  ensureTrainerCollegeHierarchy,
  ensureTrainerDocumentHierarchy,
} = require('../modules/drive/driveTrainerDocuments.service.js');
const { User, TrainerAssignment } = require('../models');
const {
  resolveTrainerDisplayName,
  syncTrainerAssignmentRecord,
} = require('../utils/trainerAssignmentResolver.js');

// Register new trainer
export const registerTrainer = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, qualifications } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !phone || !qualifications || qualifications.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    // Check if trainer already exists
    const existingTrainer = await Trainer.findOne({ $or: [{ email }, { phone }] });
    if (existingTrainer) {
      return res.status(409).json({
        success: false,
        message: 'Trainer with this email or phone already exists',
      });
    }

    // Create trainer record first so we have a canonical trainerId, then build
    // the ONE trainer Drive folder (NM Trainers/<First Last>/documents) that is
    // shared by both documents and future college uploads. Using the canonical
    // hierarchy here (instead of underscore-named folders) guarantees the
    // college-assignment step reuses the same folder and never duplicates it.
    const trainer = await Trainer.create({
      firstName,
      lastName,
      email,
      phone,
      mobile: phone,
      qualifications,
      registrationStatus: 'pending',
    });

    // Ensure a canonical trainer code (MBK###) exists before building Drive
    // folders. The model only auto-generates trainerId once emailVerified/APPROVED,
    // so we mark this admin-registered trainer's email as verified and persist,
    // which triggers the code generation via the model pre-save hook.
    if (!trainer.trainerId) {
      trainer.emailVerified = true;
      await trainer.save();
    }

    try {
      const hierarchy = await ensureTrainerDocumentHierarchy({ trainer });
      if (hierarchy?.trainerFolder?.id) {
        trainer.driveFolderId = hierarchy.trainerFolder.id;
        trainer.driveFolderName = hierarchy.trainerFolder.name;
        trainer.googleDriveFolderId = hierarchy.trainerFolder.id;
      }
      if (hierarchy?.documentsFolder?.id) {
        trainer.documentsFolderId = hierarchy.documentsFolder.id;
      }
      await trainer.save();
    } catch (error) {
      // Log error but continue - the folder is re-ensured on document/daily upload.
      await ErrorLog.create({
        errorType: error.type || 'FOLDER_CREATION_FAILED',
        severity: 'high',
        message: error.message,
        metadata: {
          trainerName: `${firstName} ${lastName}`.trim(),
          email,
          phone,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: 'Trainer registered successfully',
      data: {
        trainerId: trainer._id,
        email: trainer.email,
        registrationStatus: trainer.registrationStatus,
      },
    });
  } catch (error) {
    console.error('Trainer registration error:', error);
    
    await ErrorLog.create({
      errorType: 'VALIDATION_ERROR',
      severity: 'high',
      message: error.message,
      stack: error.stack,
      metadata: req.body,
    });

    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message,
    });
  }
};

// Get trainer profile
export const getTrainerProfile = async (req, res) => {
  try {
    const { trainerId } = req.params;

    const trainer = await Trainer.findById(trainerId).populate('colleges.collegeId');

    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: 'Trainer not found',
      });
    }

    // Get recent uploads
    const recentUploads = await TrainerUpload.find({
      trainerId,
    })
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      data: {
        trainer,
        recentUploads,
      },
    });
  } catch (error) {
    console.error('Get trainer profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trainer profile',
      error: error.message,
    });
  }
};

// Get all trainers (admin)
export const getAllTrainers = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;

    const skip = (page - 1) * limit;
    const query = {};

    if (status) query.registrationStatus = status;
    if (search) {
      query.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
      ];
    }

    const trainers = await Trainer.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Trainer.countDocuments(query);

    res.status(200).json({
      success: true,
      data: trainers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get all trainers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trainers',
      error: error.message,
    });
  }
};

// Approve trainer registration
export const approveTrainer = async (req, res) => {
  try {
    const { trainerId } = req.params;

    const trainer = await Trainer.findByIdAndUpdate(
      trainerId,
      {
        registrationStatus: 'approved',
        verificationStatus: 'VERIFIED',
        status: 'APPROVED',
        documentStatus: 'approved',
      },
      { new: true, runValidators: true }
    );

    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: 'Trainer not found',
      });
    }

    // Activate the linked login account so the trainer can sign in immediately
    // after approval (canonical-registered trainers have a User; admin-only
    // trainers may not, in which case there is nothing to activate).
    if (trainer.userId) {
      await User.findByIdAndUpdate(trainer.userId, {
        isActive: true,
        accountStatus: 'active',
        emailVerified: true,
        isEmailVerified: true,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Trainer approved successfully',
      data: trainer,
    });
  } catch (error) {
    console.error('Approve trainer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve trainer',
      error: error.message,
    });
  }
};

// Assign college to trainer
export const assignCollegeToTrainer = async (req, res) => {
  try {
    const { trainerId, collegeId, collegeName } = req.body;

    // Validation
    if (!trainerId || !collegeId || !collegeName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    // Get trainer and college
    const trainer = await Trainer.findById(trainerId);
    const college = await College.findById(collegeId);

    if (!trainer || !college) {
      return res.status(404).json({
        success: false,
        message: 'Trainer or College not found',
      });
    }

    // Check if already assigned
    const alreadyAssigned = (trainer.colleges || []).some(
      (c) => String(c.collegeId) === String(collegeId),
    );
    if (alreadyAssigned) {
      return res.status(409).json({
        success: false,
        message: 'College already assigned to this trainer',
      });
    }

    // Deactivate previous college entries so the dashboard shows the latest one.
    if (Array.isArray(trainer.colleges)) {
      trainer.colleges.forEach((entry) => {
        if (entry && String(entry.collegeId) !== String(collegeId)) {
          entry.active = false;
          if (entry.status === 'active') entry.status = 'completed';
        }
      });
    }

    // Build the full Google Drive hierarchy for this college assignment.
    // ensureTrainerCollegeHierarchy reuses the trainer's existing documents
    // folder (NM Trainers/<Trainer>) so documents and college folders always
    // share ONE trainer folder, then creates:
    //   <College>/Day 1..12/{Attendance, Geo Tag, Excel Sheet}
    let collegeFolderId = null;
    let collegeLink = null;
    let dayFoldersForResponse = {};
    let mappedDayFolders = [];

    try {
      const hierarchy = await ensureTrainerCollegeHierarchy({
        trainer,
        collegeName,
        totalDays: 12,
      });

      collegeFolderId = hierarchy.collegeFolder?.id || null;
      collegeLink = hierarchy.collegeFolder?.link || null;

      // Persist the shared trainer root folder id (reused with documents).
      if (hierarchy.trainerFolder?.id) {
        trainer.driveFolderId = hierarchy.trainerFolder.id;
        trainer.driveFolderName =
          hierarchy.trainerFolder.name || trainer.driveFolderName;
        trainer.googleDriveFolderId = hierarchy.trainerFolder.id;
      }

      const dayFoldersByDayNumber = hierarchy.dayFoldersByDayNumber || {};
      dayFoldersForResponse = dayFoldersByDayNumber;
      mappedDayFolders = Object.keys(dayFoldersByDayNumber)
        .map((dayString) => {
          const dayNumber = Number(dayString);
          const meta = dayFoldersByDayNumber[dayString] || {};
          return {
            day: dayNumber,
            dayFolderId: meta.id || null,
            attendance: meta.attendanceFolder?.id || null,
            geo_tag: meta.geoTagFolder?.id || null,
            excel_sheet: meta.excelSheetFolder?.id || null,
          };
        })
        .sort((a, b) => a.day - b.day);
    } catch (error) {
      await ErrorLog.create({
        errorType: error.type || 'FOLDER_CREATION_FAILED',
        severity: 'high',
        message: error.message,
        metadata: {
          trainerId,
          collegeName,
          collegeId,
        },
      });
      // Continue anyway - the assignment is still recorded; the Drive structure
      // is re-ensured automatically on the trainer's first daily upload.
    }

    // Add college assignment to trainer record
    trainer.colleges.push({
      collegeId,
      collegeName,
      googleDriveFolderId: collegeFolderId,
      googleDriveFolderName: collegeName,
      collegeLink,
      dayFolders: mappedDayFolders,
      assignedDate: new Date(),
      status: 'active',
    });

    if (collegeFolderId) {
      trainer.collegeDriveFolderId = collegeFolderId;
    }

    trainer.collegeId = college._id;

    await trainer.save();

    // Keep legacy assignment + college linkage in sync with trainer.colleges[].
    const trainerName = resolveTrainerDisplayName(trainer);
    if (trainerName) {
      await syncTrainerAssignmentRecord({
        trainer,
        trainerName,
        collegeName,
        driveFolderId: collegeFolderId,
      });
    }

    if (!college.trainers?.some((id) => String(id) === String(trainer._id))) {
      college.trainers = college.trainers || [];
      college.trainers.push(trainer._id);
    }

    // Send assignment email
    try {
      const emailModule = await import('../utils/emailService.js');
      const sendTrainerCollegeAssignmentEmail =
        emailModule.sendTrainerCollegeAssignmentEmail ||
        emailModule.default?.sendTrainerCollegeAssignmentEmail;
      if (typeof sendTrainerCollegeAssignmentEmail === 'function') {
        await sendTrainerCollegeAssignmentEmail(
          trainer.email,
          `${trainer.firstName || ''} ${trainer.lastName || ''}`.trim() || trainer.email,
          collegeName,
          collegeLink,
        );
      } else {
        console.warn('sendTrainerCollegeAssignmentEmail is not available from emailService module');
      }
    } catch (emailError) {
      console.error('Failed to send college assignment email:', emailError);
    }

    // Increment total trainers for college
    college.totalTrainers += 1;
    await college.save();

    res.status(200).json({
      success: true,
      message: 'College assigned to trainer successfully',
      data: {
        trainerId,
        collegeId,
        collegeName,
        googleDriveFolderId: collegeFolderId,
        collegeLink,
        dayFolders: mappedDayFolders,
        dayFoldersDetail: dayFoldersForResponse,
      },
    });
  } catch (error) {
    console.error('Assign college error:', error);
    
    await ErrorLog.create({
      errorType: 'DATABASE_ERROR',
      severity: 'high',
      message: error.message,
      metadata: req.body,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to assign college',
      error: error.message,
    });
  }
};

// Create a college (admin) — idempotent on name so repeated submits don't duplicate.
export const createCollege = async (req, res) => {
  try {
    const { name, code, city, state, trainingDays } = req.body;
    const normalizedName = String(name || '').trim();

    if (!normalizedName) {
      return res.status(400).json({ success: false, message: 'College name is required' });
    }

    const existing = await College.findOne({
      name: { $regex: `^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });
    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'College already exists',
        data: existing,
        duplicate: true,
      });
    }

    // Generate a unique code if none provided.
    let collegeCode = String(code || '').trim().toUpperCase();
    if (!collegeCode) {
      const slug = normalizedName.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'CLG';
      collegeCode = `${slug}${Date.now().toString().slice(-5)}`;
    }
    while (await College.findOne({ code: collegeCode })) {
      collegeCode = `${collegeCode}${Math.floor(Math.random() * 10)}`;
    }

    const college = await College.create({
      name: normalizedName,
      code: collegeCode,
      city: city ? String(city).trim() : undefined,
      state: state ? String(state).trim() : undefined,
      trainingDays: Number(trainingDays) > 0 ? Number(trainingDays) : 12,
      totalTrainers: 0,
      isActive: true,
    });

    res.status(201).json({ success: true, message: 'College created', data: college });
  } catch (error) {
    console.error('Create college error:', error);
    res.status(500).json({ success: false, message: 'Failed to create college', error: error.message });
  }
};

// List colleges (admin) for assignment selection.
export const listColleges = async (req, res) => {
  try {
    const { search } = req.query;
    const query = {};
    if (search) query.name = new RegExp(String(search), 'i');

    const colleges = await College.find(query).sort({ createdAt: -1 }).limit(500);
    res.status(200).json({ success: true, data: colleges });
  } catch (error) {
    console.error('List colleges error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch colleges', error: error.message });
  }
};

// Get trainer's assigned colleges
export const getTrainerColleges = async (req, res) => {
  try {
    const { trainerId } = req.params;

    const trainer = await Trainer.findById(trainerId).populate('colleges.collegeId');

    if (!trainer) {
      return res.status(404).json({
        success: false,
        message: 'Trainer not found',
      });
    }

    res.status(200).json({
      success: true,
      data: trainer.colleges,
    });
  } catch (error) {
    console.error('Get trainer colleges error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trainer colleges',
      error: error.message,
    });
  }
};

export default {
  registerTrainer,
  getTrainerProfile,
  getAllTrainers,
  approveTrainer,
  assignCollegeToTrainer,
  getTrainerColleges,
  createCollege,
  listColleges,
};
