"use client";

import { useState } from "react";
import { api } from "@/services/api";

function FloatingInput({ label, type = "text", ...props }) {
  return (
    <div className="relative">
      <input
        type={type}
        placeholder=" "
        className="peer w-full border border-gray-300 rounded-lg px-3 pt-5 pb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow bg-transparent disabled:bg-gray-50 disabled:text-gray-500"
        {...props}
      />
      <label className="absolute left-3 top-2 text-gray-500 text-sm transition-all pointer-events-none
        peer-placeholder-shown:top-3.5
        peer-placeholder-shown:text-[15px]
        peer-placeholder-shown:text-gray-400
        peer-focus:top-1.5
        peer-focus:text-xs
        peer-focus:text-blue-600
        peer-disabled:bg-transparent">
        {label}
      </label>
    </div>
  );
}

export default function AddCompanyModal({ onClose, onSuccess }) {
  const [adminEmail, setAdminEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [message, setMessage] = useState({ text: "", type: "" });

  const setMsg = (text, type = "info") => setMessage({ text, type });

  const handleSendOtp = async () => {
    if (!adminEmail) return setMsg("Enter admin email first", "error");
    try {
      setLoading(true);
      setMsg("");
      await api.post("/companies/send-otp", { email: adminEmail });
      setOtpSent(true);
      // Show generic success message without exposing OTP
      setMsg(`OTP has been sent to your registered email address.`, "success");
    } catch (err) {
      setMsg(err.message || "Error sending OTP", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) return setMsg("Please enter 6-digit OTP", "error");
    try {
      setLoading(true);
      setMsg("");
      await api.post("/companies/verify-otp", { email: adminEmail, otp });
      setIsVerified(true);
      setMsg("Email verified successfully.", "success");
    } catch (err) {
      setMsg(err.message || "Invalid OTP", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvite = async () => {
    if (!isVerified) return setMsg("Please verify admin email first", "error");
    try {
      setLoading(true);
      setMsg("");
      const res = await api.post("/company-invite", { email: adminEmail });
      setInviteLink(res?.inviteLink || "");
      setMsg("Invite created and sent to admin email.", "success");
      onSuccess?.();
    } catch (err) {
      setMsg(err.message || "Error creating invite", "error");
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setMsg("Invite link copied to clipboard.", "success");
    } catch {
      setMsg("Failed to copy link. Please copy manually.", "error");
    }
  };

  return (
    <div className="dashboard-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="dashboard-modal-panel relative w-full max-w-xl animate-fadeIn rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 text-xl font-bold p-2 leading-none"
        >
          X
        </button>

        <h2 className="text-2xl font-semibold text-gray-800 mb-1">Create Company Invite</h2>
        <p className="text-sm text-gray-500 mb-6">
          Step 1: Enter admin email, verify OTP, and generate secure onboarding link.
        </p>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <FloatingInput
                label="Admin Email"
                type="email"
                value={adminEmail}
                onChange={(e) => {
                  setAdminEmail(e.target.value);
                  setOtp("");
                  setOtpSent(false);
                  setIsVerified(false);
                  setInviteLink("");
                  setMsg("");
                }}
                disabled={loading || isVerified}
              />
            </div>
            {!isVerified && (
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={loading || !adminEmail}
                className="shrink-0 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {loading && !otpSent ? "..." : otpSent ? "Resend OTP" : "Send OTP"}
              </button>
            )}
          </div>

          {otpSent && !isVerified && (
            <div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="6-digit OTP"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={loading}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-center tracking-widest font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={loading || otp.length !== 6}
                  className="shrink-0 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  Verify OTP
                </button>
              </div>
              <p className="mt-2 text-xs text-amber-600">
                Use the latest OTP only. Every resend invalidates previous OTPs.
              </p>
            </div>
          )}

          {isVerified && (
            <p className="text-xs text-emerald-600 font-medium">Email verified. Ready to create invite.</p>
          )}
        </div>

        {inviteLink && (
          <div className="mt-5 border border-emerald-200 bg-emerald-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-emerald-700 mb-2">Create Invite Link</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={inviteLink}
                className="flex-1 border border-emerald-200 bg-white rounded-md px-2 py-2 text-xs text-gray-700"
              />
              <button
                onClick={copyInviteLink}
                className="shrink-0 px-3 py-2 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors"
              >
                Copy Link
              </button>
            </div>
          </div>
        )}

        {message.text && (
          <p className={`text-sm mt-4 font-medium px-1 ${
            message.type === "error" ? "text-red-500" : "text-emerald-600"
          }`}>
            {message.text}
          </p>
        )}

        <div className="flex justify-end gap-3 mt-8">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreateInvite}
            disabled={!isVerified || loading || !!inviteLink}
            className="px-8 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? "Creating..." : "Create Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}
