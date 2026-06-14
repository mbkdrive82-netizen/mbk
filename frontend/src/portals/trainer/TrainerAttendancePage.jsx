"use client";

import dynamic from "next/dynamic";
import { memo } from "react";
import { ClipboardList } from "lucide-react";
import TrainerCollegeGuard from "@/components/trainer/TrainerCollegeGuard";

/* ── lazy-load the existing attendance upload section ──────── */
const AttendanceUploadSection = dynamic(
  () => import("./dashboard/AttendanceUploadSection"),
  {
    loading: () => (
      <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm sm:rounded-[28px]">
        <div className="h-32 animate-pulse bg-slate-100 rounded-[24px]" />
      </section>
    ),
    ssr: false,
  },
);

/* ── lazy-load attendance history (reuse existing backend) ─── */
const TrainerAttendanceHistory = dynamic(
  () => import("./attendance/TrainerAttendanceHistory"),
  {
    loading: () => (
      <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm sm:rounded-[28px]">
        <div className="h-48 animate-pulse bg-slate-100 rounded-[24px]" />
      </section>
    ),
    ssr: false,
  },
);

function TrainerAttendancePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-3 sm:space-y-6 sm:px-6 lg:px-8">
      {/* ── page header ─────────────────────────────────────── */}
      <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:rounded-[28px] sm:px-8 sm:py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#0f3f5c] to-[#1a6b9e] shadow-md">
            <ClipboardList className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
              Attendance Upload
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Submit your geo-tagged attendance and view your history
            </p>
          </div>
        </div>
      </section>

      {/* ── attendance upload form ───────────────────────────── */}
      <TrainerCollegeGuard>
        <AttendanceUploadSection />
      </TrainerCollegeGuard>

      {/* ── attendance history ───────────────────────────────── */}
      <TrainerAttendanceHistory />
    </div>
  );
}

export default memo(TrainerAttendancePage);
