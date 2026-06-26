"use client";

import React, { useState, useEffect, useCallback } from 'react';
import FileUploadCard from '@/app/trainer/student-attendance/components/FileUploadCard';
import { api } from '@/services/api';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { MapPin, RefreshCw, Loader2 } from 'lucide-react';

export default function StudentAttendancePage() {
  const { currentUser } = useAuth();
  
  const [excelFile, setExcelFile] = useState(null);
  const [liveFile, setLiveFile] = useState(null);

  // Location State
  const [location, setLocation] = useState(null); // {lat, lng, accuracy}
  const [locationStatus, setLocationStatus] = useState("idle"); // idle|locating|ready|error
  const [locationError, setLocationError] = useState("");

  const trainerId =
    currentUser?.trainerId ||
    currentUser?.trainer_id ||
    currentUser?.id ||
    currentUser?._id;

  // Fetch coordinates
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
        });
        setLocationStatus("ready");
      },
      (err) => {
        const messages = {
          1: "Location access denied. Please allow location access to submit geo-tagged uploads.",
          2: "GPS position unavailable. Make sure GPS/Wi-Fi is enabled.",
          3: "Location request timed out. Please try again.",
        };
        // Fallback to (0,0) so the process doesn't block the trainer
        setLocation({ lat: 0, lng: 0, accuracy: 0 });
        setLocationStatus("ready");
        setLocationError(messages[err.code] || "Failed to acquire location coordinates.");
        console.warn("Location acquisition failed, using fallback coordinates (0, 0)");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, []);

  // Fetch location on mount
  useEffect(() => {
    captureLocation();
  }, [captureLocation]);

  const handleExcelUpload = async (file) => {
    if (!trainerId) {
      const errorMsg = 'Trainer session not found. Please log in again.';
      toast.error(errorMsg);
      throw new Error(errorMsg);
    }

    const formData = new FormData();
    formData.append('attendanceExcel', file);
    formData.append('trainer_id', String(trainerId));
    formData.append('attendance_date', new Date().toISOString().split('T')[0]);
    formData.append('status', 'Present');
    formData.append('checkInTime', new Date().toTimeString().slice(0, 5));

    if (locationStatus === "ready" && location) {
      formData.append(
        'location',
        JSON.stringify({
          latitude: location.lat,
          longitude: location.lng,
          accuracy: location.accuracy,
        })
      );
    }

    try {
      await api.post('/student-activities/attendance/submit', formData);
      toast.success('Excel sheet uploaded successfully');
      setExcelFile(null);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Excel upload failed';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const handleLiveUpload = async (file) => {
    if (!trainerId) {
      const errorMsg = 'Trainer session not found. Please log in again.';
      toast.error(errorMsg);
      throw new Error(errorMsg);
    }

    if (locationStatus !== "ready" || !location) {
      const errorMsg = 'GPS location is required for live attendance tracking. Please enable location.';
      toast.error(errorMsg);
      throw new Error(errorMsg);
    }

    const formData = new FormData();
    const fieldName = file.type.startsWith('image/') ? 'studentsPhoto' : 'attendancePdf';
    formData.append(fieldName, file);
    formData.append('trainer_id', String(trainerId));
    formData.append('attendance_date', new Date().toISOString().split('T')[0]);
    formData.append('status', 'Present');
    formData.append('checkInTime', new Date().toTimeString().slice(0, 5));
    formData.append(
      'location',
      JSON.stringify({
        latitude: location.lat,
        longitude: location.lng,
        accuracy: location.accuracy,
      })
    );

    try {
      await api.post('/student-activities/attendance/submit', formData);
      toast.success('Live attendance evidence uploaded successfully');
      setLiveFile(null);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Live attendance upload failed';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  return (
    <div className="w-full">
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 text-slate-800 dark:text-slate-100">
        {/* Header Section */}
        <div className="mb-8 md:flex md:items-center md:justify-between border-b border-border pb-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Student Attendance Records
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Submit daily student attendance logs using Excel sheets or take a live geo-tagged picture/PDF of the class.
            </p>
          </div>
        </div>

        {/* GPS Location Banner */}
        <div className={`mb-8 flex flex-col justify-between gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center ${
          locationStatus === "ready" 
            ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900" 
            : locationStatus === "error" 
              ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900" 
              : "bg-muted border-border"
        }`}>
          <div className="flex items-start gap-3">
            <MapPin className={`h-5 w-5 shrink-0 ${
              locationStatus === "ready" 
                ? "text-emerald-600 dark:text-emerald-455" 
                : locationStatus === "error" 
                  ? "text-rose-500 dark:text-rose-455" 
                  : "text-slate-400 animate-pulse"
            }`} />
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                GPS Location Geotagging
              </p>
              {locationStatus === "ready" && location ? (
                <p className="text-sm text-emerald-800 dark:text-emerald-400 font-mono mt-0.5">
                  Latitude: {location.lat.toFixed(6)} | Longitude: {location.lng.toFixed(6)} (Acc: ±{Math.round(location.accuracy)}m)
                </p>
              ) : locationStatus === "error" ? (
                <p className="text-sm text-rose-700 dark:text-rose-400 mt-0.5">
                  {locationError}
                </p>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Acquiring satellites coordinates for verification...
                </p>
              )}
            </div>
          </div>
          
          <button
            type="button"
            onClick={captureLocation}
            disabled={locationStatus === "locating"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:border-slate-350 hover:bg-muted disabled:opacity-60 shrink-0 self-start sm:self-auto"
          >
            {locationStatus === "locating" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 text-slate-550 dark:text-slate-400" />
            )}
            Refresh Coordinates
          </button>
        </div>

        {/* Upload Cards Grid */}
        <div className="grid gap-8 md:grid-cols-2">
          <FileUploadCard
            title="Student Attendance Excel Sheet"
            accept=".xlsx,.xls"
            maxSizeMb={10}
            file={excelFile}
            setFile={setExcelFile}
            onSubmit={handleExcelUpload}
            required
            description="Upload the master attendance template spreadsheet containing all student mark records."
          />
          <FileUploadCard
            title="Live Student Attendance Record"
            accept=".jpg,.jpeg,.png,.pdf"
            maxSizeMb={5}
            file={liveFile}
            setFile={setLiveFile}
            onSubmit={handleLiveUpload}
            required
            description="Upload a live class photo evidence or a signed PDF sheet. GPS tracking is required."
          />
        </div>
      </section>
    </div>
  );
}
