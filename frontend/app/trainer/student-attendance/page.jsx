"use client";

import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '@/app/layouts/MainLayout';
import FileUploadCard from './components/FileUploadCard';
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
        setLocationStatus("error");
        setLocationError(messages[err.code] || "Failed to acquire location coordinates.");
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
      await api.post('/student-activities/attendance/submit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
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
    formData.append(
      'location',
      JSON.stringify({
        latitude: location.lat,
        longitude: location.lng,
        accuracy: location.accuracy,
      })
    );

    try {
      await api.post('/student-activities/attendance/submit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Live attendance evidence uploaded successfully');
      setLiveFile(null);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Live attendance upload failed';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  return (
    <MainLayout>
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="mb-8 md:flex md:items-center md:justify-between border-b border-slate-100 pb-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-slate-900 sm:truncate sm:text-3xl tracking-tight">
              Student Attendance Records
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Submit daily student attendance logs using Excel sheets or take a live geo-tagged picture/PDF of the class.
            </p>
          </div>
        </div>

        {/* GPS Location Banner */}
        <div className={`mb-8 flex flex-col justify-between gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center ${
          locationStatus === "ready" 
            ? "bg-emerald-50/50 border-emerald-100" 
            : locationStatus === "error" 
              ? "bg-rose-50/50 border-rose-100" 
              : "bg-slate-50 border-slate-100"
        }`}>
          <div className="flex items-start gap-3">
            <MapPin className={`h-5 w-5 shrink-0 ${
              locationStatus === "ready" 
                ? "text-emerald-600" 
                : locationStatus === "error" 
                  ? "text-rose-500" 
                  : "text-slate-400 animate-pulse"
            }`} />
            <div>
              <p className="text-sm font-semibold text-slate-800">
                GPS Location Geotagging
              </p>
              {locationStatus === "ready" && location ? (
                <p className="text-xs text-emerald-800 font-mono mt-0.5">
                  Latitude: {location.lat.toFixed(6)} | Longitude: {location.lng.toFixed(6)} (Acc: ±{Math.round(location.accuracy)}m)
                </p>
              ) : locationStatus === "error" ? (
                <p className="text-xs text-rose-700 mt-0.5">
                  {locationError}
                </p>
              ) : (
                <p className="text-xs text-slate-500 mt-0.5">
                  Acquiring satellites coordinates for verification...
                </p>
              )}
            </div>
          </div>
          
          <button
            type="button"
            onClick={captureLocation}
            disabled={locationStatus === "locating"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 shrink-0 self-start sm:self-auto"
          >
            {locationStatus === "locating" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
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
    </MainLayout>
  );
}
