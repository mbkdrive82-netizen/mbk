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
router.post('/attendance/submit', authenticate, uploadMiddle, async (req, res) => {
  try {
    const { trainer_id, attendance_date, status } = req.body;
    // Parse optional location if provided
    let location = req.body.location;
    if (typeof location === 'string') {
      try { location = JSON.parse(location); } catch (e) { }
    }
    const { latitude, longitude, accuracy } = location || {};
    // Validate required fields
    if (!trainer_id || !attendance_date || !status) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    // Process uploaded files
    const excelFile = req.files && req.files['attendanceExcel'] ? req.files['attendanceExcel'][0] : null;
    const photoFile = req.files && req.files['studentsPhoto'] ? req.files['studentsPhoto'][0] : null;
    const pdfFile = req.files && req.files['attendancePdf'] ? req.files['attendancePdf'][0] : null;

    let attendanceExcelUrl = null;
    let studentsPhotoUrl = null;
    let attendancePdfUrl = null;

    if (excelFile) {
      attendanceExcelUrl = `/uploads/attendance/excels/${excelFile.filename}`;
    }
    if (photoFile) {
      studentsPhotoUrl = `/uploads/attendance/photos/${photoFile.filename}`;
    }
    if (pdfFile) {
      attendancePdfUrl = `/uploads/attendance/pdfs/${pdfFile.filename}`;
    }

    // Create Attendance record
    const attendanceRecord = await Attendance.create({
      trainerId: trainer_id,
      trainerName: req.user.name || 'Unknown',
      attendanceDate: attendance_date,
      status,
      date: new Date(attendance_date || Date.now()),
      attendanceExcelUrl,
      studentsPhotoUrl,
      attendancePdfUrl,
      scannedAttendancePdfUrl: attendancePdfUrl,
      uploadedAt: new Date(),
      latitude,
      longitude,
      accuracy,
    });

    return res.json({ success: true, attendanceId: attendanceRecord._id });
  } catch (err) {
    console.error('Attendance submit error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
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
