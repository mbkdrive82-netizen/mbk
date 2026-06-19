"use client";

import { memo } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  MapPin,
} from "lucide-react";

import { getStatusMeta } from "./dashboardUtils";

function TrainerDashboardSchedulesSection({
  recentActivities,
  upcomingSchedules,
  onOpenScheduleDate,
}) {
  return (
    <>
      <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm sm:rounded-[28px]">
        <div className="border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                Upcoming Sessions
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Your next assigned sessions and scheduled classes.
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-6 sm:py-5">
          {upcomingSchedules.length > 0 ? (
            <div className="space-y-3 sm:space-y-4">
              {upcomingSchedules.slice(0, 4).map((schedule) => {
                const statusMeta = getStatusMeta(schedule.status);

                return (
                  <button
                    key={schedule.id}
                    type="button"
                    onClick={() => onOpenScheduleDate(schedule.rawDate)}
                    className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50 md:flex-row md:items-center md:justify-between md:px-5"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                        {schedule.college}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">{schedule.course}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                          Day {schedule.dayNumber}
                        </span>
                        <span className="inline-flex items-center">
                          <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                          {schedule.dateLabel}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.className}`}
                      >
                        {statusMeta.label}
                      </span>
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center sm:px-6 sm:py-14">
              <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-4 text-lg font-semibold text-slate-700">
                No upcoming sessions
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Your next assigned classes will appear here.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm sm:rounded-[28px]">
        <div className="border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                Recent Activity
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Your latest completed or submitted trainer sessions.
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 sm:px-6">
          {recentActivities.length > 0 ? (
            <div className="space-y-3">
              {recentActivities.map((activity) => {
                const statusMeta = getStatusMeta(activity.status);

                return (
                  <button
                    key={activity.id}
                    type="button"
                    onClick={() => onOpenScheduleDate(activity.rawDate)}
                    className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50 md:flex-row md:items-center md:justify-between md:px-5"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                        {activity.college}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                        <span className="inline-flex items-center">
                          <BookOpen className="mr-1.5 h-4 w-4" />
                          {activity.course}
                        </span>
                        <span className="inline-flex items-center">
                          <MapPin className="mr-1.5 h-4 w-4" />
                          {activity.dateLabel}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${statusMeta.className}`}
                    >
                      {statusMeta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center sm:px-6 sm:py-14">
              <CheckCircle2 className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-4 text-lg font-semibold text-slate-700">
                No recent activity
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Completed sessions will appear here after your classes are updated.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export default memo(TrainerDashboardSchedulesSection);
