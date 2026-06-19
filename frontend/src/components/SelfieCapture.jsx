"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Loader2, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";

export default function SelfieCapture({
  onCapture,
  onRetake,
  value = "",
  previewCandidates = [],
  uploading = false,
  status = "idle",
  uploadError = "",
  readOnly = false,
  allowRetake = false,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const candidateKey = Array.isArray(previewCandidates)
    ? previewCandidates.filter(Boolean).join("|")
    : "";
  const resolvePreviewCandidates = useCallback(() => {
    const candidates = Array.isArray(previewCandidates)
      ? previewCandidates.filter(Boolean)
      : [];

    if (value && !candidates.includes(value)) {
      candidates.unshift(value);
    }

    return candidates;
  }, [previewCandidates, value]);
  const [img, setImg] = useState(() => resolvePreviewCandidates()[0] || value || "");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const canCaptureOrRetake = !readOnly || allowRetake;

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraError("Camera access is required to capture your live selfie.");
    }
  }, [stopCamera]);

  useEffect(() => {
    const nextCandidates = resolvePreviewCandidates();
    setPreviewIndex(0);
    setPreviewUnavailable(false);
    setImg(nextCandidates[0] || value || "");
  }, [value, candidateKey, resolvePreviewCandidates]);

  useEffect(() => {
    if (!img && canCaptureOrRetake) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => stopCamera();
  }, [img, canCaptureOrRetake, startCamera, stopCamera]);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setCameraError("Camera is not ready yet. Please wait a moment and try again.");
      return;
    }

    const ctx = canvas.getContext("2d");
    const size = Math.min(video.videoWidth, video.videoHeight);
    const startX = (video.videoWidth - size) / 2;
    const startY = (video.videoHeight - size) / 2;

    canvas.width = 400;
    canvas.height = 400;

    ctx.drawImage(video, startX, startY, size, size, 0, 0, 400, 400);

    const dataUrl = canvas.toDataURL("image/png");
    setPreviewIndex(0);
    setPreviewUnavailable(false);
    setImg(dataUrl);
    stopCamera();

    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError("Unable to capture selfie. Please try again.");
        return;
      }

      const file = new File([blob], "selfie-photo.png", { type: "image/png" });
      onCapture?.(file, dataUrl);
    }, "image/png");
  };

  const reset = () => {
    setPreviewIndex(0);
    setPreviewUnavailable(false);
    setImg("");
    setCameraError("");
    onRetake?.();
  };

  const handlePreviewError = () => {
    const candidates = resolvePreviewCandidates();
    const nextIndex = previewIndex + 1;

    if (nextIndex < candidates.length) {
      setPreviewIndex(nextIndex);
      setPreviewUnavailable(false);
      setImg(candidates[nextIndex]);
      return;
    }

    setPreviewUnavailable(true);
  };

  const isSaved = status === "success";
  const hasError = status === "error" || Boolean(cameraError);
  const showStoredPreviewFallback = Boolean(value) && previewUnavailable;

  return (
    <div className="flex flex-col items-center bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-200">
      {!img ? (
        <div className="relative overflow-hidden rounded-2xl shadow-xl bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-[280px] h-[280px] object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[200px] h-[200px] border-4 border-green-500 rounded-full shadow-[0_0_20px_rgba(34,197,94,0.5)]"></div>
          </div>
          <div className="absolute bottom-4 left-0 w-full text-center">
            <p className="text-white text-[10px] font-bold uppercase tracking-widest bg-black/40 backdrop-blur-sm mx-auto w-fit px-3 py-1 rounded-full border border-white/20">
              Center your face in the circle
            </p>
          </div>
        </div>
      ) : showStoredPreviewFallback ? (
        <div className="w-[200px] h-[200px] rounded-full border-4 border-slate-300 bg-slate-100 text-slate-500 shadow-2xl flex items-center justify-center text-center px-6 text-sm font-medium">
          Saved selfie preview is unavailable.
        </div>
      ) : (
        <div className="relative">
          <img
            src={img}
            alt="Captured selfie"
            className="w-[200px] h-[200px] rounded-full object-cover border-4 border-emerald-500 shadow-2xl"
            onLoad={() => setPreviewUnavailable(false)}
            onError={handlePreviewError}
          />
          <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-1 rounded-full shadow-lg">
            <CheckCircle size={20} />
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: "none" }} />

      {uploading && (
        <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-indigo-700">
          <Loader2 size={16} className="animate-spin" />
          Saving selfie to profile...
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">
        Capture a geotagged selfie inside college perimeter. Gallery uploads are blocked.
      </div>

      {isSaved && !uploading && (
        <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <CheckCircle size={16} />
          Saved for profile and trainer ID card
        </div>
      )}

      {hasError && !uploading && (
        <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-rose-600 text-center">
          <AlertCircle size={16} />
          {cameraError || uploadError || "Selfie upload failed. Please retake or retry."}
        </div>
      )}

      <div className="flex gap-4 mt-6">
        {!img && canCaptureOrRetake ? (
          <button
            type="button"
            onClick={capture}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg transition-all flex items-center gap-2"
          >
            <Camera size={18} /> Capture Selfie
          </button>
        ) : img && canCaptureOrRetake ? (
          <button
            type="button"
            onClick={reset}
            className="bg-slate-600 hover:bg-slate-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg transition-all flex items-center gap-2"
          >
            <RefreshCw size={18} /> Retake
          </button>
        ) : null}
      </div>
    </div>
  );
}
