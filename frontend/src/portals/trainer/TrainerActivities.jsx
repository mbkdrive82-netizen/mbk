"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/services/api';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import {
  MapPin,
  RefreshCw,
  Loader2,
  Building,
  Camera,
  CheckCircle2,
  FileSpreadsheet,
  Users,
  Image as ImageIcon,
  LogOut,
  Clock,
  ChevronRight,
  UserCheck,
  AlertTriangle,
  FileCheck,
  X
} from 'lucide-react';
import { Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
const getApiErrorMessage = (err, fallback = 'Something went wrong.') => {
  return err?.response?.message || err?.data?.message || err?.message || fallback;
};

const formatTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const compressImage = async (imageFile) => {
  const options = {
    maxSizeMB: 1, // Target size under 1MB
    maxWidthOrHeight: 1280, // Web-optimized dimensions
    useWebWorker: true,
  };
  try {
    const imageCompression = (await import('browser-image-compression')).default;
    const compressedBlob = await imageCompression(imageFile, options);
    return new File([compressedBlob], imageFile.name, {
      type: imageFile.type,
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn("Client-side compression failed, using original file:", error);
    return imageFile;
  }
};

const StudentCard = React.memo(({ student, index, onToggle }) => {
  const isPresent = student.status === 'Present';
  return (
    <div
      onClick={() => onToggle(index)}
      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition select-none ${
        isPresent
          ? "bg-emerald-50/55 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
          : "bg-card border-border text-slate-600 dark:text-slate-400 shadow-sm"
      }`}
    >
      <div>
        <p className="text-xs font-mono font-bold text-slate-400 dark:text-slate-500">{student.rollNo}</p>
        <p className="text-base font-bold text-slate-800 dark:text-slate-200">{student.name}</p>
      </div>
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
        isPresent
          ? "bg-emerald-100 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
          : "bg-muted dark:bg-slate-900 border-border text-slate-500 dark:text-slate-400"
      }`}>
        {student.status}
      </span>
    </div>
  );
});

export default function TrainerActivities() {
  const { currentUser } = useAuth();

  // Step tracker: 1=Assignment & Geofence, 2=Clock-In, 3=Attendance, 4=Activities, 5=Clock-Out, 6=Summary
  const [step, setStep] = useState(2);
  const [loading, setLoading] = useState(false);

  // 1. Assignment Info
  const [assignment, setAssignment] = useState(null);
  const [assignmentError, setAssignmentError] = useState(null);
  const [distance, setDistance] = useState(null);
  const [isInside, setIsInside] = useState(false);
  const [uploadedFile, setUploadedFile] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);

  const handleUploadChange = ({ fileList: newFileList }) => {
    setUploadedFile(newFileList);
    if (newFileList.length > 0) {
      const url = URL.createObjectURL(newFileList[0].originFileObj);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const [coords, setCoords] = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle"); // idle|locating|ready|error
  const [locationError, setLocationError] = useState("");

  // Daily session ID returned from Clock-In
  const [attendanceId, setAttendanceId] = useState(null);

  const [cameraStream, setCameraStream] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const [capturedImageUrl, setCapturedImageUrl] = useState(null);
  const [capturedImageBlob, setCapturedImageBlob] = useState(null);
  // 4. Attendance State
  const [attendanceMode, setAttendanceMode] = useState("excel"); // excel|live
  const [excelFile, setExcelFile] = useState(null);
  const [attendanceSuccess, setAttendanceSuccess] = useState(false);

  // Live attendance student list
  const [students, setStudents] = useState([
    { rollNo: "S101", name: "Anish Kumar", status: "Absent" },
    { rollNo: "S102", name: "Divya Bharathi", status: "Absent" },
    { rollNo: "S103", name: "Karthik R", status: "Absent" },
    { rollNo: "S104", name: "Nandhini S", status: "Absent" },
    { rollNo: "S105", name: "Praveen Kumar", status: "Absent" },
    { rollNo: "S106", name: "Sandhya V", status: "Absent" }
  ]);
  const [representativeName, setRepresentativeName] = useState("");
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // 5. Activity Logging state
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDesc, setActivityDesc] = useState("");
  const [activityImages, setActivityImages] = useState([]);
  const [activityPreviews, setActivityPreviews] = useState([]);

  // 6. Summary Stats
  const [summaryData, setSummaryData] = useState(null);

  // --- Location Handling ---
  const captureLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationError("Geolocation is not supported by this device.");
      return;
    }

    setLocationStatus("locating");
    setLocationError("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const currentCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setCoords(currentCoords);
        setLocationStatus("ready");
        toast.success("GPS Location verified");
      },
      (err) => {
        const msgs = {
          1: "Location permissions denied. Please enable GPS permissions.",
          2: "GPS signal lost. Please check device location settings.",
          3: "Location check timed out. Retrying...",
        };
        setLocationStatus("error");
        setLocationError(msgs[err.code] || "Could not fetch GPS coordinates.");
        // Set fallback coordinates (0, 0) so the process doesn't block
        setCoords({ lat: 0, lng: 0, accuracy: 0 });
        console.warn("Location acquisition failed, using fallback coordinates (0, 0)");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  // Fetch assignment & coordinates on mount
  useEffect(() => {
    fetchCurrentAssignment();
    captureLocation();
  }, [captureLocation]);

  // Validation loop whenever coordinates change
  useEffect(() => {
    if (coords && assignment) {
      validateLocationAgainstGeofence();
    }
  }, [coords, assignment]);

  const fetchCurrentAssignment = async () => {
    setLoading(true);
    setAssignmentError(null);
    try {
      const res = await api.get('/teacher/current-assignment');
      if (res.success && res.assignment) {
        setAssignment(res.assignment);
      } else {
        throw new Error(res.message || 'No active assignment found');
      }
    } catch (err) {
      const message = err.response?.message || err.data?.message || err.message || 'Unable to load trainer assignment.';
      console.error('Failed to load current trainer assignment:', message);
      setAssignment(null);
      setAssignmentError(message);
      toast.error('Unable to load your current assignment. Please contact admin.');
    } finally {
      setLoading(false);
    }
  };

  const validateLocationAgainstGeofence = async () => {
    if (!coords) return;
    try {
      const res = await api.post('/location/validate', {
        latitude: coords.lat,
        longitude: coords.lng
      });
      if (res.success) {
        setIsInside(res.isInside);
        setDistance(res.distanceMeters);
      }
    } catch (err) {
      setIsInside(false);
      if (err.response?.distanceMeters != null) {
        setDistance(err.response.distanceMeters);
      }
    }
  };

  // --- Camera Operations ---
  const startCamera = async () => {
    setCapturedImageUrl(null);
    setCapturedImageBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        // Explicitly start playback — required on some browsers to avoid black screen
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("Video autoplay prevented:", playErr);
        }
      }
      setCameraStream(stream);
      setCameraActive(true);
    } catch (err) {
      console.error(err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error("Camera permission denied. Please allow camera access in your browser settings and reload.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        toast.error("No camera found on this device.");
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        toast.error("Camera is already in use by another app. Please close it and try again.");
      } else {
        toast.error("Could not access device camera. Please check permissions.");
      }
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const W = videoRef.current.videoWidth || 640;
    const H = videoRef.current.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Mirror horizontally to undo the CSS -scale-x-100 flip so the saved image is correct
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(videoRef.current, -W, 0, W, H);
    ctx.restore();

    // --- Geo-tag overlay strip ---
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    const latStr = coords ? coords.lat.toFixed(6) : 'N/A';
    const lngStr = coords ? coords.lng.toFixed(6) : 'N/A';
    const accStr = coords ? `±${Math.round(coords.accuracy)}m` : '';
    const locName = assignment?.collegeName || 'Current Location';

    // Strip height proportional to image
    const stripH = Math.round(H * 0.18);
    const stripY = H - stripH;
    const pad = Math.round(W * 0.025);
    const baseFontSize = Math.max(11, Math.round(W * 0.022));

    // Semi-transparent dark background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
    ctx.fillRect(0, stripY, W, stripH);

    // Subtle teal left accent bar
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, stripY, 4, stripH);

    // Map pin icon (drawn with canvas arcs)
    const iconX = pad + 10;
    const iconY = stripY + stripH * 0.35;
    const iconR = baseFontSize * 0.65;
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR, 0, 2 * Math.PI);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR * 0.45, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
    // Pin tail
    ctx.beginPath();
    ctx.moveTo(iconX - iconR * 0.5, iconY + iconR * 0.7);
    ctx.lineTo(iconX + iconR * 0.5, iconY + iconR * 0.7);
    ctx.lineTo(iconX, iconY + iconR * 1.8);
    ctx.closePath();
    ctx.fillStyle = '#10b981';
    ctx.fill();

    const textX = iconX + iconR * 2.5;

    // College / location name — prominent
    ctx.font = `bold ${baseFontSize * 1.1}px Inter, Arial, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(locName, textX, stripY + stripH * 0.3);

    // GPS coordinates line
    ctx.font = `${baseFontSize * 0.88}px Inter, monospace`;
    ctx.fillStyle = '#10b981';
    ctx.fillText(`${latStr}, ${lngStr}  ${accStr}`, textX, stripY + stripH * 0.54);

    // Date + time line
    ctx.font = `${baseFontSize * 0.82}px Inter, Arial, sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${dateStr}  ${timeStr}`, textX, stripY + stripH * 0.76);

    // "GEO VERIFIED" badge on right
    const badgeText = coords ? 'GPS VERIFIED' : 'NO GPS';
    const badgeColor = coords ? '#10b981' : '#ef4444';
    const bW = baseFontSize * 5.8;
    const bH = baseFontSize * 1.4;
    const bX = W - bW - pad;
    const bY = stripY + (stripH - bH) / 2;
    ctx.fillStyle = badgeColor;
    ctx.beginPath();
    ctx.roundRect(bX, bY, bW, bH, 4);
    ctx.fill();
    ctx.font = `bold ${baseFontSize * 0.78}px Inter, Arial, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, bX + bW / 2, bY + bH * 0.68);
    ctx.textAlign = 'left';

    canvas.toBlob((blob) => {
      setCapturedImageBlob(blob);
      setCapturedImageUrl(URL.createObjectURL(blob));
      stopCamera();
    }, 'image/jpeg', 0.95);
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
  };

  const maxSize = 5 * 1024 * 1024; // 5MB
  const isImage = (file) => file.type.startsWith('image/');
  const beforeUploadImg = (file) => {
    if (!isImage(file)) {
      message.error('Only image files are allowed!');
      return Upload.LIST_IGNORE;
    }
    if (file.size > maxSize) {
      message.error('Image must be ≤5MB!');
      return Upload.LIST_IGNORE;
    }

    // Run compression asynchronously
    const compressPromise = new Promise(async (resolve) => {
      try {
        message.loading({ content: 'Optimizing image...', key: 'compress', duration: 0 });
        const compressedFile = await compressImage(file);
        message.success({ content: 'Image optimized successfully!', key: 'compress', duration: 2 });
        
        // Update the file list manually with the compressed file
        const fileObj = {
          uid: file.uid,
          name: file.name,
          status: 'done',
          originFileObj: compressedFile,
          size: compressedFile.size
        };
        setUploadedFile([fileObj]);
        const url = URL.createObjectURL(compressedFile);
        setPreviewUrl(url);
        resolve(false);
      } catch (err) {
        message.destroy('compress');
        resolve(false);
      }
    });

    return compressPromise;
  };

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  // --- Clock-In Submission ---
  const handleClockIn = async () => {
    if (uploadedFile.length === 0) {
      message.error('Please upload a clock-in image.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    const lat = coords?.lat || assignment?.latitude || 0;
    const lng = coords?.lng || assignment?.longitude || 0;
    formData.append('latitude', lat);
    formData.append('longitude', lng);
    formData.append('timestamp', new Date().toISOString());
    // Image source: only uploaded file
    formData.append('check_in_image', uploadedFile[0].originFileObj, uploadedFile[0].name);
    // optional address
    formData.append('address', assignment?.collegeName ? `${assignment.collegeName} Campus` : '');

    try {
      const res = await api.post('/attendance/clock-in', formData);
      if (res.success) {
        setAttendanceId(res.attendanceId);
        toast.success('Clock-In recorded!');
        // reset UI
        setUploadedFile([]);
        setStep(3);
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Clock-in failed.');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // --- Student Attendance Submissions ---
  const handleExcelSubmit = async (e) => {
    e.preventDefault();
    if (!excelFile) {
      toast.error("Please drag or select an excel sheet template");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('attendanceExcel', excelFile);
    formData.append('attendanceId', attendanceId);
    const lat = coords?.lat || assignment?.latitude || 0;
    const lng = coords?.lng || assignment?.longitude || 0;
    formData.append('latitude', lat);
    formData.append('longitude', lng);

    try {
      const res = await api.post('/student-attendance/upload', formData);
      if (res.success) {
        toast.success(res.message || "Attendance saved!");
        setAttendanceSuccess(true);
        setStep(4); // proceed to Activities
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, "Failed to process Excel file.");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // --- Canvas Signaturepad ---
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawingSig = (e) => {
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#059669'; // Emerald
      setIsDrawing(true);
    }
  };

  const drawSig = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawingSig = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const toggleStudent = useCallback((index) => {
    setStudents(prev => prev.map((s, idx) => {
      if (idx === index) {
        return { ...s, status: s.status === 'Present' ? 'Absent' : 'Present' };
      }
      return s;
    }));
  }, []);

  const handleLiveSubmit = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if drawing pad is clear
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    if (canvas.toDataURL() === blank.toDataURL()) {
      toast.error("Student/Representative digital signature is required");
      return;
    }

    setLoading(true);
    const signatureBase64 = canvas.toDataURL('image/png');

    try {
      const res = await api.post('/student-attendance/live', {
        attendanceId,
        students,
        signatureBase64
      });
      if (res.success) {
        toast.success("Live attendance logged successfully!");
        setAttendanceSuccess(true);
        setStep(4); // proceed to Activities
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, "Failed to submit live attendance.");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // --- Activity Log Submissions ---
  const handleActivityFileChange = async (e) => {
    const files = Array.from(e.target.files);
    
    // Validate total count
    if (activityImages.length + files.length > 5) {
      toast.error("You can upload a maximum of 5 activity images");
      return;
    }

    // Validate size and compress images
    const compressedFiles = [];
    const thumbnailUrls = [];

    const compToastId = toast.loading("Optimizing activity photos...");

    try {
      for (const file of files) {
        // Size validation
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`File ${file.name} exceeds 5MB size limit!`, { id: compToastId });
          continue;
        }

        // Compress
        const compressed = await compressImage(file);
        compressedFiles.push(compressed);

        // Generate canvas thumbnail
        const thumbUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              const maxThumbSize = 150;
              let width = img.width;
              let height = img.height;
              if (width > height) {
                if (width > maxThumbSize) {
                  height = Math.round((height * maxThumbSize) / width);
                  width = maxThumbSize;
                }
              } else {
                if (height > maxThumbSize) {
                  width = Math.round((width * maxThumbSize) / height);
                  height = maxThumbSize;
                }
              }
              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(img, 0, 0, width, height);
              canvas.toBlob((blob) => {
                if (blob) {
                  resolve(URL.createObjectURL(blob));
                } else {
                  resolve(event.target.result);
                }
              }, "image/jpeg", 0.7);
            };
            img.src = event.target.result;
          };
          reader.readAsDataURL(file);
        });
        
        thumbnailUrls.push(thumbUrl);
      }
      
      setActivityImages(prev => [...prev, ...compressedFiles]);
      setActivityPreviews(prev => [...prev, ...thumbnailUrls]);
      toast.success("Photos optimized successfully!", { id: compToastId });
    } catch (err) {
      console.error(err);
      toast.error("Error optimizing photos", { id: compToastId });
    }
  };

  const removeActivityImage = (idx) => {
    setActivityImages(prev => prev.filter((_, i) => i !== idx));
    setActivityPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleActivitySubmit = async (e) => {
    e.preventDefault();
    if (!activityTitle || !activityDesc) {
      toast.error("Please fill in activity title and description");
      return;
    }
    if (activityImages.length === 0) {
      toast.error("Please upload at least 1 activity image as verification");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('attendanceId', attendanceId);
    formData.append('title', activityTitle);
    formData.append('description', activityDesc);
    const lat = coords?.lat || assignment?.latitude || 0;
    const lng = coords?.lng || assignment?.longitude || 0;
    formData.append('latitude', lat);
    formData.append('longitude', lng);

    activityImages.forEach(img => {
      formData.append('activityPhotos', img);
    });

    try {
      const res = await api.post('/student-activities', formData);
      if (res.success) {
        toast.success("Activity logged successfully!");
        setStep(5); // Unlock clock-out
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, "Failed to submit activities.");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // --- Clock-Out Submission ---
  const handleClockOut = async () => {
    if (uploadedFile.length === 0) {
      toast.error("Please upload your clock-out image first");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('check_out_image', uploadedFile[0].originFileObj, uploadedFile[0].name);
    formData.append('attendanceId', attendanceId);
    const lat = coords?.lat || assignment?.latitude || 0;
    const lng = coords?.lng || assignment?.longitude || 0;
    formData.append('latitude', lat);
    formData.append('longitude', lng);
    formData.append('timestamp', new Date().toISOString());
    formData.append('address', assignment?.collegeName ? `${assignment.collegeName} Campus` : '');

    try {
      const res = await api.post('/attendance/clock-out', formData);
      if (res.success) {
        toast.success("Clock-Out recorded successfully!");
        setSummaryData({
          clockOutTime: res.clockOutTime,
          duration: res.durationMinutes,
        });
        setCapturedImageUrl(null);
        setCapturedImageBlob(null);
        setStep(6); // Render Daily Summary page
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, "Clock-out failed.");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!assignment && !loading) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 text-slate-800 dark:text-slate-100">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900/50 p-8 text-center shadow-sm">
          <h1 className="text-3xl font-extrabold tracking-tight text-rose-950 dark:text-rose-200">Assignment Required</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-400">
            {assignmentError || 'Unable to load your current assignment. Please contact your administrator.'}
          </p>
          <button
            type="button"
            onClick={fetchCurrentAssignment}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            Retry Assignment
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 text-slate-800 dark:text-slate-100">

      {/* Header Title */}
      <div className="mb-8 border-b border-border pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Trainer Activities Workflow
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Manage check-in, attendance, activity logging, and check-out for your assigned college visit.
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0f3f5c]/10 border border-[#1a547a]/20 text-[#0f3f5c] dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
          <Building className="h-6 w-6" />
        </div>
      </div>

      {/* Global Progress Stepper */}
      <div className="mb-10 rounded-2xl bg-card border border-border p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider mb-3 text-slate-900 dark:text-white">Daily Step Progress</p>
        <div className="flex items-center justify-between gap-2">
          {[
            { num: 2, label: "Clock-In" },
            { num: 3, label: "Attendance" },
            { num: 4, label: "Activities" },
            { num: 5, label: "Clock-Out" },
            { num: 6, label: "Summary" }
          ].map((s, idx) => (
            <React.Fragment key={s.num}>
              <div className="flex flex-col items-center flex-1">
                <div className={`h-8 w-8 rounded-full border flex items-center justify-center text-xs font-bold transition-all duration-300 ${step === s.num
                    ? "bg-gradient-to-br from-emerald-500 to-cyan-500 border-emerald-400 text-white scale-110 shadow-lg shadow-emerald-500/20"
                    : step > s.num
                      ? "bg-emerald-100 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted border-border text-slate-500 dark:text-slate-400"
                  }`}>
                  {step > s.num ? <CheckCircle2 className="h-4 w-4" /> : (idx + 1)}
                </div>
                <span className={`text-xs mt-1 text-center font-semibold hidden sm:inline ${step === s.num ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {s.label}
                </span>
              </div>
              {s.num < 6 && (
                <div className={`h-[2px] flex-1 bg-border ${step > s.num ? "bg-emerald-400" : ""}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>


        {/* --- STEP 2: CLOCK-IN SCREEN --- */}
        {step === 2 && (
          <div className="rounded-2xl bg-card border border-border p-6 space-y-6 shadow-sm">
            <div className="border-b border-border pb-4">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Perform Clock-In</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Capture a geotagged selfie inside college perimeter. Gallery uploads are blocked.</p>
            </div>

            <div className="flex flex-col items-center space-y-4">
              {/* Upload Image */}
              <Upload
                fileList={uploadedFile}
                onChange={handleUploadChange}
                beforeUpload={beforeUploadImg}
                maxCount={1}
                listType="picture"
                showUploadList={{ showPreviewIcon: true, showRemoveIcon: true }}
                className="w-full"
              >
                <Button icon={<UploadOutlined />} size="large" block>
                  Upload Image
                </Button>
              </Upload>
              {previewUrl && uploadedFile.length > 0 && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <img loading="lazy" src={previewUrl} alt="Preview" className="max-w-xs max-h-48 object-cover rounded-xl border border-border" />
                  {uploadedFile[0]?.size && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">{(uploadedFile[0].size / 1024 / 1024).toFixed(2)} MB</p>
                  )}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3 mt-4 text-xs text-slate-600 dark:text-slate-300 w-full">
                <div className="rounded-2xl border border-border bg-muted/30 dark:bg-slate-900 p-3 text-center shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">GPS status</p>
                  <p className={`mt-2 font-bold text-sm ${locationStatus === 'ready' ? 'text-emerald-600 dark:text-emerald-400' : locationStatus === 'locating' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-450'}`}>
                    {locationStatus === 'ready'
                      ? 'Ready inside college perimeter'
                      : locationStatus === 'locating'
                        ? 'Acquiring GPS…'
                        : 'Location unavailable'}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 dark:bg-slate-900 p-3 text-center shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Geo coordinates</p>
                  <p className="mt-2 font-bold text-sm text-slate-800 dark:text-slate-200">
                    {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'Waiting for GPS'}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 dark:bg-slate-900 p-3 text-center shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Distance</p>
                  <p className="mt-2 font-bold text-sm text-slate-800 dark:text-slate-200">
                    {distance != null ? `${distance.toFixed(0)}m ${isInside ? 'inside' : 'outside'}` : 'Checking…'}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={handleClockIn}
                  disabled={loading}
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold text-sm px-6 py-3.5 rounded-xl hover:opacity-95 disabled:opacity-60 transition"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm Clock-In
                </button>
              </div>

            </div>
          </div>
        )}

        {/* --- STEP 3: STUDENT ATTENDANCE OPTIONS --- */}
        {step === 3 && (
          <div className="rounded-2xl bg-card border border-border p-6 space-y-6 shadow-sm">
            <div className="border-b border-border pb-4 flex justify-between items-start gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Log Student Attendance</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Choose to upload an Excel sheet or mark live attendance with signatures</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                Clocked-In Today
              </span>
            </div>

            {/* Tabs Selector */}
            <div className="flex rounded-xl bg-muted dark:bg-slate-900 p-1 border border-border">
              <button
                type="button"
                onClick={() => setAttendanceMode("excel")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition ${attendanceMode === "excel"
                    ? "bg-card border border-border text-slate-850 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-350"
                  }`}
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                Excel Upload
              </button>
              <button
                type="button"
                onClick={() => setAttendanceMode("live")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition ${attendanceMode === "live"
                    ? "bg-card border border-border text-slate-850 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-350"
                  }`}
              >
                <Users className="h-4 w-4 text-cyan-500" />
                Live Attendance
              </button>
            </div>

            {/* Option A: Excel Upload Form */}
            {attendanceMode === "excel" && (
              <form onSubmit={handleExcelSubmit} className="space-y-6">
                <div className="border-2 border-dashed border-border hover:border-slate-400 transition rounded-2xl p-8 text-center bg-card cursor-pointer relative shadow-sm">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setExcelFile(e.target.files[0])}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <FileSpreadsheet className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-750 dark:text-slate-200">
                    {excelFile ? excelFile.name : "Drag and drop or browse Excel sheet"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Accepts master Excel files (.xlsx, .xls) up to 10MB</p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                  <button
                    type="submit"
                    disabled={loading || !excelFile}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold text-sm px-6 py-3.5 rounded-xl hover:opacity-95 disabled:opacity-60 transition"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Submit Excel Attendance
                  </button>
                </div>
              </form>
            )}

            {/* Option B: Live Grid & Signatures */}
            {attendanceMode === "live" && (
              <div className="space-y-6">
                {/* Student list grid */}
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Class Student Roll</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {students.map((student, idx) => (
                      <StudentCard
                        key={student.rollNo}
                        student={student}
                        index={idx}
                        onToggle={toggleStudent}
                      />
                    ))}
                  </div>
                </div>

                {/* Signature canvas */}
                <div className="space-y-3 pt-4 border-t border-border">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Representative Digital Signature</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">Class representative or SPOC must sign on touch canvas to confirm live session details</p>
                  </div>

                  <div className="flex flex-col items-center gap-3">
                    <canvas
                      ref={canvasRef}
                      width={500}
                      height={180}
                      onMouseDown={startDrawingSig}
                      onMouseMove={drawSig}
                      onMouseUp={stopDrawingSig}
                      onMouseLeave={stopDrawingSig}
                      onTouchStart={startDrawingSig}
                      onTouchMove={drawSig}
                      onTouchEnd={stopDrawingSig}
                      className="bg-white border border-border rounded-xl cursor-crosshair max-w-full touch-none shadow-sm"
                    />
                    <button
                      onClick={clearSignature}
                      className="text-sm font-semibold text-slate-500 dark:text-slate-450 hover:text-slate-800 dark:hover:text-slate-200 transition"
                    >
                      Clear Drawing Signature
                    </button>
                  </div>
                </div>

                <div className="flex justify-center gap-3 pt-4 border-t border-border">
                  <button
                    onClick={handleLiveSubmit}
                    disabled={loading}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold text-sm px-6 py-3.5 rounded-xl hover:opacity-95 disabled:opacity-60 transition"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Submit Live Attendance
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- STEP 4: STUDENT ACTIVITIES LOGGING --- */}
        {step === 4 && (
          <form onSubmit={handleActivitySubmit} className="rounded-2xl bg-card border border-border p-6 space-y-6 shadow-sm">
            <div className="border-b border-border pb-4">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Submit Student Activities</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Record syllabus progress, workshop events, and upload verification photos.</p>
            </div>

            <div className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Activity Title</label>
                <input
                  type="text"
                  placeholder="e.g. Python OOP Workshop Day 3"
                  value={activityTitle}
                  onChange={(e) => setActivityTitle(e.target.value)}
                  className="rounded-xl border border-border bg-muted/10 dark:bg-slate-950/20 px-4 py-3 text-base text-slate-800 dark:text-white focus:border-emerald-500 dark:focus:border-emerald-600 focus:outline-none shadow-sm"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Description / Syllabus details</label>
                <textarea
                  placeholder="Summarize teaching topics, student exercises, outcomes..."
                  rows={4}
                  value={activityDesc}
                  onChange={(e) => setActivityDesc(e.target.value)}
                  className="rounded-xl border border-border bg-muted/10 dark:bg-slate-950/20 px-4 py-3 text-base text-slate-800 dark:text-white focus:border-emerald-500 dark:focus:border-emerald-600 focus:outline-none shadow-sm"
                />
              </div>

              <div className="space-y-3 pt-3">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Activity Verification Photos</label>

                {/* Previews grid */}
                {activityPreviews.length > 0 && (
                  <div className="grid gap-3 grid-cols-5">
                    {activityPreviews.map((p, idx) => (
                      <div key={p} className="relative aspect-square rounded-xl bg-card border border-border overflow-hidden shadow-sm">
                        <img loading="lazy" src={p} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeActivityImage(idx)}
                          className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 hover:bg-rose-600 text-white shadow-md transition active:scale-90"
                          aria-label="Remove photo"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-2 border-dashed border-border hover:border-slate-400 transition rounded-xl p-6 text-center bg-card cursor-pointer relative shadow-sm">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleActivityFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <ImageIcon className="h-8 w-8 text-cyan-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-600 dark:text-slate-300 font-semibold">Click to upload photos from today's exercises</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Maximum 5 images, up to 10MB each</p>
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-3 pt-4 border-t border-border">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold text-sm px-6 py-3.5 rounded-xl hover:opacity-95 disabled:opacity-60 transition"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Log Activities
              </button>
            </div>
          </form>
        )}
        {/* --- STEP 5: CLOCK-OUT SCREEN --- */}
        {step === 5 && (
          <div className="rounded-2xl bg-card border border-border p-6 space-y-6 shadow-sm">
            <div className="border-b border-border pb-4">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Record Clock-Out</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Confirm you are leaving the college perimeter. Capture check-out geotagged photo.</p>
            </div>

            <div className="flex flex-col items-center justify-center space-y-4">
              {/* Upload Image Only */}
              <div className="flex flex-col items-center space-y-4">
                <Upload
                  fileList={uploadedFile}
                  onChange={handleUploadChange}
                  beforeUpload={beforeUploadImg}
                  maxCount={1}
                  listType="picture"
                  showUploadList={{ showPreviewIcon: true, showRemoveIcon: true }}
                  className="w-full"
                >
                  <Button icon={<UploadOutlined />} size="large" block>
                    Upload Image
                  </Button>
                </Upload>
                {previewUrl && uploadedFile.length > 0 && (
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <img loading="lazy" src={previewUrl} alt="Preview" className="max-w-xs max-h-48 object-cover rounded-xl border border-border" />
                    {uploadedFile[0]?.size && (
                      <p className="text-sm text-slate-550 dark:text-slate-400">{(uploadedFile[0].size / 1024 / 1024).toFixed(2)} MB</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Confirm Clock-Out */}
            {uploadedFile.length > 0 && (
              <div className="pt-4 border-t border-border flex justify-center">
                <button
                  onClick={handleClockOut}
                  disabled={loading}
                  className="inline-flex items-center gap-2 bg-[#dc2626] text-white font-bold text-sm px-6 py-3.5 rounded-xl hover:bg-red-500 disabled:opacity-60 transition"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm Clock-Out
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- STEP 6: SESSION SUMMARY STATS --- */}
        {step === 6 && (
          <div className="rounded-2xl bg-card border border-emerald-200 dark:border-emerald-900 p-8 text-center space-y-6 shadow-sm">
            <div className="h-16 w-16 bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-full flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
              <FileCheck className="h-8 w-8" />
            </div>

            <div>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white">Daily Visit Completed</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Check-in, attendance submission, activities, and check-out has been registered</p>
            </div>

            <div className="max-w-md mx-auto grid grid-cols-2 gap-4 pt-4">
              <div className="p-4 rounded-xl bg-muted/10 dark:bg-slate-950/20 border border-border text-center shadow-sm">
                <Clock className="h-5 w-5 text-cyan-600 dark:text-cyan-400 mx-auto mb-1" />
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Working Duration</p>
                <p className="text-xl font-extrabold text-slate-800 dark:text-slate-200 mt-1">{summaryData?.duration || 0} mins</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/10 dark:bg-slate-950/20 border border-border text-center shadow-sm">
                <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mx-auto mb-1" />
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Clock-Out Recorded</p>
                <p className="text-base font-bold text-slate-800 dark:text-slate-200 mt-1.5">
                  {summaryData?.clockOutTime ? formatTime(summaryData.clockOutTime) : 'Done'}
                </p>
              </div>
            </div>

            <div className="pt-6">
              <button
                onClick={() => {
                  setStep(1);
                  setSummaryData(null);
                  setUploadedFile([]);
                  setPreviewUrl(null);
                  setCapturedImageUrl(null);
                  setCapturedImageBlob(null);
                  setExcelFile(null);
                  setAttendanceSuccess(false);
                  setActivityTitle("");
                  setActivityDesc("");
                  setActivityImages([]);
                  setActivityPreviews([]);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition hover:bg-muted shadow-sm"
              >
                Start New Visit Checklist
              </button>
            </div>
          </div>
        )}

      </section>
  );
}
