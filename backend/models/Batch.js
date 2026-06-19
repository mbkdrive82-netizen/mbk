const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true,
    },
    collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College',
        required: true,
    },
    batchName: {
        type: String,
        required: true,
    },
    batchCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
    },
    trainerIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Trainer',
    }],
    students: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
    }],
    startDate: {
        type: Date,
        default: null,
    },
    endDate: {
        type: Date,
        default: null,
    },
    capacity: {
        type: Number,
        default: 60,
    },
    sessionType: {
        type: String,
        enum: ['FN', 'AN', 'Both'],
        default: 'Both',
    },
    endSessionType: {
        type: String,
        enum: ['FN', 'AN', 'Both'],
        default: 'Both',
    },
    scheduleDayOfWeek: {
        type: String,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        default: null,
    },
    scheduleStartTime: {
        type: String,
        default: null,
    },
    scheduleEndTime: {
        type: String,
        default: null,
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'upcoming'],
        default: 'active',
    },
}, {
    timestamps: true,
});

batchSchema.index({ courseId: 1, collegeId: 1 });
batchSchema.index({ batchCode: 1 }, { unique: true });

// Pre-validate hook to generate batchCode if not provided
batchSchema.pre('validate', async function (next) {
    if (this.batchCode) return next();
    try {
        const Course = mongoose.model('Course');
        const course = await Course.findById(this.courseId).select('title');
        
        let prefix = 'BATCH';
        if (course?.title) {
            // Take first letters of each word
            const words = course.title.split(/\s+/).filter(Boolean);
            if (words.length > 1) {
                prefix = words.map(w => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '');
            } else {
                prefix = course.title.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '');
            }
        }
        if (!prefix) prefix = 'B';

        const count = await mongoose.model('Batch').countDocuments({ courseId: this.courseId, collegeId: this.collegeId });
        
        let suffixNum = count + 1;
        let candidateCode = `${prefix}-B${String(suffixNum).padStart(3, '0')}`;
        
        let exists = await mongoose.model('Batch').exists({ batchCode: candidateCode });
        while (exists) {
            suffixNum++;
            candidateCode = `${prefix}-B${String(suffixNum).padStart(3, '0')}`;
            exists = await mongoose.model('Batch').exists({ batchCode: candidateCode });
        }
        
        this.batchCode = candidateCode;
        next();
    } catch (err) {
        next(err);
    }
});

const Batch = mongoose.model('Batch', batchSchema);

module.exports = Batch;
