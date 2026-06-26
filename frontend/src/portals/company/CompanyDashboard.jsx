"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  BarChart3,
  Building2,
  CalendarClock,
  CalendarPlus,
  GraduationCap,
  Loader2,
  Users,
  X,
} from "lucide-react";

import PortalLoadingState from "@/components/common/PortalLoadingState";
import SearchableDropdown from "@/components/SearchableDropdown";
import { usePortalRoleGuard } from "@/hooks/usePortalRoleGuard";
import { companyPortalService } from "@/services/companyPortalService";
import scheduleService from "@/services/scheduleService";
import { TRAINING_COURSES, filterCourses } from "@/services/courseEnhancedService";
import { 
  filterColleges as filterCollegesFromList,
  getAllColleges as getAllTamilNaduColleges 
} from "@/services/tamilNaduCollegeService";

const MetricCard = ({ label, value, icon: Icon, href }) => (
  <Link
    href={href || "#"}
    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
  >
    <div className="mb-3 inline-flex rounded-xl bg-blue-50 p-2.5 text-blue-600">
      <Icon className="h-5 w-5" />
    </div>
    <p className="text-sm text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
  </Link>
);

const INITIAL_FORM = {
  trainerId: "",
  collegeId: "",
  courseId: "",
  scheduledDate: "",
  startTime: "",
  endTime: "",
  dayNumber: 1,
  subject: "",
};

export default function CompanyDashboard() {
  const { allowed, loading: authLoading } = usePortalRoleGuard("company");
  const [profile, setProfile] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [monitoring, setMonitoring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* ── Schedule Modal state ────────────────────────────── */
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(INITIAL_FORM);
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleSuccess, setScheduleSuccess] = useState("");

  /* dropdown data */
  const [trainers, setTrainers] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [courses, setCourses] = useState([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(false);

  /* ── Load dashboard data ─────────────────────────────── */
  useEffect(() => {
    if (!allowed) return undefined;

    let cancelled = false;
    const load = async () => {
      try {
        setError("");
        // Only block the dashboard on the lightweight profile call so the page
        // appears immediately. Metrics + monitoring (heavier aggregations) are
        // loaded in the background and fill in when ready.
        const profileRes = await companyPortalService.getProfile();
        if (cancelled) return;

        if (profileRes.success) {
          setProfile(profileRes.company);
        } else {
          setError(profileRes.message || "Failed to load company profile");
        }
      } catch {
        if (!cancelled) setError("Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Background (non-blocking) secondary data.
    const loadSecondary = async () => {
      const [metricsRes, monitoringRes] = await Promise.all([
        companyPortalService.getDashboardMetrics().catch(() => null),
        companyPortalService.getTodayMonitoring().catch(() => null),
      ]);
      if (cancelled) return;
      if (metricsRes?.success) setMetrics(metricsRes.data);
      if (monitoringRes?.success) setMonitoring(monitoringRes.data || []);
    };

    load();
    loadSecondary();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  /* ── Fetch dropdown data when modal opens ────────────── */
  const loadDropdowns = useCallback(async () => {
    setDropdownsLoading(true);
    try {
      const [trainerRes, collegeRes] = await Promise.all([
        companyPortalService.getTrainers().catch(() => null),
        companyPortalService.getColleges().catch(() => null),
      ]);

      if (trainerRes?.success) setTrainers(trainerRes.data || []);
      
      // Combine API colleges with Tamil Nadu colleges
      const apiColleges = collegeRes?.data || [];
      const combinedColleges = [
        ...apiColleges,
        ...getAllTamilNaduColleges()
      ].reduce((acc, college, index) => {
        // Remove duplicates by name
        const isDuplicate = acc.some((c) => c.name?.toLowerCase() === college.name?.toLowerCase());
        if (!isDuplicate) acc.push(college);
        return acc;
      }, []);
      
      setColleges(combinedColleges);
      
      // Use predefined courses (already comprehensive)
      setCourses(TRAINING_COURSES);
    } catch {
      // Fallback to predefined data if API fails
      setCourses(TRAINING_COURSES);
    } finally {
      setDropdownsLoading(false);
    }
  }, []);

  const openScheduleModal = () => {
    setScheduleForm(INITIAL_FORM);
    setScheduleError("");
    setScheduleSuccess("");
    setShowScheduleModal(true);
    loadDropdowns();
  };

  const closeScheduleModal = () => {
    setShowScheduleModal(false);
    setScheduleError("");
    setScheduleSuccess("");
  };

  const handleScheduleChange = (e) => {
    const { name, value } = e.target;
    setScheduleForm((prev) => ({ ...prev, [name]: value }));
  };

  /* ── Submit schedule ─────────────────────────────────── */
  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    setScheduleError("");
    setScheduleSuccess("");

    if (!scheduleForm.trainerId || !scheduleForm.collegeId || !scheduleForm.scheduledDate) {
      setScheduleError("Please select a trainer, college, and date.");
      return;
    }

    try {
      setScheduleSubmitting(true);

      const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
      const user = userStr ? JSON.parse(userStr) : null;

      await scheduleService.createSchedule({
        trainerId: scheduleForm.trainerId,
        companyId: profile?._id || profile?.id || undefined,
        collegeId: scheduleForm.collegeId,
        courseId: scheduleForm.courseId || undefined,
        scheduledDate: scheduleForm.scheduledDate,
        startTime: scheduleForm.startTime || undefined,
        endTime: scheduleForm.endTime || undefined,
        dayNumber: parseInt(scheduleForm.dayNumber, 10) || 1,
        subject: scheduleForm.subject || undefined,
        createdBy: user?.id,
      });

      setScheduleSuccess("Schedule created successfully!");
      setScheduleForm(INITIAL_FORM);

      /* auto-close after brief success message */
      setTimeout(() => {
        closeScheduleModal();
      }, 1500);
    } catch (err) {
      console.error("Error creating schedule:", err);
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to create schedule. Please try again.";
      setScheduleError(msg);
    } finally {
      setScheduleSubmitting(false);
    }
  };

  /* ── Guards ──────────────────────────────────────────── */
  if (authLoading || !allowed) {
    return <PortalLoadingState title="Loading company portal" description="Verifying your session." />;
  }

  if (loading) {
    return <PortalLoadingState title="Loading dashboard" description="Fetching company metrics." />;
  }

  if (error && !profile) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700">{error}</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Hero section with Schedule button ──────────── */}
      <section className="rounded-3xl bg-gradient-to-br from-[#1d5f87] to-[#2b6d93] p-6 text-white shadow-lg md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-blue-100">Company Portal</p>
            <h1 className="mt-2 text-2xl font-bold md:text-3xl">{profile?.name || "Company Dashboard"}</h1>
            <p className="mt-2 text-blue-100">
              Welcome, {profile?.adminName || "Admin"}. Monitor training sessions, colleges, and trainer activity.
            </p>
            {profile?.companyCode ? (
              <p className="mt-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-sm font-medium">
                Code: {profile.companyCode}
              </p>
            ) : null}
          </div>

          {/* ── Schedule New button ── */}
          <button
            type="button"
            onClick={openScheduleModal}
            className="inline-flex items-center gap-2 self-start rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-[#1d5f87] shadow-md transition hover:bg-blue-50 hover:shadow-lg active:scale-[0.97]"
          >
            <CalendarPlus className="h-5 w-5" />
            Schedule New
          </button>
        </div>
      </section>

      {/* ── Metric cards ──────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Sessions"
          value={metrics?.totalSessions ?? "—"}
          icon={CalendarClock}
          href="/company/sessions"
        />
        <MetricCard
          label="Completed"
          value={metrics?.completedSessions ?? "—"}
          icon={BarChart3}
          href="/company/reports"
        />
        <MetricCard
          label="Active Trainers"
          value={metrics?.activeTrainers ?? "—"}
          icon={Users}
          href="/company/hiring"
        />
        <MetricCard
          label="Colleges"
          value={metrics?.totalColleges ?? "—"}
          icon={GraduationCap}
          href="/company/colleges"
        />
      </div>

      {/* ── Today's Monitoring ────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Today&apos;s Monitoring</h2>
            <p className="text-sm text-slate-500">Live trainer assignments for today</p>
          </div>
          <Link href="/company/monitoring" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
            View all →
          </Link>
        </div>

        {monitoring.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No sessions scheduled for today.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Trainer</th>
                  <th className="py-2 pr-4 font-medium">College</th>
                  <th className="py-2 pr-4 font-medium">Course</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {monitoring.slice(0, 5).map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4">{row.trainer?.name}</td>
                    <td className="py-3 pr-4">{row.college?.name}</td>
                    <td className="py-3 pr-4">{row.course}</td>
                    <td className="py-3">{row.attendanceStatus || row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Quick‑links ───────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/company/sessions"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200"
        >
          <Building2 className="h-5 w-5 text-blue-600" />
          <h3 className="mt-3 font-semibold text-slate-900">Training Sessions</h3>
          <p className="mt-1 text-sm text-slate-500">Browse scheduled and completed sessions.</p>
        </Link>
        <Link
          href="/company/reports"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200"
        >
          <BarChart3 className="h-5 w-5 text-blue-600" />
          <h3 className="mt-3 font-semibold text-slate-900">Workflow Reports</h3>
          <p className="mt-1 text-sm text-slate-500">Review attendance and session outcomes.</p>
        </Link>
        <Link
          href="/company/profile"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200"
        >
          <Users className="h-5 w-5 text-blue-600" />
          <h3 className="mt-3 font-semibold text-slate-900">Company Profile</h3>
          <p className="mt-1 text-sm text-slate-500">Update admin contact details.</p>
        </Link>
      </div>

      {/* ══════════════════════════════════════════════════
          Schedule New — Modal
         ══════════════════════════════════════════════════ */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeScheduleModal}
            aria-hidden="true"
          />

          {/* modal panel */}
          <div className="relative z-10 mx-4 w-full max-w-lg animate-[fadeScaleIn_0.2s_ease-out] rounded-2xl bg-white shadow-2xl">
            {/* header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <CalendarPlus className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">Schedule New Session</h2>
              </div>
              <button
                type="button"
                onClick={closeScheduleModal}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* body */}
            <form onSubmit={handleScheduleSubmit} className="space-y-4 px-6 py-5">
              {scheduleError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {scheduleError}
                </div>
              )}
              {scheduleSuccess && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
                  {scheduleSuccess}
                </div>
              )}

              {dropdownsLoading ? (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading options…
                </div>
              ) : (
                <>
                  {/* Trainer - Searchable Dropdown */}
                  <SearchableDropdown
                    label="Trainer"
                    id="sched-trainer"
                    placeholder="Search trainer by name..."
                    options={trainers}
                    value={scheduleForm.trainerId}
                    onChange={(trainer) => setScheduleForm((prev) => ({ 
                      ...prev, 
                      trainerId: trainer?._id || trainer?.id || "" 
                    }))}
                    getOptionLabel={(trainer) => 
                      trainer?.name || [trainer?.firstName, trainer?.lastName].filter(Boolean).join(" ")
                    }
                    getOptionValue={(trainer) => trainer?._id || trainer?.id}
                    searchFields={["firstName", "lastName", "email"]}
                    showSearch={true}
                    error={scheduleError && scheduleForm.trainerId === "" ? "Trainer is required" : ""}
                  />

                  {/* College - Searchable Dropdown */}
                  <SearchableDropdown
                    label="College"
                    id="sched-college"
                    placeholder="Search college by name or city..."
                    options={colleges}
                    value={scheduleForm.collegeId}
                    onChange={(college) => setScheduleForm((prev) => ({ 
                      ...prev, 
                      collegeId: college?._id || college?.id || "" 
                    }))}
                    getOptionLabel={(college) => college?.name}
                    getOptionValue={(college) => college?._id || college?.id}
                    searchFields={["name", "city"]}
                    showSearch={true}
                    error={scheduleError && scheduleForm.collegeId === "" ? "College is required" : ""}
                  />

                  {/* Course - Searchable Dropdown */}
                  <SearchableDropdown
                    label="Course"
                    id="sched-course"
                    placeholder="Search course by name..."
                    options={courses}
                    value={scheduleForm.courseId}
                    onChange={(course) => setScheduleForm((prev) => ({ 
                      ...prev, 
                      courseId: course?._id || course?.id || "" 
                    }))}
                    getOptionLabel={(course) => course?.name || course?.title}
                    getOptionValue={(course) => course?._id || course?.id}
                    searchFields={["name", "title", "description"]}
                    showSearch={true}
                  />

                  {/* Date */}
                  <div>
                    <label htmlFor="sched-date" className="mb-1 block text-sm font-medium text-slate-700">
                      Scheduled Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="sched-date"
                      type="date"
                      name="scheduledDate"
                      value={scheduleForm.scheduledDate}
                      onChange={handleScheduleChange}
                      required
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Time row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="sched-start" className="mb-1 block text-sm font-medium text-slate-700">
                        Start Time
                      </label>
                      <input
                        id="sched-start"
                        type="time"
                        name="startTime"
                        value={scheduleForm.startTime}
                        onChange={handleScheduleChange}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="sched-end" className="mb-1 block text-sm font-medium text-slate-700">
                        End Time
                      </label>
                      <input
                        id="sched-end"
                        type="time"
                        name="endTime"
                        value={scheduleForm.endTime}
                        onChange={handleScheduleChange}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Day Number + Subject row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="sched-day" className="mb-1 block text-sm font-medium text-slate-700">
                        Day Number
                      </label>
                      <input
                        id="sched-day"
                        type="number"
                        name="dayNumber"
                        min="1"
                        value={scheduleForm.dayNumber}
                        onChange={handleScheduleChange}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="sched-subject" className="mb-1 block text-sm font-medium text-slate-700">
                        Subject
                      </label>
                      <input
                        id="sched-subject"
                        type="text"
                        name="subject"
                        placeholder="e.g. React Basics"
                        value={scheduleForm.subject}
                        onChange={handleScheduleChange}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* actions */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={closeScheduleModal}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scheduleSubmitting || dropdownsLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1d5f87] px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-[#174d6e] disabled:opacity-60"
                >
                  {scheduleSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {scheduleSubmitting ? "Creating…" : "Create Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* modal entrance animation */}
      <style jsx global>{`
        @keyframes fadeScaleIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
