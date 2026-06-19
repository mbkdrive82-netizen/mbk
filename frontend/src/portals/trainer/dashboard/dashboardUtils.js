import scheduleService from "@/services/scheduleService";

const DASHBOARD_SCHEDULE_SUMMARY_TTL_MS = 45_000;
const trainerScheduleSummaryCache = new Map();
const trainerScheduleSummaryInFlight = new Map();

const canUseSessionStorage = () =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

export const normalizeTrainerId = (trainerId) => {
  if (!trainerId) return "";
  if (typeof trainerId === "string" || typeof trainerId === "number") {
    return String(trainerId).trim();
  }
  if (typeof trainerId === "object") {
    return String(
      trainerId._id ||
      trainerId.id ||
      trainerId.trainerId ||
      trainerId.userId?.id ||
      trainerId.userId?._id ||
      "",
    ).trim();
  }
  return String(trainerId).trim();
};

const getTrainerSummaryCacheKey = (trainerId) => normalizeTrainerId(trainerId);

export const buildScheduleItem = (schedule = {}) => ({
  id: schedule?._id || schedule?.id,
  college:
    schedule?.collegeId?.name || schedule?.college?.name || "Unknown College",
  course: schedule?.courseId?.name || schedule?.course?.name || "Unknown Course",
  dateLabel: schedule?.scheduledDate
    ? new Date(schedule.scheduledDate).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unscheduled",
  rawDate: schedule?.scheduledDate,
  dayNumber: schedule?.dayNumber || "N/A",
  status: schedule?.attendanceStatus || schedule?.status || "pending",
});

export const buildTrainerDashboardSnapshotKey = (trainerId) => {
  const normalizedTrainerId = normalizeTrainerId(trainerId);
  if (!normalizedTrainerId) return "";
  return `trainer-dashboard:v2:${normalizedTrainerId}`;
};

export const clearTrainerDashboardScheduleSummaryCache = (trainerId) => {
  const cacheKey = normalizeTrainerId(trainerId);
  if (!cacheKey) return;
  trainerScheduleSummaryCache.delete(cacheKey);
};

export const clearTrainerDashboardSnapshot = (trainerId) => {
  const normalizedTrainerId = normalizeTrainerId(trainerId);
  if (!normalizedTrainerId || !canUseSessionStorage()) return;

  const snapshotKey = buildTrainerDashboardSnapshotKey(normalizedTrainerId);
  window.sessionStorage.removeItem(snapshotKey);
};

export const signalTrainerDashboardRefresh = (trainerId) => {
  const normalizedTrainerId = normalizeTrainerId(trainerId);
  if (!normalizedTrainerId) return;

  const refreshKey = `trainer-dashboard:refresh:${normalizedTrainerId}`;
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  window.localStorage.setItem(refreshKey, String(Date.now()));
};

export const getStatusMeta = (status = "") => {
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === "approved" || normalized === "completed") {
    return {
      label: "Completed",
      className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    };
  }

  if (normalized === "rejected") {
    return {
      label: "Rejected",
      className: "bg-rose-50 text-rose-700 border border-rose-200",
    };
  }

  if (normalized === "inprogress") {
    return {
      label: "In Progress",
      className: "bg-sky-50 text-sky-700 border border-sky-200",
    };
  }

  return {
    label: "Scheduled",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
  };
};

export const getBadgeClasses = (type) => {
  const normalizedType = String(type || "").toLowerCase();
  if (normalizedType === "attendance") return "bg-blue-50 text-blue-700 border-blue-200";
  if (normalizedType === "schedule") return "bg-amber-50 text-amber-700 border-amber-200";
  if (normalizedType === "salary") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (normalizedType === "complaints" || normalizedType === "complaint") {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }
  if (normalizedType === "chat" || normalizedType === "announcement") {
    return "bg-violet-50 text-violet-700 border-violet-200";
  }
  if (normalizedType === "approval") return "bg-cyan-50 text-cyan-700 border-cyan-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
};

export const formatTimeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

export const buildTrainerDashboardScheduleSummary = (
  currentSchedules = [],
  previousSchedules = [],
) => {
  const mergedSchedules = new Map();

  [...previousSchedules, ...currentSchedules].forEach((schedule) => {
    mergedSchedules.set(schedule?._id || schedule?.id, schedule);
  });

  const allSchedules = Array.from(mergedSchedules.values());
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextItems = [];
  const recentItems = [];
  let completedCount = 0;
  let pendingCount = 0;
  const uniqueColleges = new Set();

  allSchedules.forEach((schedule) => {
    const scheduleDate = new Date(schedule?.scheduledDate);
    scheduleDate.setHours(0, 0, 0, 0);

    const collegeKey =
      schedule?.collegeId?._id ||
      schedule?.college?._id ||
      schedule?.collegeId?.id ||
      schedule?.college?.id ||
      schedule?.collegeId?.name ||
      schedule?.college?.name;

    if (collegeKey) {
      uniqueColleges.add(collegeKey);
    }

    const formatted = buildScheduleItem(schedule);
    const normalizedStatus = String(
      schedule?.attendanceStatus || schedule?.status || "",
    )
      .trim()
      .toLowerCase();

    if (scheduleDate >= today) {
      nextItems.push(formatted);
    } else {
      recentItems.push(formatted);
    }

    if (normalizedStatus === "approved" || normalizedStatus === "completed") {
      completedCount += 1;
    } else if (
      normalizedStatus === "pending" ||
      normalizedStatus === "scheduled" ||
      (!normalizedStatus && scheduleDate < today)
    ) {
      pendingCount += 1;
    }
  });

  nextItems.sort((a, b) => new Date(a.rawDate) - new Date(b.rawDate));
  recentItems.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));

  return {
    upcomingSchedules: nextItems,
    recentActivities: recentItems.slice(0, 5),
    stats: {
      upcoming: nextItems.length,
      completed: completedCount,
      pending: pendingCount,
      colleges: uniqueColleges.size,
    },
  };
};

export const fetchTrainerDashboardScheduleSummary = async (trainerId) => {
  if (!trainerId) {
    return null;
  }

  const cacheKey = getTrainerSummaryCacheKey(trainerId);
  const cachedEntry = trainerScheduleSummaryCache.get(cacheKey);
  if (cachedEntry?.expiresAt > Date.now()) {
    return cachedEntry.data;
  }

  if (trainerScheduleSummaryInFlight.has(cacheKey)) {
    return trainerScheduleSummaryInFlight.get(cacheKey);
  }

  const task = (async () => {
    const currentDate = new Date();
    const previousDate = new Date();
    previousDate.setMonth(previousDate.getMonth() - 1);

    const [currentRes, previousRes] = await Promise.all([
      scheduleService.getTrainerSchedule(trainerId, {
        month: currentDate.getMonth() + 1,
        year: currentDate.getFullYear(),
      }),
      scheduleService.getTrainerSchedule(trainerId, {
        month: previousDate.getMonth() + 1,
        year: previousDate.getFullYear(),
      }),
    ]);

    const summary = buildTrainerDashboardScheduleSummary(
      currentRes?.data || [],
      previousRes?.data || [],
    );

    trainerScheduleSummaryCache.set(cacheKey, {
      data: summary,
      expiresAt: Date.now() + DASHBOARD_SCHEDULE_SUMMARY_TTL_MS,
    });

    return summary;
  })();

  trainerScheduleSummaryInFlight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    trainerScheduleSummaryInFlight.delete(cacheKey);
  }
};
