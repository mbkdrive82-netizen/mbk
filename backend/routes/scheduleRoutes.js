const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  createAssignScheduleController,
  createCreateScheduleController,
  createBulkCreateScheduleController,
  createBulkUploadScheduleController,
  createDeleteScheduleController,
  createUpdateScheduleController,
  departmentDaysController,
  listSchedulesController,
  liveDashboardController,
  scheduleAssociationsController,
  scheduleDetailsController,
  trainerSchedulesController,
} = require("../modules/schedules/schedules.controller");
const { resolveScheduleFolderFields } = require("../modules/schedules/schedules.drive");



const assignScheduleController = createAssignScheduleController({
  resolveScheduleFolderFields,
});
const createScheduleController = createCreateScheduleController({
  resolveScheduleFolderFields,
});
const bulkCreateScheduleController = createBulkCreateScheduleController({
  resolveScheduleFolderFields,
});
const bulkUploadScheduleController = createBulkUploadScheduleController({
  resolveScheduleFolderFields,
});
const updateScheduleController = createUpdateScheduleController({
  resolveScheduleFolderFields,
});
const deleteScheduleController = createDeleteScheduleController();

// @route   POST /api/schedules/create
// @desc    Create a single schedule
// @access  CompanyAdmin, SPOC Admin, SuperAdmin
router.post(
  "/create",
  authenticate,
  authorize(["CompanyAdmin", "SPOCAdmin", "SuperAdmin"]),
  createScheduleController,
);

// @route   POST /api/schedules/bulk-create
// @desc    Create multiple schedules at once
// @access  CompanyAdmin, SPOC Admin, SuperAdmin
router.post(
  "/bulk-create",
  authenticate,
  authorize(["CompanyAdmin", "SPOCAdmin", "SuperAdmin"]),
  bulkCreateScheduleController,
);

// @route   GET /api/schedules/all
// @desc    Get all schedules
// @access  CompanyAdmin, SPOC Admin, SuperAdmin
router.get(
  "/all",
  authenticate,
  authorize(["CompanyAdmin", "SPOCAdmin", "SuperAdmin"]),
  listSchedulesController,
);

// @route   GET /api/schedules/live-dashboard
// @desc    Get today's schedules with live attendance status
// @access  CompanyAdmin, SPOC Admin, SuperAdmin
router.get(
  "/live-dashboard",
  authenticate,
  authorize(["CompanyAdmin", "SPOCAdmin", "SuperAdmin"]),
  liveDashboardController,
);

// @route   GET /api/schedules/days?departmentId=xxx
// @desc    Get day status slots for a department
// @access  CompanyAdmin, SPOC Admin, SuperAdmin
router.get(
  "/days",
  authenticate,
  authorize(["CompanyAdmin", "SPOCAdmin", "SuperAdmin"]),
  departmentDaysController,
);

// Shared handler – resolves trainerId from URL param or authenticated user
// Shared handler – resolves trainerId from URL param or authenticated user, always using the Trainer ObjectId for schedule queries
const trainerScheduleHandler = async (req, res) => {
  try {
    // Resolve trainer identifier from route param or authenticated user
    let identifier = req.params.trainerId;
    if (!identifier) {
      if (req.user?.trainerId) {
        identifier = String(req.user.trainerId);
      } else if (req.user?.id) {
        identifier = String(req.user.id);
      } else if (req.user?.userId) {
        identifier = String(req.user.userId);
      }
    }

    if (!identifier) {
      return res.status(400).json({ success: false, message: "Trainer ID is required" });
    }

    // Load Trainer model to resolve ObjectId (supports both code MBK001 and ObjectId)
    const { Trainer } = require("../models");
    const trainerDoc = await Trainer.findOne({
      $or: [{ trainerId: identifier }, { _id: identifier }, { userId: req.user?.id }],
    }).select("_id");

    if (!trainerDoc) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    console.log("[TrainerResolution] Identifier:", identifier, "Resolved ObjectId:", trainerDoc._id);

    // Use the ObjectId for downstream controller
    req.params.trainerId = String(trainerDoc._id);
    return trainerSchedulesController(req, res);
  } catch (error) {
    console.error("[TrainerScheduleHandler] Error:", error);
    return res.status(500).json({ success: false, message: "Server error while resolving trainer", error: error.message });
  }
};

// @route   GET /api/schedules/trainer
// @desc    Get schedules for the authenticated trainer (no param needed)
// @access  Trainer, SPOC Admin, SuperAdmin
router.get(
  "/trainer",
  authenticate,
  authorize(["Trainer", "SPOCAdmin", "SuperAdmin"]),
  trainerScheduleHandler
);

// @route   GET /api/schedules/trainer/:trainerId
// @desc    Get schedules for a specific trainer by ID
// @access  Trainer, SPOC Admin, SuperAdmin
router.get(
  "/trainer/:trainerId",
  authenticate,
  authorize(["Trainer", "SPOCAdmin", "SuperAdmin"]),
  trainerScheduleHandler
);


// @route   GET /api/schedules/:id
// @desc    Get a single schedule by ID
// @access  SPOC Admin, Trainer
router.get("/:id", scheduleDetailsController);

// @route   PUT /api/schedules/:id/assign
// @desc    Assign Trainer and Date to a Schedule (Day)
// @access  SPOC Admin
router.put("/:id/assign", authenticate, authorize(["SPOCAdmin"]), assignScheduleController);

// @route   PUT /api/schedules/:id
// @desc    Update a schedule
// @access  CompanyAdmin, SPOC Admin, SuperAdmin
router.put(
  "/:id",
  authenticate,
  authorize(["CompanyAdmin", "SPOCAdmin", "SuperAdmin"]),
  updateScheduleController,
);

// @route   DELETE /api/schedules/:id
// @desc    Delete a schedule
// @access  CompanyAdmin, SPOC Admin, SuperAdmin
router.delete(
  "/:id",
  authenticate,
  authorize(["CompanyAdmin", "SPOCAdmin", "SuperAdmin"]),
  deleteScheduleController,
);

// @route   GET /api/schedules/associations
// @desc    Get all companies, courses, and colleges for dropdown associations
// @access  SPOC Admin
router.get("/associations/all", scheduleAssociationsController);

// @route   POST /api/schedules/bulk-upload
// @desc    Bulk upload schedules via mandatory Excel format
// @access  SPOC Admin
router.post("/bulk-upload", authenticate, authorize(["SPOCAdmin"]), bulkUploadScheduleController);

module.exports = router;

