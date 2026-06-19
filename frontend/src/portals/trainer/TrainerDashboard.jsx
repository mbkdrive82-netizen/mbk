"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  GraduationCap,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";

import useTrainerDashboardData from "./dashboard/useTrainerDashboardData";
import { getTrainerDashboardAnalytics } from "@/services/trainerPortalService";

const scheduleDeferredMount = (callback, delayMs = 0) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const runMount = () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    callback();
  };

  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(runMount, {
      timeout: Math.max(800, delayMs || 0),
    });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(runMount, delayMs);
  return () => window.clearTimeout(handle);
};

const DASHBOARD_SCHEDULE_SECTION_DEFER_MS = 0;
const DASHBOARD_NOTIFICATIONS_SECTION_DEFER_MS = 120;
const EMPTY_STATS = {
  upcoming: 0,
  completed: 0,
  pending: 0,
  colleges: 0,
};

const NotificationsSectionSkeleton = () => (
  <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm sm:rounded-[28px]">
    <div className="border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
      <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-4 w-52 animate-pulse rounded bg-slate-100" />
    </div>
    <div className="space-y-3 px-4 py-4 sm:px-6 sm:py-5">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`dashboard-notification-skeleton-${index}`}
          className="h-24 animate-pulse rounded-2xl bg-slate-100"
        />
      ))}
    </div>
  </section>
);

const SchedulesSectionSkeleton = () => (
  <>
    {Array.from({ length: 2 }).map((_, sectionIndex) => (
      <section
        key={`dashboard-schedules-skeleton-${sectionIndex}`}
        className="rounded-[24px] border border-slate-200 bg-white shadow-sm sm:rounded-[28px]"
      >
        <div className="border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
          <div className="h-6 w-44 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="space-y-3 px-4 py-4 sm:px-6 sm:py-5">
          {Array.from({ length: 3 }).map((_, itemIndex) => (
            <div
              key={`dashboard-schedules-skeleton-item-${sectionIndex}-${itemIndex}`}
              className="h-24 animate-pulse rounded-2xl bg-slate-100"
            />
          ))}
        </div>
      </section>
    ))}
  </>
);

const TrainerDashboardNotificationsSection = dynamic(
  () => import("./dashboard/TrainerDashboardNotificationsSection"),
  {
    loading: () => <NotificationsSectionSkeleton />,
    ssr: false,
  },
);

const TrainerDashboardSchedulesSection = dynamic(
  () => import("./dashboard/TrainerDashboardSchedulesSection"),
  {
    loading: () => <SchedulesSectionSkeleton />,
    ssr: false,
  },
);



function TrainerDashboard() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const [hasMounted, setHasMounted] = useState(false);
  const [showNotificationsSection, setShowNotificationsSection] = useState(false);
  const [showSchedulesSection, setShowSchedulesSection] = useState(false);
  const {
    error,
    loading,
    recentActivities,
    stats,
    upcomingSchedules,
  } = useTrainerDashboardData(currentUser);

  const [portalAnalytics, setPortalAnalytics] = useState(null);

  const dashboardError = hasMounted ? error : "";
  const dashboardLoading = !hasMounted || loading;
  const dashboardRecentActivities = hasMounted ? recentActivities : [];
  const dashboardUpcomingSchedules = hasMounted ? upcomingSchedules : [];
  const dashboardStats = hasMounted ? stats : EMPTY_STATS;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return undefined;
    getTrainerDashboardAnalytics()
      .then((res) => setPortalAnalytics(res?.data || res))
      .catch(() => setPortalAnalytics(null));
    return undefined;
  }, [hasMounted]);

  useEffect(() => {
    const cancelSchedulesMount = scheduleDeferredMount(() => {
      setShowSchedulesSection(true);
    }, DASHBOARD_SCHEDULE_SECTION_DEFER_MS);
    const cancelNotificationsMount = scheduleDeferredMount(() => {
      setShowNotificationsSection(true);
    }, DASHBOARD_NOTIFICATIONS_SECTION_DEFER_MS);

    return () => {
      cancelSchedulesMount();
      cancelNotificationsMount();
    };
  }, []);

  const handleOpenScheduleDate = useCallback(
    (rawDate) => {
      router.push(`/trainer/dashboard`);
    },
    [router],
  );

  const statCards = useMemo(
    () => [
      {
        label: "Upcoming",
        value: dashboardStats.upcoming,
        icon: CalendarDays,
        className:
          "bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white shadow-blue-500/25",
      },
      {
        label: "Completed",
        value: dashboardStats.completed,
        icon: CheckCircle2,
        className:
          "bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-600 text-white shadow-emerald-500/25",
      },
      {
        label: "Pending",
        value: dashboardStats.pending,
        icon: Clock3,
        className:
          "bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 text-white shadow-amber-500/25",
      },
      {
        label: "Colleges",
        value: dashboardStats.colleges,
        icon: GraduationCap,
        className:
          "bg-gradient-to-br from-fuchsia-500 via-purple-500 to-violet-600 text-white shadow-violet-500/25",
      },
    ],
    [dashboardStats],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-3 sm:space-y-6 sm:px-6 lg:px-8">
      <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-6 shadow-sm sm:rounded-[28px] sm:px-8 sm:py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-4 text-center">
          <div>
            <p className="text-sm font-medium text-slate-500">Trainer Portal</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Welcome back
            </h1>
            <p className="mt-3 text-sm text-slate-500 sm:text-base">
              Use the activity workflow below to manage your day.
            </p>
          </div>

          <div className="w-full max-w-sm">
            <button
              type="button"
              onClick={() => router.push('/trainer/activities')}
              className="inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Trainer Activities
            </button>
          </div>
        </div>
      </section>

      {dashboardError ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          {dashboardError}
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3 sm:gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`min-h-[120px] rounded-[18px] px-4 py-4 shadow-lg sm:min-h-[140px] sm:rounded-[24px] sm:px-5 sm:py-5 ${card.className}`}
          >
            <card.icon className="mb-4 h-7 w-7 text-white/90 sm:mb-5 sm:h-9 sm:w-9" />
            {dashboardLoading ? (
              <div className="h-9 w-16 animate-pulse rounded bg-white/25 sm:h-12 sm:w-20" />
            ) : (
              <div className="text-2xl font-bold leading-none sm:text-5xl">{card.value}</div>
            )}
            <div className="mt-3 text-sm font-medium text-white/90 sm:mt-3 sm:text-lg">
              {card.label}
            </div>
          </div>
        ))}
      </section>

      {portalAnalytics ? (
        <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold text-slate-950">Today&apos;s Attendance Overview</h2>
          {!portalAnalytics.hasAssignment ? (
            <p className="mt-3 text-sm text-amber-700">
              {portalAnalytics.assignmentMessage || "No college has been assigned by Admin."}
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: "Assigned College", value: portalAnalytics.assignedCollege || "—" },
                { label: "Present", value: portalAnalytics.presentStudents ?? 0 },
                { label: "Absent", value: portalAnalytics.absentStudents ?? 0 },
                { label: "Attendance %", value: `${portalAnalytics.attendancePercentage ?? 0}%` },
                { label: "Activities", value: portalAnalytics.todaysActivities ?? 0 },
                {
                  label: "Clock-In",
                  value: portalAnalytics.clockInStatus?.checkedIn ? "Done" : "Pending",
                },
                {
                  label: "Clock-Out",
                  value: portalAnalytics.clockOutStatus?.checkedOut ? "Done" : "Pending",
                },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {showNotificationsSection ? (
        <TrainerDashboardNotificationsSection currentUserRole={currentUser?.role} />
      ) : (
        <NotificationsSectionSkeleton />
      )}

      {showSchedulesSection && !dashboardLoading ? (
        <TrainerDashboardSchedulesSection
          recentActivities={dashboardRecentActivities}
          upcomingSchedules={dashboardUpcomingSchedules}
          onOpenScheduleDate={handleOpenScheduleDate}
        />
      ) : (
        <SchedulesSectionSkeleton />
      )}
    </div>
  );
}

export default memo(TrainerDashboard);
