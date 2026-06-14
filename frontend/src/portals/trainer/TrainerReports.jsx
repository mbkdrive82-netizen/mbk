"use client";

import { memo, useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import TrainerCollegeGuard from "@/components/trainer/TrainerCollegeGuard";
import { getTrainerDashboardAnalytics } from "@/services/trainerPortalService";

function TrainerReports() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getTrainerDashboardAnalytics()
      .then((res) => setAnalytics(res?.data || res))
      .catch((err) => setError(err?.message || "Failed to load reports."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <TrainerCollegeGuard>
      <div className="space-y-6 py-4">
        <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#0f3f5c] to-[#1a6b9e]">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-950">Reports</h1>
              <p className="mt-1 text-sm text-slate-500">
                Attendance summary and activity overview for your assigned college.
              </p>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading reports…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">{error}</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Assigned College", value: analytics?.assignedCollege || "—" },
              { label: "Total Students", value: analytics?.totalStudents ?? 0 },
              { label: "Present Students", value: analytics?.presentStudents ?? 0 },
              { label: "Absent Students", value: analytics?.absentStudents ?? 0 },
              { label: "Today's Activities", value: analytics?.todaysActivities ?? 0 },
              { label: "Attendance %", value: `${analytics?.attendancePercentage ?? 0}%` },
              {
                label: "Clock-In Status",
                value: analytics?.clockInStatus?.checkedIn ? "Checked In" : "Not Checked In",
              },
              {
                label: "Clock-Out Status",
                value: analytics?.clockOutStatus?.checkedOut ? "Checked Out" : "Not Checked Out",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {item.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{item.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </TrainerCollegeGuard>
  );
}

export default memo(TrainerReports);
