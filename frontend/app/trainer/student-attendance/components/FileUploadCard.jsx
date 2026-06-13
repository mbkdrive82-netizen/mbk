"use client";

import { useState, useEffect } from "react";
import { Loader2, X, CheckCircle2, AlertCircle, CloudUpload, FileSpreadsheet, FileText } from "lucide-react";

export default function FileUploadCard({
  title = "Upload File",
  accept = "*/*",
  maxSizeMb = 10,
  file,
  setFile,
  onSubmit,
  required = false,
  description = "",
}) {
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("idle"); // idle|uploading|success|error
  const [error, setError] = useState("");

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (preview && preview.startsWith("blob:")) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Validation: File size
    if (selected.size > maxSizeMb * 1024 * 1024) {
      setError(`File size exceeds the limit of ${maxSizeMb}MB`);
      setStatus("error");
      setFile(null);
      setPreview(null);
      return;
    }

    setFile(selected);
    setError("");
    setStatus("idle");

    // Preview for images
    if (selected.type.startsWith("image/")) {
      const objectUrl = URL.createObjectURL(selected);
      setPreview(objectUrl);
    } else {
      setPreview(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setError("");
    try {
      await onSubmit(file);
      setStatus("success");
    } catch (err) {
      setError(err?.message || "Upload error");
      setStatus("error");
    }
  };

  const reset = () => {
    setFile(null);
    if (preview && preview.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }
    setPreview(null);
    setStatus("idle");
    setError("");
  };

  // Determine file icon
  const isExcel = file?.name?.endsWith(".xlsx") || file?.name?.endsWith(".xls") || file?.type?.includes("spreadsheet");
  const isPdf = file?.name?.endsWith(".pdf") || file?.type === "application/pdf";

  return (
    <div className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          {title}
          {required && <span className="text-rose-500 font-normal text-sm">*</span>}
        </h3>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>

      <div className="flex-1 flex flex-col justify-center">
        {file ? (
          <div className="relative flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-6">
            {preview ? (
              <div className="relative mb-3 h-32 w-full max-w-xs overflow-hidden rounded-xl border border-slate-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="preview" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                {isExcel ? (
                  <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
                ) : isPdf ? (
                  <FileText className="h-8 w-8 text-rose-600" />
                ) : (
                  <FileText className="h-8 w-8" />
                )}
              </div>
            )}

            <div className="text-center max-w-full">
              <p className="truncate text-sm font-semibold text-slate-700 px-4">{file.name}</p>
              <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>

            {status !== "uploading" && status !== "success" && (
              <button
                type="button"
                onClick={reset}
                className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 transition"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 transition hover:border-[#1a6b9e] hover:bg-blue-50/20 cursor-pointer">
            <input
              type="file"
              accept={accept}
              onChange={handleFileChange}
              className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
            />
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-sm group-hover:border-[#1a6b9e]/30 transition">
              <CloudUpload className="h-6 w-6 text-slate-400 group-hover:text-[#1a6b9e] transition" />
            </div>
            <p className="text-sm font-semibold text-slate-700 group-hover:text-[#1a6b9e] transition text-center">
              Drag & drop or click to upload
            </p>
            <p className="mt-1 text-xs text-slate-400 text-center">
              Supported files: {accept.replace(/\./g, " ")} (max {maxSizeMb}MB)
            </p>
          </div>
        )}
      </div>

      {status === "uploading" && (
        <div className="mt-4 flex items-center justify-center text-sm font-medium text-blue-600 bg-blue-50 rounded-xl py-2 animate-pulse">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading files to server…
        </div>
      )}

      {status === "success" && (
        <div className="mt-4 flex items-center justify-center text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl py-2">
          <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" /> Uploaded successfully
        </div>
      )}

      {status === "error" && (
        <div className="mt-4 flex items-start text-sm font-medium text-rose-800 bg-rose-50 border border-rose-100 rounded-xl p-3">
          <AlertCircle className="h-4 w-4 mr-2 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Upload failed</p>
            <p className="text-xs text-rose-600/90 mt-0.5 truncate">{error}</p>
          </div>
          <button type="button" onClick={() => setStatus("idle")} className="ml-2 text-rose-400 hover:text-rose-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {file && status !== "success" && status !== "uploading" && (
        <button
          type="button"
          onClick={handleUpload}
          className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-[#0f3f5c] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1a6b9e] shadow-sm transition active:scale-[0.98]"
        >
          Confirm and Upload
        </button>
      )}
    </div>
  );
}
