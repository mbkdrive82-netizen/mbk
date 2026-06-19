"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { usePortalData } from "@/context/PortalDataContext";
import authService from "@/services/authService";
import { getTrainerProfile } from "@/services/trainerService";

import {
  buildTrainerDashboardScheduleSummary,
  buildTrainerDashboardSnapshotKey,
  fetchTrainerDashboardScheduleSummary,
} from "./dashboardUtils";

const EMPTY_STATS = {
  upcoming: 0,
  completed: 0,
  pending: 0,
  colleges: 0,
};
const TRAINER_DASHBOARD_SNAPSHOT_TTL_MS = 30 * 60 * 1000;

const canUseSessionStorage = () =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

const readTrainerDashboardSnapshot = (snapshotKey) => {
  if (!snapshotKey || !canUseSessionStorage()) {
    return null;
  }

  try {
    const rawSnapshot = window.sessionStorage.getItem(snapshotKey);
    if (!rawSnapshot) return null;

    const parsedSnapshot = JSON.parse(rawSnapshot);
    const updatedAt = Number(parsedSnapshot?.updatedAt || 0);
    const isFreshSnapshot =
      Number.isFinite(updatedAt) &&
      Date.now() - updatedAt <= TRAINER_DASHBOARD_SNAPSHOT_TTL_MS;

    if (!isFreshSnapshot) {
      window.sessionStorage.removeItem(snapshotKey);
      return null;
    }

    return parsedSnapshot?.data || null;
  } catch {
    return null;
  }
};

const writeTrainerDashboardSnapshot = (snapshotKey, data) => {
  if (!snapshotKey || !canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      snapshotKey,
      JSON.stringify({
        updatedAt: Date.now(),
        data,
      }),
    );
  } catch {
    // Ignore storage write failures and continue with in-memory state.
  }
};

const fetchTrainerDashboardData = async (currentUser) => {
  const initialTrainerId =
    currentUser?.id || currentUser?._id || currentUser?.userId || null;

  const profileTask = getTrainerProfile().catch((profileError) => {
    console.warn("Trainer dashboard profile refresh failed:", profileError);
    return null;
  });

  const scheduleTask = initialTrainerId
    ? fetchTrainerDashboardScheduleSummary(initialTrainerId).catch(
        (scheduleError) => {
          console.warn(
            "Trainer dashboard initial schedule prefetch failed:",
            scheduleError,
          );
          return null;
        },
      )
    : Promise.resolve(null);

  const [profileRes, initialScheduleSnapshot] = await Promise.all([
    profileTask,
    scheduleTask,
  ]);

  const trainerProfile = profileRes?.data || profileRes?.user || null;
  const trainerId = trainerProfile?.id || trainerProfile?._id || initialTrainerId;

  if (!trainerId) {
    return {
      profileData: trainerProfile,
      upcomingSchedules: [],
      recentActivities: [],
      stats: EMPTY_STATS,
    };
  }

  const scheduleSnapshot =
    initialScheduleSnapshot && String(initialTrainerId) === String(trainerId)
      ? initialScheduleSnapshot
      : await fetchTrainerDashboardScheduleSummary(trainerId);

  return {
    profileData: trainerProfile,
    upcomingSchedules: scheduleSnapshot?.upcomingSchedules || [],
    recentActivities: scheduleSnapshot?.recentActivities || [],
    stats: scheduleSnapshot?.stats || EMPTY_STATS,
  };
};

export default function useTrainerDashboardData(currentUser) {
  const { dashboardData, portalRole, portalLoading } = usePortalData((state) => ({
    dashboardData: state.dashboardData,
    portalRole: state.portalRole,
    portalLoading: state.loading,
  }));
  const resolvedCurrentUserId =
    currentUser?.id || currentUser?._id || currentUser?.userId || "unknown";
  const dashboardSnapshotStorageKey = useMemo(
    () => buildTrainerDashboardSnapshotKey(resolvedCurrentUserId),
    [resolvedCurrentUserId],
  );
  const hasValidSession = Boolean(currentUser) && Boolean(authService.getValidToken());
  const cachedDashboardSnapshot = useMemo(
    () => (hasValidSession ? readTrainerDashboardSnapshot(dashboardSnapshotStorageKey) : null),
    [dashboardSnapshotStorageKey, hasValidSession],
  );

  const portalDashboard =
    portalRole === "Trainer" && dashboardData ? dashboardData : null;

  const portalSummary = useMemo(() => {
    if (!portalDashboard) {
      return null;
    }

    return buildTrainerDashboardScheduleSummary(
      portalDashboard.currentMonthSchedule || [],
      portalDashboard.previousMonthSchedule || [],
    );
  }, [portalDashboard]);

  const fallbackQuery = useQuery({
    queryKey: [
      "trainer",
      "dashboard-fallback",
      resolvedCurrentUserId,
    ],
    queryFn: () => fetchTrainerDashboardData(currentUser),
    enabled: hasValidSession && !portalDashboard,
    initialData: cachedDashboardSnapshot || undefined,
    staleTime: 90_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const refreshKey = `trainer-dashboard:refresh:${resolvedCurrentUserId}`;
    const handleStorage = (event) => {
      if (!event?.key) return;
      if (event.key === refreshKey || event.key === dashboardSnapshotStorageKey) {
        void fallbackQuery.refetch();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [dashboardSnapshotStorageKey, fallbackQuery, resolvedCurrentUserId]);

  useEffect(() => {
    if (portalDashboard) {
      return;
    }
    if (!fallbackQuery.data) {
      return;
    }

    writeTrainerDashboardSnapshot(dashboardSnapshotStorageKey, fallbackQuery.data);
  }, [dashboardSnapshotStorageKey, fallbackQuery.data, portalDashboard]);

  useEffect(() => {
    if (!portalDashboard) {
      return;
    }

    writeTrainerDashboardSnapshot(dashboardSnapshotStorageKey, {
      profileData: portalDashboard.profile || null,
      upcomingSchedules: portalSummary?.upcomingSchedules || [],
      recentActivities: portalSummary?.recentActivities || [],
      stats: portalSummary?.stats || EMPTY_STATS,
    });
  }, [dashboardSnapshotStorageKey, portalDashboard, portalSummary]);

  const profileData = portalDashboard?.profile || fallbackQuery.data?.profileData || null;
  const upcomingSchedules =
    portalSummary?.upcomingSchedules || fallbackQuery.data?.upcomingSchedules || [];
  const recentActivities =
    portalSummary?.recentActivities || fallbackQuery.data?.recentActivities || [];
  const stats = portalSummary?.stats || fallbackQuery.data?.stats || EMPTY_STATS;
  const hasFallbackDashboardData =
    Boolean(fallbackQuery.data?.profileData) ||
    (fallbackQuery.data?.upcomingSchedules || []).length > 0 ||
    (fallbackQuery.data?.recentActivities || []).length > 0;

  const loading = !portalDashboard && !hasFallbackDashboardData && (
    portalLoading || fallbackQuery.isPending
  );

  const error = fallbackQuery.error ? "Failed to load dashboard data." : "";

  return {
    error,
    loading,
    profileData,
    recentActivities,
    stats,
    upcomingSchedules,
  };
}
