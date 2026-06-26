import express from 'express';
import multer from 'multer';
import path from 'path';
import * as trainerController from '../controllers/trainerController.mjs';
import * as uploadController from '../controllers/uploadController.mjs';
import * as errorLogController from '../controllers/errorLogController.mjs';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'backend/tmp/uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Allow common office and archive formats
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/zip',
      'application/x-rar-compressed',
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

// ============================================
// TRAINER ROUTES
// ============================================

// Register new trainer (public)
router.post('/trainers/register', trainerController.registerTrainer);

// Get trainer profile
router.get('/trainers/:trainerId', trainerController.getTrainerProfile);

// Get all trainers (admin)
router.get('/trainers', trainerController.getAllTrainers);

// Approve trainer (admin)
router.patch('/trainers/:trainerId/approve', trainerController.approveTrainer);

// Assign college to trainer (admin)
router.post('/trainers/assign-college', trainerController.assignCollegeToTrainer);

// Get trainer's colleges
router.get('/trainers/:trainerId/colleges', trainerController.getTrainerColleges);

// ============================================
// COLLEGE ROUTES (admin)
// ============================================

// Create a college
router.post('/colleges', trainerController.createCollege);

// List colleges (for assignment selection)
router.get('/colleges', trainerController.listColleges);

// ============================================
// UPLOAD ROUTES
// ============================================

// Upload daily file
router.post('/uploads/daily', upload.single('file'), uploadController.uploadDailyFile);

// Get upload history
router.get('/uploads/history', uploadController.getUploadHistory);

// Get upload status
router.get('/uploads/:uploadId/status', uploadController.getUploadStatus);

// Get daily summary
router.get('/uploads/summary/daily', uploadController.getDailySummary);

// ============================================
// ERROR LOG ROUTES (Admin)
// ============================================

// Get all error logs
router.get('/errors', errorLogController.getErrorLogs);

// Get error log detail
router.get('/errors/:errorId', errorLogController.getErrorLogDetail);

// Mark error as resolved
router.patch('/errors/:errorId/resolve', errorLogController.resolveError);

// Get error statistics
router.get('/errors/stats/overview', errorLogController.getErrorStats);

// Get critical errors
router.get('/errors/critical/list', errorLogController.getCriticalErrors);

// Delete old error logs (admin maintenance)
router.delete('/errors/maintenance/old', errorLogController.deleteOldErrorLogs);

export default router;
