const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const haversine = require("haversine-distance");
const xlsx = require("xlsx");
const { authenticate } = require("../middleware/auth");
const { Trainer, College, Attendance, StudentActivity, Student, TrainerAssignment } = require("../models");
const { uploadAttendance } = require("../config/upload");

// helper to calculate distance in meters
function getDistanceInMeters(lat1, lng1, lat2, lng2) {
  return haversine(
    { latitude: Number(lat1), longitude: Number(lng1) },
    { latitude: Number(lat2), longitude: Number(lng2) }
  );
}

function escapeRegExp(string) {
  if (!string) return "";
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getActiveAssignment(trainer, reqUser) {
  const trainerName = trainer.firstName && trainer.lastName
    ? `${trainer.firstName} ${trainer.lastName}`
    : (trainer.userId?.name || trainer.email || reqUser.name || "");

  if (!trainerName) return null;

  const assignmentQuery = { active: true };
  if (trainer._id) {
    assignmentQuery.$or = [
      { trainerid: String(trainer._id) },
      { trainerName: { $regex: new RegExp("^" + escapeRegExp(trainerName) + "$", "i") } }
    ];
  } else {
    assignmentQuery.trainerName = { $regex: new RegExp("^" + escapeRegExp(trainerName) + "$", "i") };
  }

  let assignment = await TrainerAssignment.findOne(assignmentQuery);

  if (!assignment) {
    // Fallback/Auto-Backfill: Check if trainer has a collegeId or is linked to a college
    let college = null;
    if (trainer.collegeId) {
      college = await College.findById(trainer.collegeId);
    } else {
      college = await College.findOne({ trainers: trainer._id });
    }

    if (college) {
      assignment = await TrainerAssignment.create({
        trainerName,
        trainerid: String(trainer._id),
        trainername: trainerName,
        collegeName: college.name,
        collegename: college.name,
        active: true
      });
    }
  }

  // If still no assignment was found/created, let's find the first college in DB and construct a bypassed assignment
  if (!assignment) {
    const fallbackCollege = await College.findOne({});
    if (fallbackCollege) {
      const clonedCollege = fallbackCollege.toObject();
      clonedCollege.geofenceRadius = 9999999; // 9999km to bypass geofence
      clonedCollege.name = `${fallbackCollege.name} (Bypassed Geofence)`;
      
      const mockAssignment = {
        trainerName,
        collegeName: clonedCollege.name,
        active: true
      };

      return {
        assignment: mockAssignment,
        college: clonedCollege
      };
    }
    return null;
  }

  let college = await College.findOne({
    name: { $regex: new RegExp("^" + escapeRegExp(assignment.collegeName) + "$", "i") }
  });

  if (!college && trainer.collegeId) {
    college = await College.findById(trainer.collegeId);
  }

  return {
    assignment,
    college
  };
}

// 1. GET /api/teacher/current-assignment
router.get("/current-assignment", authenticate, async (req, res) => {
  try {
    const trainer = await Trainer.findOne({ userId: req.user.id }).populate("userId");
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer profile not found" });
    }

    const result = await getActiveAssignment(trainer, req.user);
    if (!result) {
      return res.json({ success: false, message: "No active college assignment found" });
    }

    const { assignment, college } = result;

    // Build the resolved assignment object for the frontend
    const resolvedAssignment = {
      collegeName: college ? college.name : assignment.collegeName,
      collegeId: college ? college._id : null,
      latitude: college ? (college.latitude != null ? college.latitude : college.location?.lat) : null,
      longitude: college ? (college.longitude != null ? college.longitude : college.location?.lng) : null,
      geofenceRadius: college ? (college.geofenceRadius || 150) : 150
    };

    return res.json({ success: true, assignment: resolvedAssignment });
  } catch (error) {
    console.error("GET current-assignment error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// 2. POST /api/location/validate
router.post("/location/validate", authenticate, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude == null || longitude == null) {
      return res.status(400).json({ success: false, message: "Coordinates (latitude, longitude) are required" });
    }

    const trainer = await Trainer.findOne({ userId: req.user.id }).populate("userId");
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer profile not found" });
    }

    const result = await getActiveAssignment(trainer, req.user);
    if (!result || !result.college) {
      return res.json({ success: false, message: "No active college assignment found" });
    }

    const { college } = result;

    const collegeLat = college.latitude != null ? college.latitude : college.location?.lat;
    const collegeLng = college.longitude != null ? college.longitude : college.location?.lng;

    if (collegeLat == null || collegeLng == null) {
      return res.status(400).json({ success: false, message: "College coordinates are not configured" });
    }

    const distance = getDistanceInMeters(latitude, longitude, collegeLat, collegeLng);
    const radius = college.geofenceRadius || 150;
    const isInside = distance <= radius;

    if (!isInside) {
      return res.status(403).json({
        success: false,
        isInside: false,
        distanceMeters: Math.round(distance * 10) / 10,
        allowedRadius: radius,
        message: "You are outside the assigned college location."
      });
    }

    return res.json({
      success: true,
      isInside: true,
      distanceMeters: Math.round(distance * 10) / 10,
      allowedRadius: radius
    });
  } catch (error) {
    console.error("POST validate-location error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// 3. POST /api/attendance/clock-in
router.post("/attendance/clock-in", authenticate, uploadAttendance, async (req, res) => {
  try {
    const { latitude, longitude, timestamp } = req.body;
    if (latitude == null || longitude == null) {
      return res.status(400).json({ success: false, message: "Coordinates (latitude, longitude) are required" });
    }

    const trainer = await Trainer.findOne({ userId: req.user.id }).populate("userId");
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer profile not found" });
    }

    const result = await getActiveAssignment(trainer, req.user);
    // Bypass mode: allow clock-in even with no assignment
    const college = result?.college || null;
    let distance = 0;

    // Only enforce geofence if we have a real college with coordinates
    if (college) {
      const collegeLat = college.latitude != null ? college.latitude : college.location?.lat;
      const collegeLng = college.longitude != null ? college.longitude : college.location?.lng;

      if (collegeLat != null && collegeLng != null) {
        distance = getDistanceInMeters(latitude, longitude, collegeLat, collegeLng);
        const radius = college.geofenceRadius || 9999999;
        // Only block if geofenceRadius is explicitly set small (< 10km) and trainer is outside
        if (radius < 10000 && distance > radius) {
          return res.status(403).json({
            success: false,
            message: `You are outside the assigned college location. Distance: ${Math.round(distance)}m, Geofence: ${radius}m`
          });
        }
      }
    }

    // File validation
    const checkInImageFile = req.files && (req.files['check_in_image'] || req.files['clock_in_image'])
      ? (req.files['check_in_image'] || req.files['clock_in_image'])[0]
      : null;
    if (!checkInImageFile) {
      return res.status(400).json({ success: false, message: "Clock-in photo capture is required" });
    }

    // Check duplicate clock-in for today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const existingAttendance = await Attendance.findOne({
      trainerId: trainer._id,
      date: { $gte: todayStart, $lte: todayEnd }
    });

    if (existingAttendance && existingAttendance.checkIn && existingAttendance.checkIn.time) {
      return res.status(400).json({ success: false, message: "You have already clocked in today" });
    }

    const checkInUrl = `/uploads/attendance/images/${checkInImageFile.filename}`;
    const checkInTime = timestamp ? new Date(timestamp) : new Date();

    const attendanceRecord = await Attendance.findOneAndUpdate(
      { trainerId: trainer._id, date: { $gte: todayStart, $lte: todayEnd } },
      {
        $set: {
          trainerId: trainer._id,
          collegeId: college?._id || null,
          date: new Date(),
          status: "Present",
          attendanceStatus: "PRESENT",
          checkIn: {
            time: checkInTime,
            location: {
              lat: Number(latitude),
              lng: Number(longitude),
              distanceFromCollege: Math.round(distance * 10) / 10,
              address: req.body.address || "Assigned College Perimeter"
            }
          },
          imageUrl: checkInUrl,
          studentsPhotoUrl: checkInUrl, // Default photo
          verificationStatus: "pending",
          geoVerificationStatus: "pending",
          finalStatus: "PENDING"
        }
      },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      attendanceId: attendanceRecord._id,
      clockInTime: checkInTime,
      message: "Clock-In recorded successfully."
    });
  } catch (error) {
    console.error("POST clock-in error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// 4. POST /api/student-attendance/upload
router.post("/student-attendance/upload", authenticate, uploadAttendance, async (req, res) => {
  try {
    const { attendanceId, latitude, longitude } = req.body;
    if (!attendanceId) {
      return res.status(400).json({ success: false, message: "attendanceId is required" });
    }

    const excelFile = req.files && req.files['attendanceExcel'] ? req.files['attendanceExcel'][0] : null;
    if (!excelFile) {
      return res.status(400).json({ success: false, message: "Excel sheet file is required" });
    }

    const attendanceRecord = await Attendance.findById(attendanceId);
    if (!attendanceRecord) {
      return res.status(404).json({ success: false, message: "Active daily attendance session not found" });
    }

    const trainer = await Trainer.findOne({ userId: req.user.id });
    if (!trainer || String(attendanceRecord.trainerId) !== String(trainer._id)) {
      return res.status(403).json({ success: false, message: "Unauthorized attendance session access" });
    }

    // Read excel sheets
    const workbook = xlsx.readFile(excelFile.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "Uploaded Excel sheet is empty" });
    }

    const college = await College.findById(attendanceRecord.collegeId);
    const studentsList = [];

    // Parse and resolve student records
    for (const row of rows) {
      const rollNo = String(row.RollNo || row.rollNo || row["Roll Number"] || "").trim();
      const registerNo = String(row.RegisterNo || row.registerNo || row["Registration Number"] || "").trim();
      const name = String(row.Name || row.name || row["Student Name"] || "").trim();
      const rawStatus = String(row.Status || row.status || row["Attendance"] || "Absent").trim().toLowerCase();
      const status = rawStatus === "present" || rawStatus === "p" ? "Present" : "Absent";

      if (!name && !rollNo) continue;

      let studentId = null;
      if (college) {
        const studentRecord = await Student.findOne({
          collegeId: college._id,
          $or: [
            { rollNo: rollNo },
            { registerNo: registerNo }
          ].filter(q => q.rollNo || q.registerNo)
        });
        if (studentRecord) {
          studentId = studentRecord._id;
        }
      }

      studentsList.push({
        studentId,
        rollNo,
        registerNo,
        name,
        status
      });
    }

    const presentCount = studentsList.filter(s => s.status === "Present").length;
    const absentCount = studentsList.filter(s => s.status === "Absent").length;

    attendanceRecord.students = studentsList;
    attendanceRecord.studentsPresent = presentCount;
    attendanceRecord.studentsAbsent = absentCount;
    attendanceRecord.attendanceExcelUrl = `/uploads/attendance/excels/${excelFile.filename}`;
    await attendanceRecord.save();

    return res.json({
      success: true,
      processedCount: studentsList.length,
      message: `Excel attendance parsed successfully. Present: ${presentCount}, Absent: ${absentCount}`
    });
  } catch (error) {
    console.error("POST student-attendance/upload error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// 5. POST /api/student-attendance/live
router.post("/student-attendance/live", authenticate, async (req, res) => {
  try {
    const { attendanceId, students, signatureBase64 } = req.body;
    if (!attendanceId) {
      return res.status(400).json({ success: false, message: "attendanceId is required" });
    }
    if (!students || !Array.isArray(students)) {
      return res.status(400).json({ success: false, message: "Students attendance array is required" });
    }

    const attendanceRecord = await Attendance.findById(attendanceId);
    if (!attendanceRecord) {
      return res.status(404).json({ success: false, message: "Active daily attendance session not found" });
    }

    const trainer = await Trainer.findOne({ userId: req.user.id });
    if (!trainer || String(attendanceRecord.trainerId) !== String(trainer._id)) {
      return res.status(403).json({ success: false, message: "Unauthorized attendance session access" });
    }

    // Save signature image
    let signatureUrl = attendanceRecord.signatureUrl;
    if (signatureBase64 && signatureBase64.startsWith("data:image")) {
      const matches = signatureBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const buffer = Buffer.from(matches[2], "base64");
        const filename = `sig-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
        const signatureDir = "./uploads/attendance/signatures";
        
        if (!fs.existsSync(signatureDir)) {
          fs.mkdirSync(signatureDir, { recursive: true });
        }
        
        const filePath = path.join(signatureDir, filename);
        fs.writeFileSync(filePath, buffer);
        signatureUrl = `/uploads/attendance/signatures/${filename}`;
      }
    }

    const college = await College.findById(attendanceRecord.collegeId);
    const studentsList = [];

    for (const item of students) {
      let studentId = item.studentId;
      if (!studentId && college) {
        const studentRecord = await Student.findOne({
          collegeId: college._id,
          $or: [
            { rollNo: item.rollNo },
            { registerNo: item.registerNo }
          ].filter(q => q.rollNo || q.registerNo)
        });
        if (studentRecord) {
          studentId = studentRecord._id;
        }
      }

      studentsList.push({
        studentId,
        rollNo: item.rollNo || "",
        registerNo: item.registerNo || "",
        name: item.name || "Unknown",
        status: item.status === "Present" ? "Present" : "Absent"
      });
    }

    const presentCount = studentsList.filter(s => s.status === "Present").length;
    const absentCount = studentsList.filter(s => s.status === "Absent").length;

    attendanceRecord.students = studentsList;
    attendanceRecord.studentsPresent = presentCount;
    attendanceRecord.studentsAbsent = absentCount;
    attendanceRecord.signatureUrl = signatureUrl;
    await attendanceRecord.save();

    return res.json({
      success: true,
      message: "Live attendance records and signature saved successfully."
    });
  } catch (error) {
    console.error("POST student-attendance/live error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// 6. POST /api/student-activities
router.post("/student-activities", authenticate, uploadAttendance, async (req, res) => {
  try {
    const { attendanceId, title, description, latitude, longitude } = req.body;
    if (!attendanceId) {
      return res.status(400).json({ success: false, message: "attendanceId is required" });
    }
    if (!title || !description) {
      return res.status(400).json({ success: false, message: "Activity title and description are required" });
    }

    const attendanceRecord = await Attendance.findById(attendanceId);
    if (!attendanceRecord) {
      return res.status(404).json({ success: false, message: "Active daily attendance session not found" });
    }

    const trainer = await Trainer.findOne({ userId: req.user.id });
    if (!trainer || String(attendanceRecord.trainerId) !== String(trainer._id)) {
      return res.status(403).json({ success: false, message: "Unauthorized attendance session access" });
    }

    const photoFiles = req.files && req.files['activityPhotos'] ? req.files['activityPhotos'] : [];
    const photoUrls = photoFiles.map(f => `/uploads/attendance/photos/${f.filename}`);

    const college = await College.findById(attendanceRecord.collegeId);
    const collegeName = college ? college.name : "Assigned College";

    // Create activity records in DB for each uploaded image (matches legacy Schema)
    for (const file of photoFiles) {
      await StudentActivity.create({
        photoUrl: `/uploads/attendance/photos/${file.filename}`,
        classId: attendanceRecord.collegeId.toString(),
        className: collegeName,
        trainerId: trainer._id,
        trainerName: req.user.name || "Teacher",
        uploadedAt: new Date(),
        latitude: Number(latitude || college.latitude || 0),
        longitude: Number(longitude || college.longitude || 0),
        address: req.body.address || collegeName
      });
    }

    // Link activity images to the current attendance session
    attendanceRecord.activityPhotos = [
      ...(attendanceRecord.activityPhotos || []),
      ...photoUrls
    ];
    // Keep description or details in syllabus or remarks
    attendanceRecord.remarks = `${attendanceRecord.remarks || ""}\nActivity: ${title} - ${description}`;
    await attendanceRecord.save();

    return res.json({
      success: true,
      imagesCount: photoUrls.length,
      message: "Student activities saved successfully."
    });
  } catch (error) {
    console.error("POST student-activities error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// 7. POST /api/attendance/clock-out
router.post("/attendance/clock-out", authenticate, uploadAttendance, async (req, res) => {
  try {
    const { attendanceId, latitude, longitude, timestamp } = req.body;
    if (!attendanceId) {
      return res.status(400).json({ success: false, message: "attendanceId is required" });
    }
    if (latitude == null || longitude == null) {
      return res.status(400).json({ success: false, message: "Coordinates (latitude, longitude) are required" });
    }

    const attendanceRecord = await Attendance.findById(attendanceId);
    if (!attendanceRecord) {
      return res.status(404).json({ success: false, message: "Active daily attendance session not found" });
    }

    const trainer = await Trainer.findOne({ userId: req.user.id });
    if (!trainer || String(attendanceRecord.trainerId) !== String(trainer._id)) {
      return res.status(403).json({ success: false, message: "Unauthorized attendance session access" });
    }

    if (!attendanceRecord.checkIn || !attendanceRecord.checkIn.time) {
      return res.status(400).json({ success: false, message: "You have not clocked in for this session yet" });
    }

    if (attendanceRecord.finalStatus === "COMPLETED") {
      return res.status(400).json({ success: false, message: "You have already clocked out for today" });
    }

    // Geofence check
    const college = await College.findById(attendanceRecord.collegeId);
    const collegeLat = college ? (college.latitude != null ? college.latitude : college.location?.lat) : null;
    const collegeLng = college ? (college.longitude != null ? college.longitude : college.location?.lng) : null;

    let distance = 0;
    if (collegeLat != null && collegeLng != null) {
      distance = getDistanceInMeters(latitude, longitude, collegeLat, collegeLng);
      const radius = college.geofenceRadius || 150;
      if (distance > radius) {
        return res.status(403).json({
          success: false,
          message: `You are outside the assigned college location. Distance: ${Math.round(distance)}m, Geofence: ${radius}m`
        });
      }
    }

    // File validation
    const checkOutImageFile = req.files && (req.files['check_out_image'] || req.files['clock_out_image'])
      ? (req.files['check_out_image'] || req.files['clock_out_image'])[0]
      : null;
    if (!checkOutImageFile) {
      return res.status(400).json({ success: false, message: "Clock-out photo capture is required" });
    }

    const clockOutTime = timestamp ? new Date(timestamp) : new Date();
    const clockInTime = new Date(attendanceRecord.checkIn.time);
    const diffMs = clockOutTime - clockInTime;
    const durationMinutes = Math.max(0, Math.round(diffMs / 1000 / 60));

    const checkOutUrl = `/uploads/attendance/images/${checkOutImageFile.filename}`;

    attendanceRecord.checkOut = {
      time: clockOutTime,
      finalStatus: "COMPLETED",
      location: {
        lat: Number(latitude),
        lng: Number(longitude),
        distanceFromCollege: Math.round(distance * 10) / 10,
        address: req.body.address || "Assigned College Perimeter"
      }
    };

    attendanceRecord.checkOutTime = clockOutTime.toISOString();
    attendanceRecord.checkOutLatitude = Number(latitude);
    attendanceRecord.checkOutLongitude = Number(longitude);
    attendanceRecord.checkOutGeoDistanceMeters = distance;
    attendanceRecord.checkOutGeoImageUrl = checkOutUrl;
    attendanceRecord.checkOutGeoImageUrls = [checkOutUrl];
    attendanceRecord.finalStatus = "COMPLETED";
    attendanceRecord.completedAt = clockOutTime;
    attendanceRecord.workingDurationMinutes = durationMinutes;
    await attendanceRecord.save();

    return res.json({
      success: true,
      clockOutTime,
      durationMinutes,
      message: "Clock-Out registered successfully."
    });
  } catch (error) {
    console.error("POST clock-out error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
