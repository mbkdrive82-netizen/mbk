export const resolveScheduleId = (schedule) => schedule?.id || schedule?._id || null;

export const buildAssignModalSeed = (schedule = {}) => ({
  scheduleId: resolveScheduleId(schedule),
  form: {
    trainerId: schedule.trainerId || "",
    scheduledDate: schedule.scheduledDate
      ? schedule.scheduledDate.split("T")[0]
      : "",
    startTime: schedule.startTime || "09:00",
    endTime: schedule.endTime || "17:00",
    rescheduleReason: schedule.rescheduleReason || "",
  },
});

export const buildLoadedSessionsLabel = ({ loadedCount, total }) => {
  const safeLoaded = Number.isFinite(Number(loadedCount)) ? Number(loadedCount) : 0;
  const totalSuffix = Number.isFinite(Number(total)) ? ` / ${total}` : "";
  return `${safeLoaded}${totalSuffix} Sessions Loaded`;
};

export const shouldShowLoadMore = ({ hasNextPage }) => Boolean(hasNextPage);

export const createAssignClickHandler =
  ({ schedule, onOpenAssignModal }) =>
  () =>
    onOpenAssignModal(schedule);

const resolveTrainerId = (schedule) => {
  const trainerField = schedule?.trainerId || schedule?.trainer;
  if (!trainerField) return null;
  if (typeof trainerField === 'string' || typeof trainerField === 'number') {
    return String(trainerField).trim();
  }
  return (
    trainerField._id ||
    trainerField.id ||
    trainerField.trainerId ||
    trainerField.userId?.id ||
    trainerField.userId?._id ||
    null
  );
};

export const createDeleteClickHandler =
  ({ schedule, onDeleteSchedule }) =>
  () =>
    onDeleteSchedule(
      resolveScheduleId(schedule),
      resolveTrainerId(schedule),
    );

export const normalizeAssignPayload = (assignData = {}) => ({
  trainerId: String(assignData.trainerId || "").trim(),
  scheduledDate: String(assignData.scheduledDate || "").trim(),
  startTime: String(assignData.startTime || "").trim(),
  endTime: String(assignData.endTime || "").trim(),
  rescheduleReason: String(assignData.rescheduleReason || "").trim(),
});

export const getAssignSubmissionError = ({ scheduleId, assignData }) => {
  const normalized = normalizeAssignPayload(assignData);

  if (!String(scheduleId || "").trim()) {
    return "Missing schedule selection";
  }
  if (!normalized.trainerId) {
    return "Please select a trainer";
  }
  if (!normalized.scheduledDate) {
    return "Please select a session date";
  }
  if (!normalized.startTime || !normalized.endTime) {
    return "Please select session start and end times";
  }
  return null;
};

export const buildAssignMutationInput = ({ scheduleId, assignData }) => {
  const assignPayload = normalizeAssignPayload(assignData);
  const error = getAssignSubmissionError({ scheduleId, assignData: assignPayload });

  return {
    error,
    scheduleId,
    assignPayload,
  };
};

export const guardAssignSubmission = ({
  scheduleId,
  assignData,
  onValidSubmit,
  onInvalidSubmit,
}) => {
  const mutationInput = buildAssignMutationInput({ scheduleId, assignData });
  if (mutationInput.error) {
    onInvalidSubmit?.(mutationInput.error);
    return {
      isValid: false,
      mutationInput,
    };
  }

  onValidSubmit?.(mutationInput);
  return {
    isValid: true,
    mutationInput,
  };
};
