const { TrainerDocument } = require("../../models");
const {
  getDefaultTrainerDocumentsFolderId,
  ensureDriveFolder,
  findDriveFolder,
  moveDriveItemToParent,
  syncDriveFolder,
} = require("../../services/googleDriveService");

const TRAINER_DOCUMENTS_SUBFOLDER_NAME = String(
  process.env.GOOGLE_DRIVE_TRAINER_DOCUMENTS_SUBFOLDER_NAME || "documents",
).trim();

const TRAINER_REGISTRATION_FOLDER_NAME = String(
  process.env.GOOGLE_DRIVE_TRAINER_REGISTRATION_FOLDER_NAME || "",
).trim();

const normalizeName = (value = "") => String(value || "").trim().toLowerCase();

const LEGACY_TRAINER_DOCUMENTS_FOLDER_NAMES = [
  TRAINER_DOCUMENTS_SUBFOLDER_NAME,
  "Documents",
  "Trainer Documents",
]
  .map((value) => normalizeName(value))
  .filter(Boolean);

const toFolderPayload = (folder) => {
  if (!folder?.id) return null;

  return {
    id: folder.id,
    name: folder.name || null,
    link: folder.webViewLink || null,
  };
};

const isDocumentsFolderReference = (trainer = {}) =>
  Boolean(trainer?.driveFolderId) &&
  LEGACY_TRAINER_DOCUMENTS_FOLDER_NAMES.includes(
    normalizeName(trainer?.driveFolderName),
  );

const ensureTrainerCode = async (trainer) => {
  if (!trainer) {
    throw new Error("Trainer record is required.");
  }

  if (!trainer.trainerId) {
    await trainer.save();
  }

  if (!trainer.trainerId) {
    throw new Error("Trainer ID could not be generated.");
  }

  return trainer.trainerId;
};

const syncTrainerDocumentRecords = async ({ trainerId, documentsFolder }) => {
  if (!trainerId || !documentsFolder?.id) return;

  const trainerDocuments = await TrainerDocument.find({
    trainerId,
  }).select("_id driveFileId driveFolderId driveFolderName");

  for (const document of trainerDocuments) {
    let canPersistFolderMetadata = true;

    if (document.driveFileId && document.driveFolderId !== documentsFolder.id) {
      try {
        await moveDriveItemToParent({
          itemId: document.driveFileId,
          targetParentId: documentsFolder.id,
        });
      } catch (error) {
        canPersistFolderMetadata = false;
        console.warn(
          `[GOOGLE-DRIVE] Failed to move trainer document ${document._id} into "${documentsFolder.name}": ${error.message}`,
        );
      }
    }

    if (
      canPersistFolderMetadata &&
      (document.driveFolderId !== documentsFolder.id ||
        document.driveFolderName !== documentsFolder.name)
    ) {
      document.driveFolderId = documentsFolder.id;
      document.driveFolderName = documentsFolder.name || null;
      await document.save();
    }
  }
};

const ensureTrainerDocumentHierarchy = async ({
  trainer,
  persistTrainer = true,
  syncExistingDocuments = false,
} = {}) => {
  const rootFolderId = getDefaultTrainerDocumentsFolderId();
  if (!rootFolderId) {
    throw new Error("Google Drive folder ID is required.");
  }

  const trainerCode = await ensureTrainerCode(trainer);
  const trainerName = [trainer.firstName, trainer.lastName].filter(Boolean).join(" ").trim() || trainer.name || trainer.email?.split("@")[0] || trainerCode;

  const parentFolderId = TRAINER_REGISTRATION_FOLDER_NAME
    ? (await ensureDriveFolder({
        parentFolderId: rootFolderId,
        folderName: TRAINER_REGISTRATION_FOLDER_NAME,
      })).id
    : rootFolderId;

  const registrationFolder = TRAINER_REGISTRATION_FOLDER_NAME
    ? await findDriveFolder({
        folderName: TRAINER_REGISTRATION_FOLDER_NAME,
        parentFolderId: rootFolderId,
      })
    : { id: rootFolderId, name: null, webViewLink: null };

  const legacyTrainersFolderName = String(
    process.env.GOOGLE_DRIVE_TRAINERS_FOLDER_NAME || "Trainers",
  ).trim();
  const legacyTrainersFolder = await findDriveFolder({
    folderName: legacyTrainersFolderName,
    parentFolderId: rootFolderId,
  });

  let existingTrainerFolderId = null;
  let existingDocumentsFolderId = null;

  if (isDocumentsFolderReference(trainer)) {
    existingDocumentsFolderId = trainer.driveFolderId || null;
    const existingTrainerFolder = await findDriveFolder({
      folderName: trainerName,
      parentFolderId,
    });
    existingTrainerFolderId = existingTrainerFolder?.id || null;

    if (!existingTrainerFolderId && legacyTrainersFolder?.id) {
      const existingLegacyTrainerFolder = await findDriveFolder({
        folderName: trainerName,
        parentFolderId: legacyTrainersFolder.id,
      });
      existingTrainerFolderId = existingLegacyTrainerFolder?.id || null;
    }
  } else {
    const existingTrainerFolder = await findDriveFolder({
      folderName: trainerName,
      parentFolderId,
    });
    existingTrainerFolderId = existingTrainerFolder?.id || null;

    if (!existingTrainerFolderId && legacyTrainersFolder?.id) {
      const existingLegacyTrainerFolder = await findDriveFolder({
        folderName: trainerName,
        parentFolderId: legacyTrainersFolder.id,
      });
      existingTrainerFolderId = existingLegacyTrainerFolder?.id || null;
    }

    if (!existingTrainerFolderId && trainer.driveFolderId) {
      // Last-resort fallback for older/stale DB pointers.
      // Prefer canonical name-based lookup first to avoid hard failures on inaccessible IDs.
      existingTrainerFolderId = trainer.driveFolderId || null;
    }
  }

  const trainerFolder = await syncDriveFolder({
    folderId: existingTrainerFolderId,
    folderName: trainerName,
    parentFolderId,
  });

  const documentsFolder = TRAINER_DOCUMENTS_SUBFOLDER_NAME
    ? await syncDriveFolder({
        folderId: existingDocumentsFolderId,
        folderName: TRAINER_DOCUMENTS_SUBFOLDER_NAME,
        parentFolderId: trainerFolder.id,
      })
    : trainerFolder;

  if (
    trainer.driveFolderId !== trainerFolder.id ||
    trainer.driveFolderName !== trainerFolder.name
  ) {
    trainer.driveFolderId = trainerFolder.id;
    trainer.driveFolderName = trainerFolder.name;

    if (persistTrainer) {
      await trainer.save();
    }
  }

  if (syncExistingDocuments) {
    await syncTrainerDocumentRecords({
      trainerId: trainer._id,
      documentsFolder,
    });
  }

  return {
    rootFolder: {
      id: rootFolderId,
      name: null,
      link: null,
    },
    trainersFolder: toFolderPayload(registrationFolder),
    trainerFolder: toFolderPayload(trainerFolder),
    documentsFolder: toFolderPayload(documentsFolder),
  };
};

const ensureTrainerCollegeHierarchy = async ({
  trainer,
  collegeName,
  totalDays = 12,
} = {}) => {
  const rootFolderId = getDefaultTrainerDocumentsFolderId();
  if (!rootFolderId) {
    throw new Error("Google Drive folder ID is required.");
  }

  if (!trainer || !collegeName) {
    throw new Error("Trainer and college name are required.");
  }

  // First ensure the trainer's own folder exists
  const trainerHierarchy = await ensureTrainerDocumentHierarchy({
    trainer,
    persistTrainer: true,
  });

  const trainerFolder = trainerHierarchy.trainerFolder;
  if (!trainerFolder?.id) {
    throw new Error("Could not resolve trainer Drive folder.");
  }

  // Create the college folder inside the trainer's folder
  const collegeFolder = await ensureDriveFolder({
    folderName: String(collegeName).trim(),
    parentFolderId: trainerFolder.id,
  });

  // Create Day 1 to Day N folders, each with Attendance, Geo Tag, and Excel Sheet subfolders
  const dayFoldersByDayNumber = {};
  const safeDays = Math.max(1, Number(totalDays) || 12);

  for (let dayNumber = 1; dayNumber <= safeDays; dayNumber += 1) {
    const dayFolder = await ensureDriveFolder({
      folderName: `Day ${dayNumber}`,
      parentFolderId: collegeFolder.id,
    });

    const attendanceFolder = await ensureDriveFolder({
      folderName: "Attendance",
      parentFolderId: dayFolder.id,
    });

    const geoTagFolder = await ensureDriveFolder({
      folderName: "Geo Tag",
      parentFolderId: dayFolder.id,
    });

    // Per requirement, each Day folder contains ONLY "Attendance" and "Geo Tag".
    // No "Excel Sheet" subfolder is created.
    dayFoldersByDayNumber[dayNumber] = {
      ...toFolderPayload(dayFolder),
      attendanceFolder: toFolderPayload(attendanceFolder),
      geoTagFolder: toFolderPayload(geoTagFolder),
      excelSheetFolder: null,
    };
  }

  return {
    ...trainerHierarchy,
    collegeFolder: toFolderPayload(collegeFolder),
    dayFoldersByDayNumber,
  };
};

module.exports = {
  TRAINER_REGISTRATION_FOLDER_NAME,
  TRAINER_DOCUMENTS_SUBFOLDER_NAME,
  ensureTrainerDocumentHierarchy,
  ensureTrainerCollegeHierarchy,
};
