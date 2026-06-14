"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Filter, Loader2 } from "lucide-react";
import TrainerCollegeGuard from "@/components/trainer/TrainerCollegeGuard";
import { getTrainerAttendanceRecords } from "@/services/trainerPortalService";
import { API_BASE_URL } from "@/services/api";

const PERIOD_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function TrainerStudentAttendanceRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("daily");
  const [date, setDate] = useState("");
  const [batch, setBatch] = useState("");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { period };
      if (date) params.date = date;
      if (batch) params.batchName = batch;
      const res = await getTrainerAttendanceRecords(params);
      setRecords(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err?.message || "Failed to load attendance records.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [batch, date, period]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams({ period, format: "excel" });
    if (date) params.set("date", date);
    if (batch) params.set("batchName", batch);
    return `${API_BASE_URL}/trainer-portal/attendance-records/export?${params.toString()}`;
  }, [batch, date, period]);

  return (
    <TrainerCollegeGuard>
      <div className="space-y-6 py-4">
        <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-8">
          <h1 className="text-2xl font-bold text-slate-950">Student Attendance Records</h1>
          <p className="mt-1 text-sm text-slate-500">
            View daily, weekly, and monthly attendance with filters and export.
          </p>

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Period</span>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Batch</span>
              <input
                type="text"
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                placeholder="Batch name"
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={loadRecords}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0f3f5c] px-4 py-2 text-sm font-semibold text-white"
            >
              <Filter className="h-4 w-4" />
              Apply Filters
            </button>
            <a
              href={exportUrl}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              <Download className="h-4 w-4" />
              Export Excel
            </a>
          </div>
        </section>

        <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center p-10 text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading records…
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-rose-700">{error}</div>
          ) : records.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No attendance records found for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">College</th>
                    <th className="px-4 py-3">Batch</th>
                    <th className="px-4 py-3">Present</th>
                    <th className="px-4 py-3">Absent</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((row) => (
                    <tr key={row.id || `${row.date}-${row.college}`} className="border-b border-slate-100">
                      <td className="px-4 py-3">
                        {row.date ? new Date(row.date).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3">{row.college || "—"}</td>
                      <td className="px-4 py-3">{row.batchName || "—"}</td>
                      <td className="px-4 py-3">{row.studentsPresent ?? 0}</td>
                      <td className="px-4 py-3">{row.studentsAbsent ?? 0}</td>
                      <td className="px-4 py-3">{row.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </TrainerCollegeGuard>
  );
}

export default memo(TrainerStudentAttendanceRecords);
