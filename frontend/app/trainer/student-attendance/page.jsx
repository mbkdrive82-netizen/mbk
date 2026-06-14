"use client";

import dynamic from "next/dynamic";
import { memo } from "react";

const TrainerStudentAttendanceRecords = dynamic(
  () => import("@/portals/trainer/TrainerStudentAttendanceRecords"),
  {
    loading: () => (
      <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
    ),
    ssr: false,
  },
);

function TrainerStudentAttendancePage() {
  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
      <TrainerStudentAttendanceRecords />
    </div>
  );
}

export default memo(TrainerStudentAttendancePage);
