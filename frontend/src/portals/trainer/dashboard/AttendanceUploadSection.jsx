"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  CloudUpload,
  ImagePlus,
  Loader2,
  MapPin,
  RefreshCw,
  Trash2,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";

/* ─── helpers ───────────────────────────────────────────────── */

const formatCoord = (val) =>
  typeof val === "number" ? val.toFixed(6) : "—";

const readAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/** Resolve trainerId + scheduleId from the user and today's schedules */
const fetchTodaySchedule = async (trainerId) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const res = await api.get(
      `/attendance/trainer/${trainerId}?assignedDate=${today}`,
    );
    const records = res?.data || res || [];
    const arr = Array.isArray(records) ? records : [];
    return arr.find((r) => r.scheduleId) || null;
  } catch {
    return null;
  }
};

/* ─── sub-components ────────────────────────────────────────── */

const StatusBadge = ({ status, label }) => {
  const map = {
    idle: "bg-slate-100 text-slate-600",
    locating: "bg-amber-100 text-amber-700",
    ready: "bg-emerald-100 text-emerald-700",
    error: "bg-rose-100 text-rose-700",
    uploading: "bg-blue-100 text-blue-700",
    success: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${map[status] ?? map.idle}`}
    >
      {label}
    </span>
  );
};

/* ─── main component ────────────────────────────────────────── */

function AttendanceUploadSection() {
  const { currentUser } = useAuth();

  /* location state */
  const [location, setLocation] = useState(null); // {lat, lng, accuracy, timestamp}
  const [locationStatus, setLocationStatus] = useState("idle"); // idle|locating|ready|error
  const [locationError, setLocationError] = useState("");

  /* attendance status */
  const [attendanceStatus, setAttendanceStatus] = useState(null); // null | "Present" | "Absent"

  /* check-in image state */
  const [checkInImageFile, setCheckInImageFile] = useState(null);
  const [checkInImagePreview, setCheckInImagePreview] = useState(null);

  /* check-out image state */
  const [checkOutImageFile, setCheckOutImageFile] = useState(null);
  const [checkOutImagePreview, setCheckOutImagePreview] = useState(null);

  /* upload state */
  const [uploadStatus, setUploadStatus] = useState("idle"); // idle|uploading|success|error
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState("");

  /* schedule / trainer ids */
  const [scheduleInfo, setScheduleInfo] = useState(null); // {scheduleId, attendanceId, trainerId}
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const checkInFileInputRef = useRef(null);
  const checkInCameraInputRef = useRef(null);
  const checkOutFileInputRef = useRef(null);
  const checkOutCameraInputRef = useRef(null);

  /* ── get trainer ID from current user ─────────────────────── */
  const trainerId =
    currentUser?.trainerId ||
    currentUser?.trainer_id ||
    currentUser?.id ||
    currentUser?._id;

  /* ── resolve today's schedule on mount ─────────────────────── */
  useEffect(() => {
    if (!trainerId) return;
    setScheduleLoading(true);
    fetchTodaySchedule(trainerId)
      .then((record) => {
        if (record) {
          setScheduleInfo({
            scheduleId: record.scheduleId,
            attendanceId: record._id || record.id,
            trainerId: record.trainerId || trainerId,
          });
        }
      })
      .finally(() => setScheduleLoading(false));
  }, [trainerId]);

  /* ── geolocation ───────────────────────────────────────────── */
  const captureLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }

    setLocationStatus("locating");
    setLocationError("");
    setLocation(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
        setLocationStatus("ready");
      },
      (err) => {
        const messages = {
          1: "Location access denied. Please allow location permission and try again.",
          2: "Location unavailable. Ensure GPS/Wi-Fi is enabled.",
          3: "Location request timed out. Please try again.",
        };
        // Fallback to (0,0) so the process doesn't block the trainer
        setLocation({ lat: 0, lng: 0, accuracy: 0, timestamp: Date.now() });
        setLocationStatus("ready");
        setLocationError(messages[err.code] || "Failed to get location.");
        console.warn("Location acquisition failed, using fallback coordinates (0, 0)");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  /* auto-capture location on mount */
  useEffect(() => {
    captureLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── image handling ────────────────────────────────────────── */
  const handleCheckInFileChange = useCallback(async (file) => {
    if (!file) return;
    setCheckInImageFile(file);
    try {
      const preview = await readAsDataURL(file);
      setCheckInImagePreview(preview);
    } catch {
      setCheckInImagePreview(null);
    }
    setUploadStatus("idle");
    setUploadError("");
  }, []);

  const handleCheckOutFileChange = useCallback(async (file) => {
    if (!file) return;
    setCheckOutImageFile(file);
    try {
      const preview = await readAsDataURL(file);
      setCheckOutImagePreview(preview);
    } catch {
      setCheckOutImagePreview(null);
    }
    setUploadStatus("idle");
    setUploadError("");
  }, []);

  const handleCheckInFileInput = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) handleCheckInFileChange(file);
      e.target.value = "";
    },
    [handleCheckInFileChange],
  );

  const handleCheckOutFileInput = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) handleCheckOutFileChange(file);
      e.target.value = "";
    },
    [handleCheckOutFileChange],
  );

  const clearCheckInImage = useCallback(() => {
    setCheckInImageFile(null);
    setCheckInImagePreview(null);
    setUploadStatus("idle");
    setUploadError("");
  }, []);

  const clearCheckOutImage = useCallback(() => {
    setCheckOutImageFile(null);
    setCheckOutImagePreview(null);
    setUploadStatus("idle");
    setUploadError("");
  }, []);

  const handleStatusSelect = useCallback((status) => {
    setAttendanceStatus(status);
    setUploadError("");
  }, []);

  /* ── upload ─────────────────────────────────────────────────── */
  const handleUpload = useCallback(async () => {
    /* guard: status */
    if (!attendanceStatus) {
      setUploadError("Please select your attendance status (Present or Absent).");
      return;
    }
    /* guard: check-in image */
    if (!checkInImageFile) {
      setUploadError("Please capture or select a Check-in image.");
      return;
    }
    /* guard: check-out image if Present */
    if (attendanceStatus === "Present" && !checkOutImageFile) {
      setUploadError("Please capture or select a Check-out image.");
      return;
    }
    /* guard: location */
    if (locationStatus !== "ready" || !location) {
      setUploadError(
        "Location is required. Please allow location access and try again.",
      );
      return;
    }

    setUploadStatus("uploading");
    setUploadError("");

    try {
      const formData = new FormData();
      formData.append("check_in_image", checkInImageFile);
      if (attendanceStatus === "Present" && checkOutImageFile) {
        formData.append("check_out_image", checkOutImageFile);
        formData.append("checkOutTime", new Date().toTimeString().slice(0, 5));
      }
      formData.append("trainer_id", String(trainerId || ""));
      formData.append("attendance_date", new Date().toISOString().split("T")[0]);
      formData.append("status", attendanceStatus.toLowerCase());
      formData.append("checkInTime", new Date().toTimeString().slice(0, 5));

      /* attach location JSON string */
      formData.append(
        "location",
        JSON.stringify({
          latitude: location.lat,
          longitude: location.lng,
          accuracy: location.accuracy,
        }),
      );

      const result = await api.post("/student-activities/attendance/submit", formData);

      setUploadStatus("success");
      setUploadResult(result?.data || result);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Upload failed. Please try again.";
      setUploadStatus("error");
      setUploadError(msg);
    }
  }, [checkInImageFile, checkOutImageFile, location, locationStatus, trainerId, attendanceStatus]);

  /* ── reset ─────────────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    setCheckInImageFile(null);
    setCheckInImagePreview(null);
    setCheckOutImageFile(null);
    setCheckOutImagePreview(null);
    setAttendanceStatus(null);
    setUploadStatus("idle");
    setUploadResult(null);
    setUploadError("");
    captureLocation();
  }, [captureLocation]);

  /* ── derived ───────────────────────────────────────────────── */
  const canUpload =
    !!attendanceStatus &&
    !!checkInImageFile &&
    (attendanceStatus === "Absent" || !!checkOutImageFile) &&
    locationStatus === "ready" &&
    uploadStatus !== "uploading";

  const locationStatusLabel = {
    idle: "Not captured",
    locating: "Detecting…",
    ready: "Captured ✓",
    error: "Failed",
  }[locationStatus];

  /* ── render ─────────────────────────────────────────────────── */
  return (
    <section
      id="attendance-upload-section"
      className="rounded-[24px] border border-slate-200 bg-white shadow-sm sm:rounded-[28px] overflow-hidden"
    >
      {/* ── header ──────────────────────────────────────────── */}
      <div className="border-b border-slate-100 bg-gradient-to-r from-[#0f3f5c] to-[#1a6b9e] px-5 py-4 sm:px-7 sm:py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <Camera className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white sm:text-lg">
              Attendance Submission
            </h2>
            <p className="text-xs text-blue-100 sm:text-sm">
              Verify your daily trainer attendance with geo-tagged images
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-5 py-5 sm:px-7 sm:py-6">
        {/* ── success state ─────────────────────────────────── */}
        {uploadStatus === "success" && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-emerald-800">
                  Attendance uploaded successfully!
                </p>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1">
                  {attendanceStatus === "Present" ? (
                    <UserCheck className="h-3.5 w-3.5 text-emerald-700" />
                  ) : (
                    <UserX className="h-3.5 w-3.5 text-rose-600" />
                  )}
                  <span className={`text-xs font-bold ${
                    attendanceStatus === "Present" ? "text-emerald-800" : "text-rose-700"
                  }`}>
                    Marked as {attendanceStatus}
                  </span>
                </div>
                {uploadResult?.geo_verification && (
                  <p className="mt-2 text-xs text-emerald-700 font-medium">
                    Geo-verification check-in: {uploadResult.geo_verification.check_in}
                    {attendanceStatus === "Present" && ` | check-out: ${uploadResult.geo_verification.check_out}`}
                  </p>
                )}
                {location && (
                  <p className="mt-1 text-[10px] text-emerald-600">
                    📍 {formatCoord(location.lat)}, {formatCoord(location.lng)}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-200"
            >
              <RefreshCw className="h-4 w-4" />
              Submit Another
            </button>
          </div>
        )}

        {uploadStatus !== "success" && (
          <>
            {/* ── location panel ──────────────────────────── */}
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <MapPin
                    className={`h-4 w-4 shrink-0 ${
                      locationStatus === "ready"
                        ? "text-emerald-600"
                        : locationStatus === "error"
                          ? "text-rose-500"
                          : locationStatus === "locating"
                            ? "text-amber-500"
                            : "text-slate-400"
                    }`}
                  />
                  <span className="text-sm font-semibold text-slate-700">
                    GPS Location
                  </span>
                  <StatusBadge
                    status={locationStatus}
                    label={locationStatusLabel}
                  />
                </div>

                <button
                  type="button"
                  onClick={captureLocation}
                  disabled={locationStatus === "locating"}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                >
                  {locationStatus === "locating" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  {locationStatus === "locating" ? "Detecting…" : "Refresh"}
                </button>
              </div>

              {location && locationStatus === "ready" && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-white border border-slate-200 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Latitude
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-bold text-slate-800">
                      {formatCoord(location.lat)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white border border-slate-200 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Longitude
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-bold text-slate-800">
                      {formatCoord(location.lng)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white border border-slate-200 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Accuracy
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-slate-800">
                      ±{Math.round(location.accuracy ?? 0)} m
                    </p>
                  </div>
                </div>
              )}

              {locationStatus === "error" && locationError && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                  <p className="text-sm text-rose-700">{locationError}</p>
                </div>
              )}

              {locationStatus === "locating" && (
                <div className="mt-3 flex items-center gap-2 text-sm text-amber-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Acquiring GPS signal — please wait…
                </div>
              )}
            </div>

            {/* ── attendance status selector ───────────────── */}
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">
                Attendance Status{" "}
                <span className="text-rose-500">*</span>
              </p>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Attendance Status">
                {/* Present card */}
                <button
                  type="button"
                  id="attendance-status-present"
                  role="radio"
                  aria-checked={attendanceStatus === "Present"}
                  onClick={() => handleStatusSelect("Present")}
                  className={`group relative flex flex-col items-center gap-2.5 rounded-2xl border-2 px-4 py-4 text-center transition select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    attendanceStatus === "Present"
                      ? "border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100"
                      : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40"
                  }`}
                >
                  {attendanceStatus === "Present" && (
                    <span className="absolute inset-0 rounded-[14px] ring-2 ring-emerald-400/50 animate-pulse pointer-events-none" />
                  )}
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition ${
                    attendanceStatus === "Present"
                      ? "bg-emerald-500 shadow-lg shadow-emerald-200"
                      : "bg-slate-100 group-hover:bg-emerald-100"
                  }`}>
                    <UserCheck className={`h-5 w-5 ${
                      attendanceStatus === "Present" ? "text-white" : "text-slate-400 group-hover:text-emerald-600"
                    }`} />
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${
                      attendanceStatus === "Present" ? "text-emerald-800" : "text-slate-700"
                    }`}>
                      Present
                    </p>
                    <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                      I attended today
                    </p>
                  </div>
                  <span className={`absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full transition ${
                    attendanceStatus === "Present"
                      ? "bg-emerald-500"
                      : "border-2 border-slate-200"
                  }`}>
                    {attendanceStatus === "Present" && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                    )}
                  </span>
                </button>

                {/* Absent card */}
                <button
                  type="button"
                  id="attendance-status-absent"
                  role="radio"
                  aria-checked={attendanceStatus === "Absent"}
                  onClick={() => handleStatusSelect("Absent")}
                  className={`group relative flex flex-col items-center gap-2.5 rounded-2xl border-2 px-4 py-4 text-center transition select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                    attendanceStatus === "Absent"
                      ? "border-rose-400 bg-rose-50 shadow-md shadow-rose-100"
                      : "border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50/40"
                  }`}
                >
                  {attendanceStatus === "Absent" && (
                    <span className="absolute inset-0 rounded-[14px] ring-2 ring-rose-400/50 animate-pulse pointer-events-none" />
                  )}
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition ${
                    attendanceStatus === "Absent"
                      ? "bg-rose-500 shadow-lg shadow-rose-200"
                      : "bg-slate-100 group-hover:bg-rose-100"
                  }`}>
                    <UserX className={`h-5 w-5 ${
                      attendanceStatus === "Absent" ? "text-white" : "text-slate-400 group-hover:text-rose-500"
                    }`} />
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${
                      attendanceStatus === "Absent" ? "text-rose-700" : "text-slate-700"
                    }`}>
                      Absent
                    </p>
                    <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                      I was absent today
                    </p>
                  </div>
                  <span className={`absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full transition ${
                    attendanceStatus === "Absent"
                      ? "bg-rose-500"
                      : "border-2 border-slate-200"
                  }`}>
                    {attendanceStatus === "Absent" && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                    )}
                  </span>
                </button>
              </div>
            </div>

            {/* ── check-in image upload panel ──────────────────────── */}
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0f3f5c] text-[10px] font-bold text-white">1</span>
                Check-In Image <span className="text-rose-500">*</span>
              </h3>

              {!checkInImagePreview ? (
                <div
                  className="group relative flex flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-8 transition hover:border-[#1a6b9e] hover:bg-blue-50/30 cursor-pointer"
                  onClick={() => checkInFileInputRef.current?.click()}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm group-hover:border-[#1a6b9e]/30 transition">
                    <ImagePlus className="h-5 w-5 text-slate-400 group-hover:text-[#1a6b9e] transition" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-700 group-hover:text-[#1a6b9e] transition">
                      Capture check-in photo
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      Take photo or browse files
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy"
                    src={checkInImagePreview}
                    alt="Check-in preview"
                    className="h-48 w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between">
                    <span className="truncate rounded-lg bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                      {checkInImageFile?.name}
                    </span>
                    <button
                      type="button"
                      onClick={clearCheckInImage}
                      className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {!checkInImagePreview && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => checkInFileInputRef.current?.click()}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    Browse file
                  </button>
                  <button
                    type="button"
                    onClick={() => checkInCameraInputRef.current?.click()}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#1a6b9e]/30 bg-blue-50 px-2 py-2 text-xs font-bold text-[#1a6b9e] transition hover:bg-blue-100"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Take Photo
                  </button>
                </div>
              )}

              <input
                ref={checkInFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCheckInFileInput}
              />
              <input
                ref={checkInCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCheckInFileInput}
              />
            </div>

            {/* ── check-out image upload panel (conditional) ────────── */}
            {attendanceStatus === "Present" && (
              <div className="space-y-2 border-t border-slate-100 pt-4 animate-fade-in">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0f3f5c] text-[10px] font-bold text-white">2</span>
                  Check-Out Image <span className="text-rose-500">*</span>
                </h3>

                {!checkOutImagePreview ? (
                  <div
                    className="group relative flex flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-8 transition hover:border-[#1a6b9e] hover:bg-blue-50/30 cursor-pointer"
                    onClick={() => checkOutFileInputRef.current?.click()}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm group-hover:border-[#1a6b9e]/30 transition">
                      <ImagePlus className="h-5 w-5 text-slate-400 group-hover:text-[#1a6b9e] transition" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-700 group-hover:text-[#1a6b9e] transition">
                        Capture check-out photo
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        Take photo or browse files
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img loading="lazy"
                      src={checkOutImagePreview}
                      alt="Check-out preview"
                      className="h-48 w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between">
                      <span className="truncate rounded-lg bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                        {checkOutImageFile?.name}
                      </span>
                      <button
                        type="button"
                        onClick={clearCheckOutImage}
                        className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {!checkOutImagePreview && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => checkOutFileInputRef.current?.click()}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      Browse file
                  </button>
                    <button
                      type="button"
                      onClick={() => checkOutCameraInputRef.current?.click()}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#1a6b9e]/30 bg-blue-50 px-2 py-2 text-xs font-bold text-[#1a6b9e] transition hover:bg-blue-100"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Take Photo
                    </button>
                  </div>
                )}

                <input
                  ref={checkOutFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCheckOutFileInput}
                />
                <input
                  ref={checkOutCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleCheckOutFileInput}
                />
              </div>
            )}

            {/* ── upload error ─────────────────────────────── */}
            {uploadStatus === "error" && uploadError && (
              <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 animate-fade-in">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <div>
                  <p className="text-sm font-semibold text-rose-700">
                    Upload Failed
                  </p>
                  <p className="mt-0.5 text-xs text-rose-600">{uploadError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadError("")}
                  className="ml-auto"
                >
                  <X className="h-4 w-4 text-rose-400" />
                </button>
              </div>
            )}

            {/* ── validation hints ─────────────────────────── */}
            {(!attendanceStatus || !checkInImageFile || (attendanceStatus === "Present" && !checkOutImageFile) || locationStatus !== "ready") && (
              <ul className="space-y-1.5 text-xs text-slate-500 border-t border-slate-100 pt-4">
                {!attendanceStatus && (
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                    Attendance status (Present / Absent) must be selected
                  </li>
                )}
                {!checkInImageFile && (
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                    Check-in geo-tagged image is required
                  </li>
                )}
                {attendanceStatus === "Present" && !checkOutImageFile && (
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                    Check-out geo-tagged image is required for Present status
                  </li>
                )}
                {locationStatus !== "ready" && (
                  <li className="flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                    GPS location must be captured before submitting
                  </li>
                )}
              </ul>
            )}

            {/* ── submit button ─────────────────────────────── */}
            <button
              type="button"
              id="attendance-upload-submit-btn"
              onClick={handleUpload}
              disabled={!canUpload}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-bold transition shadow-md ${
                canUpload
                  ? "bg-gradient-to-r from-[#0f3f5c] to-[#1a6b9e] text-white hover:from-[#0c3350] hover:to-[#155f8c] shadow-blue-900/20 hover:shadow-blue-900/30"
                  : "cursor-not-allowed bg-slate-100 text-slate-400 shadow-none"
              }`}
            >
              {uploadStatus === "uploading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading Attendance…
                </>
              ) : (
                <>
                  <CloudUpload className="h-4 w-4" />
                  Submit Attendance
                </>
              )}
            </button>

            {scheduleLoading && (
              <p className="text-center text-xs text-slate-400">
                Resolving today&apos;s schedule…
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default memo(AttendanceUploadSection);
