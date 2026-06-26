const mongoose = require("mongoose");
const TrainerCodeCounter = require("./TrainerCodeCounter");
const { assertUniqueEmail, assertUniquePhone } = require('../services/auth/globalUniquenessService');

function generateTrainerCode(sequence) {
  return `MBK${String(sequence).padStart(3, "0")}`;
}

async function getNextTrainerCodeCandidate() {
  const counter = await TrainerCodeCounter.findOneAndUpdate(
    { key: "trainer" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return generateTrainerCode(counter.seq);
}

async function createUniqueTrainerCode() {
  let trainerCode;
  let exists = true;

  while (exists) {
    trainerCode = await getNextTrainerCodeCandidate();
    const activeTrainer = await mongoose
      .model("Trainer")
      .findOne({ trainerId: trainerCode })
      .select("_id");

    exists = Boolean(activeTrainer);
  }

  return trainerCode;
}

const trainerSchema = new mongoose.Schema(
  {
    // STEP 1: Auth and Verification
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      default: null,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },

    // STEP 2: Personal Details
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    qualification: {
      type: String,
      trim: true,
    },
    mobile: {
      type: String,
      trim: true,
      alias: "phone",
      index: true,
    },
    city: {
      type: String,
      trim: true,
    },
    cityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "City",
    },
    specialization: {
      type: String,
      trim: true,
    },
    experience: {
      type: Number,
      min: 0,
      default: null,
    },
    address: {
      type: String,
      trim: true,
    },

    // STEP 3: Document Uploads (Flat structure as requested)
    documents: {
      aadharFront: { type: String, default: null },
      aadharBack: { type: String, default: null },
      pan: { type: String, default: null },
      degreePdf: { type: String, default: null },
      passbook: { type: String, default: null },
      resumePdf: { type: String, default: null },
      passportPhoto: { type: String, default: null },
      selfiePhoto: { type: String, default: null },
      ndaAgreement: {
        type: String,
        default: null,
        alias: "NDAAgreement",
      },
      ntaAgreement: {
        type: String,
        default: null,
      },
      verification: {
        type: Map,
        of: new mongoose.Schema(
          {
            verified: { type: Boolean, default: false },
            reason: { type: String, default: null },
            updatedAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
        default: {},
      },
    },

    // STEP 4: NDA Agreement & Signature
    agreementAccepted: {
      type: Boolean,
      default: false,
    },
    signature: {
      type: String, // Store signature as dataURL or file path
      default: null,
    },
    agreementDate: {
      type: Date,
      default: null,
    },
    ndaAgreementPdf: {
      type: String,
      default: null,
      alias: "NDAAgreementPdf",
    },
    ntaAgreementPdf: {
      type: String,
      default: null,
    },

    verificationStatus: {
      type: String,
      enum: ["NOT_SUBMITTED", "PENDING", "VERIFIED", "REJECTED", "APPROVED"],
      default: "NOT_SUBMITTED",
    },
    documentStatus: {
      type: String,
      enum: ["pending", "uploaded", "under_review", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    // STATUS FLOW (Final enum as requested)
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    // Approval Information
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    lastApproachedAt: {
      type: Date,
      default: null,
    },
    lastApproachedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Legacy Support / Internal tracking
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    companyCode: {
      type: String,
      default: null,
      index: true,
      uppercase: true,
      trim: true,
    },
    collegeId: { // Optional direct association to a college
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      default: null,
    },
    colleges: {
      type: [
        {
          collegeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'College',
            required: true,
          },
          collegeName: {
            type: String,
            trim: true,
            required: true,
          },
          googleDriveFolderId: {
            type: String,
            default: null,
          },
          googleDriveFolderName: {
            type: String,
            default: null,
          },
          collegeLink: {
            type: String,
            default: null,
          },
          // Per-day Google Drive folder mapping created when a college is assigned.
          // Each entry stores the Day folder id plus its Attendance / Geo Tag /
          // Excel Sheet subfolder ids so trainer daily uploads route correctly.
          dayFolders: {
            type: [
              {
                day: { type: Number, required: true },
                dayFolderId: { type: String, default: null },
                attendance: { type: String, default: null },
                geo_tag: { type: String, default: null },
                excel_sheet: { type: String, default: null },
              },
            ],
            default: [],
          },
          assignedDate: {
            type: Date,
            default: Date.now,
          },
          active: {
            type: Boolean,
            default: true,
          },
          status: {
            type: String,
            enum: ['active', 'completed'],
            default: 'active',
          },
        },
      ],
      default: [],
    },
    trainerId: {
      type: String,
      unique: true,
      sparse: true,
    },
    driveFolderId: {
      type: String,
      default: null,
    },
    driveFolderName: {
      type: String,
      default: null,
    },
    collegeDriveFolderId: {
      type: String,
      default: null,
    },
    collegeDriveFolderName: {
      type: String,
      default: null,
    },
    profilePicture: {
      type: String, // Maps from selfiePhoto on approval
      default: null,
    },
    registrationStep: {
      type: Number,
      default: 1, // 1: Email verify, 2: Profile, 3: Documents, 4: Agreement, 5: Password, 6: Complete
    },
    registrationStatus: {
      type: String,
      enum: ["pending", "under_review", "approved"],
      default: "pending",
      index: true,
    },
    registrationReminderState: {
      activeStep: {
        type: Number,
        default: null,
      },
      activeActionKey: {
        type: String,
        default: null,
      },
      anchorAt: {
        type: Date,
        default: null,
      },
      milestonesSent: {
        type: [Number],
        default: [],
      },
      lastReminderSentAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  },
);

trainerSchema.index({ status: 1, verificationStatus: 1 });
trainerSchema.index({ userId: 1 });
trainerSchema.index({ companyCode: 1, status: 1 });
// Additional compound indexes for 70K-user admin/SPOC query patterns
trainerSchema.index({ registrationStatus: 1, status: 1, createdAt: -1 }); // admin listing
trainerSchema.index({ email: 1, status: 1 });                              // login + status check
trainerSchema.index({ companyCode: 1, registrationStatus: 1 });            // SPOC trainer list
trainerSchema.index({ documentStatus: 1, createdAt: -1 });                 // document review queue
trainerSchema.index({ cityId: 1, status: 1 });                             // location-based queries

// GLOBAL UNIQUENESS ENFORCEMENT: Email and mobile must be unique across ALL collections
trainerSchema.pre("save", async function (next) {
  // Validate email and mobile uniqueness if modified or new
  if (this.isModified('email') || this.isModified('mobile') || this.isNew) {
    try {
      // Validate email uniqueness across all collections
      if (this.isModified('email') || this.isNew) {
        await assertUniqueEmail(this.email, this._id, 'Trainer');
        this.email = this.email.toLowerCase().trim();
      }
      
      // Validate mobile uniqueness across all collections (optional field)
      if ((this.isModified('mobile') || this.isNew) && this.mobile) {
        await assertUniquePhone(this.mobile, this._id, 'Trainer');
      }
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Auto-generate trainerId as MBK001, MBK002, ... if missing
trainerSchema.pre("save", async function (next) {
  if (!this.trainerId) {
    try {
      this.trainerId = await createUniqueTrainerCode();
    } catch (error) {
      return next(error);
    }
  }
  next();
});

const Trainer = mongoose.models.Trainer || mongoose.model("Trainer", trainerSchema);

module.exports = Trainer;
