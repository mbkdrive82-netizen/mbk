"use client";

import dynamic from "next/dynamic";
import { memo } from "react";

const TrainerReports = dynamic(
  () => import("@/portals/trainer/TrainerReports"),
  {
    loading: () => (
      <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
    ),
    ssr: false,
  },
);

function TrainerReportsPage() {
  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
      <TrainerReports />
    </div>
  );
}

export default memo(TrainerReportsPage);
