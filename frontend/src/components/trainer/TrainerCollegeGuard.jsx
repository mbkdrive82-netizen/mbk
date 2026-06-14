"use client";

import { memo, useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { getTrainerAssignment } from "@/services/trainerPortalService";

function TrainerCollegeGuard({ children, fallback = null }) {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getTrainerAssignment()
      .then((res) => {
        if (cancelled) return;
        const data = res?.data || res;
        setAssignment(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Unable to verify college assignment.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      fallback || (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          <span className="ml-3 text-sm text-slate-600">Checking college assignment…</span>
        </div>
      )
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        {error}
      </div>
    );
  }

  if (!assignment?.hasAssignment) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <h3 className="font-semibold text-amber-900">College Assignment Required</h3>
            <p className="mt-1 text-sm text-amber-800">
              {assignment?.message || "No college has been assigned by Admin."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return children;
}

export default memo(TrainerCollegeGuard);
