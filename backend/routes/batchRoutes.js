const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Batch, Course, College, Student, Trainer, Attendance, Schedule, TrainerAssignment } = require('../models');
const { authenticate } = require('../middleware/auth');
const { invalidateTrainerScheduleCaches } = require('../services/trainerScheduleCacheService');
const { notifyTrainerSchedule, sendNotification } = require('../services/notificationService');
const { sendBulkScheduleEmail } = require('../utils/emailService');

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isValidScheduleAssignment = ({ scheduleDayOfWeek, scheduleStartTime, scheduleEndTime }) => {
    return Boolean(scheduleDayOfWeek && scheduleStartTime && scheduleEndTime);
};

const syncBatchSchedules = async ({
    batch,
    trainerIds = [],
    scheduleDayOfWeek,
    scheduleStartTime,
    scheduleEndTime,
    actorUserId = null,
    io = null,
} = {}) => {
    if (!batch) return [];

    const college = await College.findById(batch.collegeId).select('companyId name');
    const companyId = college?.companyId || null;
    const collegeName = college?.name || null;
    const normalizedTrainerIds = Array.isArray(trainerIds) ? trainerIds.map(String) : [];

    const existingSchedules = await Schedule.find({ batchId: batch._id });
    const existingByTrainerId = new Map(existingSchedules.map((schedule) => [String(schedule.trainerId), schedule]));
    const affectedTrainerIds = new Set();
    const createdOrUpdatedSchedulesByTrainer = new Map();

    for (const schedule of existingSchedules) {
        const trainerId = String(schedule.trainerId);
        if (!normalizedTrainerIds.includes(trainerId)) {
            if (schedule.isActive !== false) {
                schedule.isActive = false;
                await schedule.save();
            }
            affectedTrainerIds.add(trainerId);
        }
    }

    if (isValidScheduleAssignment({ scheduleDayOfWeek, scheduleStartTime, scheduleEndTime })) {
        for (const trainerId of normalizedTrainerIds) {
            affectedTrainerIds.add(trainerId);
            const existing = existingByTrainerId.get(trainerId);
            let scheduleRecord = existing;

            if (existing) {
                existing.companyId = companyId;
                existing.courseId = batch.courseId;
                existing.collegeId = batch.collegeId;
                existing.batchId = batch._id;
                existing.dayNumber = existing.dayNumber || 1;
                existing.dayOfWeek = scheduleDayOfWeek;
                existing.scheduledDate = null;
                existing.startTime = scheduleStartTime;
                existing.endTime = scheduleEndTime;
                existing.status = 'scheduled';
                existing.isActive = true;
                existing.createdBy = existing.createdBy || actorUserId;
                scheduleRecord = await existing.save();
            } else {
                scheduleRecord = await Schedule.create({
                    trainerId,
                    companyId,
                    courseId: batch.courseId,
                    collegeId: batch.collegeId,
                    batchId: batch._id,
                    dayNumber: 1,
                    dayOfWeek: scheduleDayOfWeek,
                    scheduledDate: null,
                    startTime: scheduleStartTime,
                    endTime: scheduleEndTime,
                    status: 'scheduled',
                    isActive: true,
                    createdBy: actorUserId,
                });
            }

            createdOrUpdatedSchedulesByTrainer.set(trainerId, [scheduleRecord]);
        }
    }

    if (normalizedTrainerIds.length > 0) {
        const trainers = await Trainer.find({ _id: { $in: normalizedTrainerIds } }).populate('userId', 'name email');
        for (const trainer of trainers) {
            const trainerName = trainer.firstName && trainer.lastName
                ? `${trainer.firstName} ${trainer.lastName}`
                : (trainer.userId?.name || trainer.email || "");

            if (!trainerName) continue;

            await TrainerAssignment.updateMany(
                {
                    active: true,
                    $or: [
                        { trainerid: String(trainer._id) },
                        { trainerName: { $regex: new RegExp(`^${escapeRegExp(trainerName)}$`, 'i') } }
                    ]
                },
                { $set: { active: false } }
            );

            await TrainerAssignment.create({
                trainerName,
                trainerid: String(trainer._id),
                trainername: trainerName,
                collegeName: collegeName || "",
                collegename: collegeName || "",
                batchName: batch.batchName || "",
                active: true,
            });

            if (!trainer.collegeId || String(trainer.collegeId) !== String(batch.collegeId)) {
                await Trainer.findByIdAndUpdate(trainer._id, { collegeId: batch.collegeId });
            }

            const schedulesForTrainer = createdOrUpdatedSchedulesByTrainer.get(String(trainer._id)) || [];
            if (schedulesForTrainer.length > 0) {
                        const trainerInfo = {
                    name: trainer.userId?.name || trainerName,
                    phone: trainer.phone,
                };

                try {
                    await notifyTrainerSchedule(trainerInfo, college || {}, schedulesForTrainer);
                } catch (err) {
                    console.error('Error sending trainer schedule notification:', err);
                }

                if (io && trainer.userId) {
                    try {
                        await sendNotification(io, {
                            userId: trainer.userId?._id || trainer.userId,
                            role: 'Trainer',
                            title: 'New Training Schedule Assigned',
                            message: `You have been assigned to ${batch.batchName} at ${collegeName || 'your college'}. Please check your schedule.`,
                            type: 'Schedule',
                            link: '/trainer/schedule',
                        });
                    } catch (err) {
                        console.error('Error sending in-app schedule notification:', err);
                    }
                }

                if (trainer.userId?.email) {
                    try {
                        await sendBulkScheduleEmail(trainer.userId.email, trainerInfo.name, schedulesForTrainer.map((s) => ({
                            course: batch.courseId ? String(batch.courseId) : 'Assigned Course',
                            day: s.dayOfWeek,
                            college: collegeName || '',
                            date: 'Weekly Recurring',
                            startTime: s.startTime,
                            endTime: s.endTime,
                            spocName: college?.principalName || college?.spocName || 'N/A',
                            spocPhone: college?.phone || college?.spocPhone || '',
                            mapLink: college?.location?.mapUrl || '',
                        })));
                    } catch (err) {
                        console.error('Error sending trainer schedule email:', err);
                    }
                }
            }
        }
    }

    if (affectedTrainerIds.size && typeof invalidateTrainerScheduleCaches === 'function') {
        await invalidateTrainerScheduleCaches([...affectedTrainerIds]);
    }

    return [...affectedTrainerIds];
};

// @route   GET /api/batches
// @desc    Get all batches (optionally filtered by courseId and/or collegeId)
// @access  Authenticated
router.get('/', authenticate, async (req, res) => {
    try {
        const { courseId, collegeId } = req.query;
        const filter = {};
        if (courseId) filter.courseId = courseId;
        if (collegeId) filter.collegeId = collegeId;

        const batches = await Batch.find(filter)
            .populate('trainerIds', 'name email')
            .populate('students', 'fullName email rollNo registerNo')
            .sort({ createdAt: -1 });

        res.json(batches);
    } catch (error) {
        console.error('[ERROR] GET /api/batches failed:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/batches/stats
// @desc    Get batch management statistics for dashboard cards
// @access  Authenticated
router.get('/stats', authenticate, async (req, res) => {
    try {
        const { courseId, collegeId } = req.query;

        if (collegeId && courseId) {
            // Stats for College Card
            const [batchesCount, trainersCount, studentsCount] = await Promise.all([
                Batch.countDocuments({ courseId, collegeId }),
                // Get unique trainers assigned to batches in this college-course
                Batch.distinct('trainerIds', { courseId, collegeId }),
                Student.countDocuments({ courseId, collegeId })
            ]);

            return res.json({
                totalBatches: batchesCount,
                totalTrainers: trainersCount.length,
                totalStudents: studentsCount
            });
        } else if (courseId) {
            // Stats for Course Card
            const [collegesCount, batchesCount, studentsCount] = await Promise.all([
                College.countDocuments({ courseId }),
                Batch.countDocuments({ courseId }),
                Student.countDocuments({ courseId })
            ]);

            return res.json({
                totalColleges: collegesCount,
                totalBatches: batchesCount,
                totalStudents: studentsCount
            });
        }

        res.status(400).json({ message: 'Missing courseId or collegeId query parameter' });
    } catch (error) {
        console.error('[ERROR] GET /api/batches/stats failed:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/batches/:id
// @desc    Get a single batch by ID
// @access  Authenticated
router.get('/:id', authenticate, async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id)
            .populate('trainerIds', 'name email')
            .populate('students', 'fullName email rollNo registerNo');

        if (!batch) {
            return res.status(404).json({ message: 'Batch not found' });
        }
        res.json(batch);
    } catch (error) {
        console.error('[ERROR] GET /api/batches/:id failed:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST /api/batches
// @desc    Create a new batch
// @access  Super Admin
router.post('/', authenticate, async (req, res) => {
    try {
        const {
            courseId,
            collegeId,
            batchName,
            trainerIds,
            startDate,
            endDate,
            capacity,
            status,
            sessionType,
            endSessionType,
            scheduleDayOfWeek,
            scheduleStartTime,
            scheduleEndTime,
        } = req.body;

        if (!courseId || !collegeId || !batchName) {
            return res.status(400).json({ message: 'courseId, collegeId, and batchName are required' });
        }

        const cleanSessionType = (sessionType && ['FN', 'AN', 'Both'].includes(sessionType)) ? sessionType : 'Both';
        const cleanEndSessionType = (endSessionType && ['FN', 'AN', 'Both'].includes(endSessionType)) ? endSessionType : 'Both';

        const batch = await Batch.create({
            courseId,
            collegeId,
            batchName,
            trainerIds: trainerIds || [],
            startDate,
            endDate,
            capacity: capacity || 60,
            status: status || 'active',
            sessionType: cleanSessionType,
            endSessionType: cleanEndSessionType,
            scheduleDayOfWeek: scheduleDayOfWeek || null,
            scheduleStartTime: scheduleStartTime || null,
            scheduleEndTime: scheduleEndTime || null,
        });

        if (Array.isArray(trainerIds) && trainerIds.length > 0) {
            await syncBatchSchedules({
                batch,
                trainerIds,
                scheduleDayOfWeek,
                scheduleStartTime,
                scheduleEndTime,
                actorUserId: req?.user?.id || req?.user?._id || null,
                io: req.io,
            });
        }

        res.status(201).json(batch);
    } catch (error) {
        console.error('[ERROR] POST /api/batches failed:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message, errors: error.errors });
        }
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Duplicate key error: A batch with this code already exists.' });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// @route   PUT /api/batches/:id
// @desc    Update a batch
// @access  Super Admin
router.put('/:id', authenticate, async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id);
        if (!batch) {
            return res.status(404).json({ message: 'Batch not found' });
        }

        const {
            batchName,
            batchCode,
            trainerIds,
            startDate,
            endDate,
            capacity,
            status,
            sessionType,
            endSessionType,
            scheduleDayOfWeek,
            scheduleStartTime,
            scheduleEndTime,
        } = req.body;

        if (batchName) batch.batchName = batchName;
        if (batchCode) batch.batchCode = batchCode;
        if (trainerIds) batch.trainerIds = trainerIds;
        if (startDate !== undefined) batch.startDate = startDate;
        if (endDate !== undefined) batch.endDate = endDate;
        if (capacity) batch.capacity = capacity;
        if (status) batch.status = status;
        if (sessionType !== undefined) {
            batch.sessionType = ['FN', 'AN', 'Both'].includes(sessionType) ? sessionType : 'Both';
        }
        if (endSessionType !== undefined) {
            batch.endSessionType = ['FN', 'AN', 'Both'].includes(endSessionType) ? endSessionType : 'Both';
        }
        if (scheduleDayOfWeek !== undefined) batch.scheduleDayOfWeek = scheduleDayOfWeek || null;
        if (scheduleStartTime !== undefined) batch.scheduleStartTime = scheduleStartTime || null;
        if (scheduleEndTime !== undefined) batch.scheduleEndTime = scheduleEndTime || null;

        await batch.save();

        await syncBatchSchedules({
            batch,
            trainerIds: batch.trainerIds || [],
            scheduleDayOfWeek: batch.scheduleDayOfWeek,
            scheduleStartTime: batch.scheduleStartTime,
            scheduleEndTime: batch.scheduleEndTime,
            actorUserId: req?.user?.id || req?.user?._id || null,
            io: req.io,
        });

        res.json(batch);
    } catch (error) {
        console.error('[ERROR] PUT /api/batches/:id failed:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message, errors: error.errors });
        }
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Duplicate key error: A batch with this code already exists.' });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// @route   DELETE /api/batches/:id
// @desc    Delete a batch
// @access  Super Admin
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id);
        if (!batch) {
            return res.status(404).json({ message: 'Batch not found' });
        }

        // Clean up references in Student collection
        await Student.updateMany({ batchId: batch._id }, { $set: { batchId: null } });

        // Clean up references in Attendance collection
        await Attendance.updateMany({ batchId: batch._id }, { $set: { batchId: null } });

        const schedulesToDeactivate = await Schedule.find({ batchId: batch._id, isActive: { $ne: false } }).select('trainerId');
        const scheduleTrainerIds = [...new Set(schedulesToDeactivate.map((schedule) => String(schedule.trainerId)))];
        await Schedule.updateMany({ batchId: batch._id, isActive: { $ne: false } }, { $set: { isActive: false } });
        if (scheduleTrainerIds.length && typeof invalidateTrainerScheduleCaches === 'function') {
            await invalidateTrainerScheduleCaches(scheduleTrainerIds);
        }

        await batch.deleteOne();
        res.json({ message: 'Batch deleted successfully' });
    } catch (error) {
        console.error('[ERROR] DELETE /api/batches/:id failed:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST /api/batches/:id/students
// @desc    Assign students to a batch
// @access  Super Admin
router.post('/:id/students', authenticate, async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id);
        if (!batch) {
            return res.status(404).json({ message: 'Batch not found' });
        }

        const { studentIds } = req.body;
        if (!Array.isArray(studentIds)) {
            return res.status(400).json({ message: 'studentIds must be an array' });
        }

        // Set batchId for newly assigned students
        await Student.updateMany(
            { _id: { $in: studentIds } },
            { $set: { batchId: batch._id } }
        );

        // Remove batchId for students no longer in this list
        await Student.updateMany(
            { batchId: batch._id, _id: { $nin: studentIds } },
            { $set: { batchId: null } }
        );

        // Update Batch model's students list
        batch.students = studentIds;
        await batch.save();

        res.json({ success: true, message: 'Students assigned successfully', count: studentIds.length });
    } catch (error) {
        console.error('[ERROR] POST /api/batches/:id/students failed:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/batches/:id/attendance
// @desc    Get attendance records tracked under a specific batch
// @access  Authenticated
router.get('/:id/attendance', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const attendanceLogs = await Attendance.find({ batchId: id })
            .populate('trainerId', 'name email')
            .sort({ date: -1 });

        res.json(attendanceLogs);
    } catch (error) {
        console.error('[ERROR] GET /api/batches/:id/attendance failed:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
