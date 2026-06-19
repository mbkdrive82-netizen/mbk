"use client";

import { useEffect, useState } from "react";

import PortalLoadingState from "@/components/common/PortalLoadingState";
import { usePortalRoleGuard } from "@/hooks/usePortalRoleGuard";
import { companyPortalService } from "@/services/companyPortalService";
import {
  clearTrainerDashboardScheduleSummaryCache,
  clearTrainerDashboardSnapshot,
  signalTrainerDashboardRefresh,
  normalizeTrainerId,
} from "@/portals/trainer/dashboard/dashboardUtils";

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
};

export default function CompanySessions() {
  const { allowed, loading: authLoading } = usePortalRoleGuard("company");
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [processingScheduleId, setProcessingScheduleId] = useState(null);

  useEffect(() => {
    if (!allowed) return undefined;

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        setSuccessMessage("");
        const response = await companyPortalService.getTrainingSessions({ limit: 50 });
        if (!cancelled) {
          if (response.success) setSessions(response.data || []);
          else setError(response.message || "Failed to load sessions");
        }
      } catch {
        if (!cancelled) setError("Failed to load sessions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const handleDeleteSchedule = async (session) => {
    const scheduleId = session?._id;
    if (!scheduleId) return;

    const confirmed = window.confirm(
      "Are you sure you want to cancel this scheduled session?",
    );
    if (!confirmed) return;

    const reason = window.prompt(
      "Please provide a reason for cancellation (optional):",
      "",
    );

    try {
      setProcessingScheduleId(scheduleId);
      setError("");
      setSuccessMessage("");

      await companyPortalService.deleteSchedule(scheduleId, reason || "");
      setSessions((prev) => prev.filter((item) => item._id !== scheduleId));
      setSuccessMessage("Session cancelled successfully.");

      const trainerId = normalizeTrainerId(session.trainerId || session.trainer || null);
      if (trainerId) {
        clearTrainerDashboardScheduleSummaryCache(trainerId);
        clearTrainerDashboardSnapshot(trainerId);
        signalTrainerDashboardRefresh(trainerId);
      }
    } catch (err) {
      console.error("Error cancelling session:", err);
      setError("Failed to cancel session. Please try again.");
    } finally {
      setProcessingScheduleId(null);
    }
  };

  const handleRescheduleSchedule = async (session) => {
    const scheduleId = session?._id;
    if (!scheduleId) return;

    const currentDate = session.scheduledDate ? session.scheduledDate.slice(0, 10) : "";
    const newScheduledDate = window.prompt(
      "Enter a new scheduled date for this session (YYYY-MM-DD):",
      currentDate,
    );
    if (!newScheduledDate) return;

    const parsedDate = new Date(newScheduledDate);
    if (Number.isNaN(parsedDate.getTime()) || newScheduledDate.length !== 10) {
      setError("Please enter a valid date in YYYY-MM-DD format.");
      return;
    }

    const reason = window.prompt(
      "Provide a reason for rescheduling this session (optional):",
      "",
    );

    try {
      setProcessingScheduleId(scheduleId);
      setError("");
      setSuccessMessage("");

      const response = await companyPortalService.updateSchedule(scheduleId, {
        scheduledDate: newScheduledDate,
        rescheduleReason: reason || undefined,
      });

      if (response?.success) {
        setSessions((prev) =>
          prev.map((item) =>
            item._id === scheduleId
              ? {
                  ...item,
                  scheduledDate: newScheduledDate,
                  rescheduleReason: reason || item.rescheduleReason,
                }
              : item,
          ),
        );
        setSuccessMessage("Session rescheduled successfully.");
      } else {
        setError(response?.message || "Failed to reschedule session.");
      }

      const trainerId = normalizeTrainerId(session.trainerId || session.trainer || null);
      if (trainerId) {
        clearTrainerDashboardScheduleSummaryCache(trainerId);
        clearTrainerDashboardSnapshot(trainerId);
        signalTrainerDashboardRefresh(trainerId);
      }
    } catch (err) {
      console.error("Error rescheduling session:", err);
      setError("Failed to reschedule session. Please try again.");
    } finally {
      setProcessingScheduleId(null);
    }
  };

  if (authLoading || !allowed) {
    return <PortalLoadingState title="Loading sessions" description="Verifying access." />;
  }

  if (loading) {
    return <PortalLoadingState title="Loading sessions" description="Fetching training sessions." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Training Sessions</h1>
        <p className="mt-1 text-slate-600">All scheduled and completed training sessions for your company.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {successMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">College</th>
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Trainer</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session._id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{formatDate(session.scheduledDate)}</td>
                  <td className="px-4 py-3">{session.collegeId?.name || "—"}</td>
                  <td className="px-4 py-3">{session.courseId?.name || "—"}</td>
                  <td className="px-4 py-3">
                    {session.trainerId?.name ||
                      [session.trainerId?.firstName, session.trainerId?.lastName].filter(Boolean).join(" ") ||
                      "Unassigned"}
                  </td>
                  <td className="px-4 py-3">{session.status || "—"}</td>
                  <td className="px-4 py-3">
                    {session.status?.toLowerCase() === "cancelled" ? (
                      <span className="text-sm text-slate-500">Cancelled</span>
                    ) : (
                      <button
                        type="button"
                        disabled={processingScheduleId === session._id}
                        onClick={() => handleDeleteSchedule(session)}
                        className="inline-flex items-center rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 disabled:hover:bg-rose-600"
                      >
                        {processingScheduleId === session._id ? "Cancelling..." : "Cancel"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && sessions.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No training sessions found.</p>
        ) : null}
      </div>
    </div>
  );
}
