const DAY_IN_MS = 24 * 60 * 60 * 1000;

const ASSIGNED_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const SCHEDULE_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export const resolveEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();

  if (typeof value === "object") {
    if (value._id) return String(value._id).trim();
    if (value.id) return String(value.id).trim();
    if (value.userId) return String(value.userId).trim();
    if (value.authUserId) return String(value.authUserId).trim();
    if (value.uid) return String(value.uid).trim();
  }

  return String(value).trim();
};

export const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

const NON_ACTIONABLE_SCHEDULE_STATUSES = new Set(["cancelled", "completed"]);
const NON_ACTIONABLE_ATTENDANCE_SESSION_STATUSES = new Set(["cancelled", "canceled"]);

const getScheduleStatusToken = (schedule = {}) =>
  normalizeStatus(schedule.rawStatus || schedule.status);

const getAttendanceSessionStatusToken = (schedule = {}) =>
  normalizeStatus(
    schedule.attendancePresenceStatus
    || schedule.attendanceSessionStatus
    || schedule.attendanceLifecycleStatus
    || schedule.sessionStatus,
  );

export const isScheduleActionableForTrainerWorkflow = (schedule = {}) => {
  if (!schedule || typeof schedule !== "object") return false;
  if (schedule.isActionable === false) return false;
  if (schedule.isActive === false) return false;

  const scheduleStatusToken = getScheduleStatusToken(schedule);
  if (NON_ACTIONABLE_SCHEDULE_STATUSES.has(scheduleStatusToken)) return false;

  const attendanceSessionToken = getAttendanceSessionStatusToken(schedule);
  if (NON_ACTIONABLE_ATTENDANCE_SESSION_STATUSES.has(attendanceSessionToken)) return false;

  const resolvedScheduleId =
    resolveEntityId(schedule.id) || resolveEntityId(schedule._id) || resolveEntityId(schedule.scheduleId);
  if (!resolvedScheduleId) return false;

  const resolvedTrainerId = resolveEntityId(schedule.trainerId);
  const resolvedCollegeId = resolveEntityId(schedule.collegeId);
  const resolvedDayNumber = Number(schedule.dayNumber);

  if (!resolvedTrainerId || !resolvedCollegeId) return false;
  if (!Number.isFinite(resolvedDayNumber) || resolvedDayNumber <= 0) return false;

  return true;
};

const getStartOfDay = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

export const formatScheduleDateLabel = (value) => {
  if (!value) return "Unscheduled";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unscheduled";
  return SCHEDULE_DATE_FORMATTER.format(parsed);
};

export const getAssignedDateKey = (value) => {
  if (!value) return "";
  const normalized = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const parts = ASSIGNED_DATE_PARTS_FORMATTER.formatToParts(parsed);
  const year = parts.find((item) => item.type === "year")?.value;
  const month = parts.find((item) => item.type === "month")?.value;
  const day = parts.find((item) => item.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : "";
};

export const getScheduleBadge = (schedule) => {
  const normalizedStatus = normalizeStatus(schedule.status);
  const normalizedAttendanceStatus = normalizeStatus(schedule.attendanceStatus);
  const normalizedGeoVerificationStatus = normalizeStatus(schedule.geoVerificationStatus);
  const normalizedFinalStatus = normalizeStatus(schedule.checkOut?.finalStatus || schedule.finalStatus);
  const normalizedDayStatus = normalizeStatus(schedule.dayStatus);
  const hasCompletedCheckOut = (
    normalizedFinalStatus === "completed"
    || (normalizedGeoVerificationStatus === "approved" && normalizedAttendanceStatus === "approved")
    || normalizedDayStatus === "completed"
  );

  if (schedule.status === "COMPLETED" || normalizedStatus === "completed" || hasCompletedCheckOut) {
    return { label: "Completed", className: "bg-green-100 text-green-800" };
  }

  if (normalizeStatus(schedule.attendanceStatus) === "rejected") {
    return { label: "Check-In Rejected", className: "bg-red-100 text-red-700" };
  }

  if (schedule.geoValidationComment && normalizedGeoVerificationStatus !== "approved") {
    return { label: "Check-Out Pending", className: "bg-amber-100 text-amber-700" };
  }

  if (normalizedStatus === "inprogress") {
    return { label: "In Progress", className: "bg-yellow-100 text-yellow-800" };
  }

  if (normalizedStatus === "completed") {
    return {
      label: "Completed",
      className: "bg-blue-50 text-blue-700 border border-blue-100",
    };
  }

  if (schedule.status === "scheduled") {
    return { label: "Scheduled", className: "bg-indigo-50 text-indigo-700" };
  }

  const fallbackStatus = String(schedule.status || "scheduled");
  return {
    label: fallbackStatus.charAt(0).toUpperCase() + fallbackStatus.slice(1).toLowerCase(),
    className: "bg-gray-100 text-gray-800",
  };
};

export const buildScheduleUiState = (schedule = {}, referenceDate = new Date()) => {
  const today = getStartOfDay(referenceDate);
  const scheduleDay = getStartOfDay(schedule.rawDate || schedule.scheduledDate);
  const firstDayOfCurrentMonth = today
    ? new Date(today.getFullYear(), today.getMonth(), 1)
    : null;
  const normalizedScheduleStatus = normalizeStatus(schedule.status);
  const normalizedAttendanceStatus = normalizeStatus(schedule.attendanceStatus);
  const normalizedGeoVerificationStatus = normalizeStatus(schedule.geoVerificationStatus);
  const normalizedFinalStatus = normalizeStatus(
    schedule.checkOut?.finalStatus || schedule.finalStatus,
  );
  const isAttendanceApproved = normalizedAttendanceStatus === "approved";
  const normalizedDayStatus = normalizeStatus(schedule.dayStatus);
  const hasPersistedCheckOutEvidence = Boolean(
    schedule.checkOut?.time
    || (Array.isArray(schedule.checkOut?.photos) && schedule.checkOut.photos.some((item) =>
      Boolean(String(item?.url || "").trim())))
    || (Array.isArray(schedule.checkOut?.images) && schedule.checkOut.images.some((item) =>
      Boolean(String(item?.image || "").trim())))
    || (Array.isArray(schedule.images) && schedule.images.some((item) =>
      Boolean(String(item?.image || "").trim()))),
  );
  const isAttendanceRejected = normalizedAttendanceStatus === "rejected";
  const hasCompletedCheckOut = (
    normalizedFinalStatus === "completed"
    || (normalizedGeoVerificationStatus === "approved" && normalizeStatus(schedule.attendanceStatus) === "approved")
    || normalizedDayStatus === "completed"
  );
  const isGeoPending = (
    Boolean(schedule.geoValidationComment) && normalizedGeoVerificationStatus !== "approved"
  ) || (
    hasPersistedCheckOutEvidence
    && normalizedFinalStatus === "pending"
    && normalizedGeoVerificationStatus !== "approved"
  ) || (
    normalizedDayStatus === "pending"
    && schedule.geoTagUploaded === true
    && normalizedGeoVerificationStatus !== "approved"
  );
  const isInProgress = normalizedScheduleStatus === "inprogress";
  const isCompleted = schedule.status === "COMPLETED"
    || normalizedScheduleStatus === "completed"
    || hasCompletedCheckOut;
  const isScheduleActionable = isScheduleActionableForTrainerWorkflow(schedule);
  const isFutureDate = Boolean(scheduleDay && today && scheduleDay > today);
  const isPastDate = Boolean(scheduleDay && today && scheduleDay < today);
  const diffDays = scheduleDay && today
    ? Math.floor((today.getTime() - scheduleDay.getTime()) / DAY_IN_MS)
    : Number.POSITIVE_INFINITY;
  const isWithinGracePeriod = Number.isFinite(diffDays) && diffDays >= 0 && diffDays <= 7;

  let primaryAction = null;

  if (!isScheduleActionable) {
    primaryAction = null;
  } else if (isAttendanceRejected) {
    primaryAction = { kind: "checkin", label: "Re-Check In" };
  } else if (isGeoPending) {
    primaryAction = { kind: "checkout", label: "Re-Check Out" };
  } else if (isAttendanceApproved && !isCompleted) {
    primaryAction = hasCompletedCheckOut
      ? null
      : { kind: "checkout", label: "Check Out" };
  } else if (normalizedScheduleStatus === "scheduled") {
    if (isWithinGracePeriod) {
      primaryAction = {
        kind: "checkin",
        label: isPastDate ? "Check In (Past Date)" : "Check In",
      };
    } else if (isFutureDate) {
      primaryAction = {
        kind: "scheduled-info",
        label: `Scheduled for ${schedule.date}`,
      };
    } else {
      primaryAction = {
        kind: "expired-info",
        label: "Session Expired (Beyond 7 days)",
      };
    }
  } else if (isInProgress) {
    primaryAction = {
      kind: "checkout",
      label: schedule.geoValidationComment ? "Re-Check Out" : "Check Out",
    };
  }

  return {
    badge: getScheduleBadge(schedule),
    isAttendanceRejected,
    isGeoPending,
    isInProgress,
    isCompleted,
    isScheduleActionable,
    isFutureDate,
    isPastDate,
    isWithinGracePeriod,
    isBeforeCurrentMonth: Boolean(
      scheduleDay && firstDayOfCurrentMonth && scheduleDay < firstDayOfCurrentMonth,
    ),
    showPastScheduleIndicator: isPastDate && !isCompleted && isScheduleActionable,
    shouldShowCompletedText:
      normalizedScheduleStatus === "completed"
      && !isAttendanceRejected
      && !schedule.geoValidationComment,
    primaryAction,
  };
};

export const decorateScheduleForRender = (schedule = {}, referenceDate = new Date()) => ({
  ...schedule,
  ui: buildScheduleUiState(schedule, referenceDate),
});

export const transformScheduleRecord = (
  schedule = {},
  {
    currentTrainerId = "",
    normalizeStatusValue = false,
    referenceDate = new Date(),
  } = {},
) => {
  const statusValue = schedule.status || "scheduled";

  return decorateScheduleForRender(
    {
      id: schedule._id || schedule.id,
      company: schedule.company?.name || "",
      course: schedule.course?.name || "",
      trainerId: resolveEntityId(schedule.trainerId),
      collegeId: resolveEntityId(schedule.collegeId),
      courseId: resolveEntityId(schedule.courseId),
      college: schedule.collegeId?.name || "",
      dayNumber: schedule.dayNumber,
      date: formatScheduleDateLabel(schedule.scheduledDate),
      time: schedule.startTime && schedule.endTime
        ? `${schedule.startTime} - ${schedule.endTime}`
        : "Time not set",
      status: normalizeStatusValue ? normalizeStatus(statusValue) : statusValue,
      rawStatus: statusValue,
      isActive: schedule.isActive !== false,
      rawDate: schedule.scheduledDate,
      assignedDate: schedule.assignedDate || getAssignedDateKey(schedule.scheduledDate),
      images: Array.isArray(schedule.images) ? schedule.images : [],
      finalStatus: schedule.finalStatus || null,
      attendanceStatus: schedule.attendanceStatus || null,
      attendancePresenceStatus: schedule.attendancePresenceStatus || schedule.attendanceSessionStatus || null,
      geoVerificationStatus: schedule.geoVerificationStatus || null,
      verificationComment: schedule.verificationComment || null,
      geoValidationComment: schedule.geoValidationComment || null,
      checkOut: schedule.checkOut || null,
      dayStatus: schedule.dayStatus || null,
      dayStatusLabel: schedule.dayStatusLabel || null,
      attendanceUploaded: schedule.attendanceUploaded ?? null,
      geoTagUploaded: schedule.geoTagUploaded ?? null,
      rescheduleReason: schedule.rescheduleReason || null,
      subject: schedule.subject || "",
    },
    referenceDate,
  );
};

export const transformScheduleRecords = (schedules = [], options = {}) =>
  schedules.map((schedule) => transformScheduleRecord(schedule, options));

export const buildPendingSchedules = (schedules = [], options = {}) =>
  transformScheduleRecords(schedules, {
    ...options,
    normalizeStatusValue: true,
  }).filter((schedule) => {
    if (!isScheduleActionableForTrainerWorkflow(schedule)) return false;

    const isCancelled = schedule.rawStatus === "cancelled" || schedule.status === "cancelled";
    const isCompleted = schedule.rawStatus === "completed" || schedule.rawStatus === "COMPLETED";

    if (isCancelled || isCompleted) return false;

    const attendanceStatusToken = normalizeStatus(schedule.attendanceStatus);
    const geoStatusToken = normalizeStatus(schedule.geoVerificationStatus);
    const finalStatusToken = normalizeStatus(schedule.finalStatus || schedule.checkOut?.finalStatus);
    const isCompletedByAttendanceState = attendanceStatusToken === "approved"
      && (geoStatusToken === "approved" || finalStatusToken === "completed");

    if (isCompletedByAttendanceState) return false;

    const needsAction = (schedule.status === "scheduled"
      || schedule.ui.isInProgress
      || schedule.ui.isAttendanceRejected
      || schedule.ui.isGeoPending);

    return schedule.ui.isBeforeCurrentMonth && needsAction;
  });

export const prepareCollegeStudents = (students = []) => {
  const sortedStudents = [...students].sort((firstStudent, secondStudent) => {
    const firstRoll = parseInt(firstStudent.rollNo, 10) || 0;
    const secondRoll = parseInt(secondStudent.rollNo, 10) || 0;
    return firstRoll - secondRoll;
  });

  const attendance = {};
  sortedStudents.forEach((student) => {
    attendance[student._id] = true;
  });

  return {
    students: sortedStudents,
    attendance,
    counts: {
      present: sortedStudents.length,
      absent: 0,
    },
  };
};
