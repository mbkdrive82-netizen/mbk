const { TrainerAssignment, College } = require('../models');

/**
 * Resolves the display name of a trainer.
 * @param {Object} trainer 
 * @returns {string}
 */
function resolveTrainerDisplayName(trainer) {
  if (!trainer) return '';
  const first = String(trainer.firstName || '').trim();
  const last = String(trainer.lastName || '').trim();
  const email = String(trainer.email || '').trim();
  
  if (first || last) {
    return `${first} ${last}`.trim();
  }
  return email;
}

/**
 * Syncs/Creates a TrainerAssignment record for a trainer and a college.
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function syncTrainerAssignmentRecord({ trainer, trainerName, collegeName, driveFolderId }) {
  try {
    let assignment = await TrainerAssignment.findOne({
      trainer_id: trainer._id,
      collegeName: collegeName,
      active: true
    });

    if (!assignment) {
      assignment = new TrainerAssignment({
        trainer_id: trainer._id,
        trainerName: trainerName || resolveTrainerDisplayName(trainer),
        collegeName,
        active: true,
        driveFolderId,
        assignedAt: new Date(),
        status: 'assigned'
      });
    } else {
      if (driveFolderId) {
        assignment.driveFolderId = driveFolderId;
      }
    }

    await assignment.save();
    return assignment;
  } catch (error) {
    console.error('[TrainerAssignmentResolver] Sync error:', error);
    throw error;
  }
}

/**
 * Finds the active college assignment for a trainer.
 * @param {Object} trainer 
 * @param {Object} [user] 
 * @returns {Promise<{assignment: Object, college: Object}|null>}
 */
async function getActiveAssignment(trainer, user) {
  try {
    if (!trainer) return null;

    // Find the latest active TrainerAssignment
    const assignment = await TrainerAssignment.findOne({
      trainer_id: trainer._id,
      active: true
    }).sort({ assignedAt: -1 });

    if (assignment) {
      const college = await College.findOne({ name: assignment.collegeName });
      return { assignment, college };
    }

    // Fallback: If no explicit assignment, check the trainer's linked collegeId
    if (trainer.collegeId) {
      const college = await College.findById(trainer.collegeId);
      if (college) {
        // Create a mock assignment object structure matching model expectations
        const mockAssignment = {
          collegeName: college.name,
          driveFolderId: trainer.collegeDriveFolderId || college.googleDriveFolderId,
          active: true
        };
        return { assignment: mockAssignment, college };
      }
    }

    return null;
  } catch (error) {
    console.error('[TrainerAssignmentResolver] getActiveAssignment error:', error);
    return null;
  }
}

module.exports = {
  resolveTrainerDisplayName,
  syncTrainerAssignmentRecord,
  getActiveAssignment
};
