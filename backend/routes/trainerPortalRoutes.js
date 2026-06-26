const express = require("express");
const xlsx = require("xlsx");
const router = express.Router();
const teacherWorkflowRoutes = require("./teacherWorkflowRoutes.js");
const { authenticate } = require("../middleware/auth");
const {
  Trainer,
  College,
  Attendance,
  StudentActivity,
  TrainerAssignment,
} = require("../models");
const { getActiveAssignment } = require("../utils/trainerAssignmentResolver");

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getDateRangeForPeriod = (period = "", dateValue) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(today);
  end.setHours(23, 59, 59, 999);

  const start = new Date(today);

  if (period === "daily") {
    return { start, end };
  }

  if (period === "weekly") {
    start.setDate(start.getDate() - 6);
    return { start, end };
  }

  if (period === "monthly") {
    start.setMonth(start.getMonth() - 1);
    return { start, end };
  }

  if (dateValue) {
    const parsed = new Date(dateValue);
    if (!Number.isNaN(parsed.getTime())) {
      const startDate = new Date(parsed);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(parsed);
      endDate.setHours(23, 59, 59, 999);
      return { start: startDate, end: endDate };
    }
  }

  return { start, end };
};

const buildAttendanceQuery = ({ trainerId, period, date, batchName } = {}) => {
  const query = { trainerId };
  const dateRange = getDateRangeForPeriod(period, date);

  if (dateRange) {
    query.date = {
      $gte: dateRange.start,
      $lte: dateRange.end,
    };
  }

  if (batchName) {
    query.batchName = { $regex: new RegExp(`^${escapeRegex(batchName)}`, "i") };
  }

  return query;
};

const formatAttendanceResponse = (attendance = {}) => ({
  id: attendance._id || attendance.id,
  date: attendance.date || null,
  college: attendance.collegeName || attendance.college?.name || null,
  batchName: attendance.batchName || attendance.batch || attendance.batchName || null,
  studentsPresent: attendance.studentsPresent || 0,
  studentsAbsent: attendance.studentsAbsent || 0,
  status: attendance.status || attendance.attendanceStatus || "Unknown",
  attendanceId: attendance._id || attendance.id,
});

const fetchTrainerAttendanceRecords = async (trainerId, query = {}) => {
  const attendanceQuery = buildAttendanceQuery({ trainerId, ...query });
  const records = await Attendance.find(attendanceQuery)
    .sort({ date: -1 })
    .lean();

  return records.map(formatAttendanceResponse);
};

router.get("/dashboard", authenticate, async (req, res) => {
  try {
    const trainer = await Trainer.findOne({ userId: req.user.id }).populate("userId");
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer profile not found" });
    }

    const assignmentResult = await getActiveAssignment(trainer, req.user);
    const hasAssignment = Boolean(assignmentResult?.assignment || assignmentResult?.college);
    const assignedCollege = assignmentResult?.college?.name || assignmentResult?.assignment?.collegeName || null;
    const assignmentMessage = hasAssignment ? null : "No college has been assigned by Admin.";

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    const attendanceRecord = await Attendance.findOne({
      trainerId: trainer._id,
      date: { $gte: todayStart, $lte: todayEnd },
    }).lean();

    const studentsPresent = Number(attendanceRecord?.studentsPresent || 0);
    const studentsAbsent = Number(attendanceRecord?.studentsAbsent || 0);
    const totalStudents = studentsPresent + studentsAbsent;
    const attendancePercentage = totalStudents
      ? Math.round((studentsPresent / totalStudents) * 100)
      : 0;

    const todaysActivities = await StudentActivity.countDocuments({
      trainerId: trainer._id,
      uploadedAt: { $gte: todayStart, $lte: todayEnd },
    });

    const responsePayload = {
      hasAssignment,
      assignmentMessage,
      assignedCollege,
      totalStudents,
      presentStudents: studentsPresent,
      absentStudents: studentsAbsent,
      attendancePercentage,
      todaysActivities,
      clockInStatus: {
        checkedIn: Boolean(attendanceRecord?.checkIn?.time),
      },
      clockOutStatus: {
        checkedOut: Boolean(attendanceRecord?.checkOut?.time),
      },
    };

    return res.json({ success: true, data: responsePayload });
  } catch (error) {
    console.error("GET /trainer-portal/dashboard error:", error);
    return res.status(500).json({ success: false, message: "Failed to load trainer dashboard analytics" });
  }
});

router.get("/assignment", authenticate, async (req, res) => {
  try {
    const trainer = await Trainer.findOne({ userId: req.user.id }).populate("userId");
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer profile not found" });
    }

    const assignmentResult = await getActiveAssignment(trainer, req.user);
    if (!assignmentResult) {
      return res.json({ success: true, data: { hasAssignment: false, message: "No active college assignment found" } });
    }

    const { assignment, college } = assignmentResult;
    const resolvedAssignment = {
      hasAssignment: true,
      collegeName: college ? college.name : assignment.collegeName,
      collegeId: college ? college._id : null,
      latitude: college ? (college.latitude != null ? college.latitude : college.location?.lat) : null,
      longitude: college ? (college.longitude != null ? college.longitude : college.location?.lng) : null,
      geofenceRadius: college ? (college.geofenceRadius || 150) : 150,
      message: null,
    };

    return res.json({ success: true, data: resolvedAssignment });
  } catch (error) {
    console.error("GET /trainer-portal/assignment error:", error);
    return res.status(500).json({ success: false, message: "Failed to load trainer assignment" });
  }
});

router.post("/verify-gps", authenticate, (req, res, next) => {
  req.url = "/location/validate";
  teacherWorkflowRoutes(req, res, next);
});

router.post("/attendance-excel/upload", authenticate, (req, res, next) => {
  req.url = "/student-attendance/upload";
  teacherWorkflowRoutes(req, res, next);
});

router.get("/attendance-records", authenticate, async (req, res) => {
  try {
    const trainer = await Trainer.findOne({ userId: req.user.id });
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer profile not found" });
    }

    const records = await fetchTrainerAttendanceRecords(trainer._id, {
      period: req.query.period,
      date: req.query.date,
      batchName: req.query.batchName,
    });

    return res.json({ success: true, data: records });
  } catch (error) {
    console.error("GET /trainer-portal/attendance-records error:", error);
    return res.status(500).json({ success: false, message: "Failed to load attendance records" });
  }
});

router.get("/attendance-records/export", authenticate, async (req, res) => {
  try {
    const trainer = await Trainer.findOne({ userId: req.user.id });
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer profile not found" });
    }

    const records = await fetchTrainerAttendanceRecords(trainer._id, {
      period: req.query.period,
      date: req.query.date,
      batchName: req.query.batchName,
    });

    const worksheet = xlsx.utils.json_to_sheet(records.map((record) => ({
      Date: record.date ? new Date(record.date).toLocaleDateString() : "",
      College: record.college || "",
      Batch: record.batchName || "",
      Present: record.studentsPresent,
      Absent: record.studentsAbsent,
      Status: record.status,
    })));
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Attendance Records");

    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", "attachment; filename=trainer-attendance-records.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    console.error("GET /trainer-portal/attendance-records/export error:", error);
    return res.status(500).json({ success: false, message: "Failed to export attendance records" });
  }
});

router.get("/attendance-template", authenticate, async (req, res) => {
  try {
    const sampleRows = [
      { RollNo: "", RegisterNo: "", Name: "", Status: "Present" },
    ];

    const worksheet = xlsx.utils.json_to_sheet(sampleRows, {
      header: ["RollNo", "RegisterNo", "Name", "Status"],
    });
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Template");

    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", "attachment; filename=attendance-template.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    console.error("GET /trainer-portal/attendance-template error:", error);
    return res.status(500).json({ success: false, message: "Failed to download attendance template" });
  }
});

router.post("/drive-file", authenticate, (req, res) => {
  return res.status(501).json({
    success: false,
    message: "Trainer portal drive-file endpoint is not implemented on the backend yet.",
  });
});

router.use("/", teacherWorkflowRoutes);

module.exports = router;
