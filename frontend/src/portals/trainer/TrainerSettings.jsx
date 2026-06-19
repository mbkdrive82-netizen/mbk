"use client";

import { useState } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";
import { notify } from "@/lib/toast";
import { Shield, LogOut, Save, Eye, EyeOff } from "lucide-react";

const Section = ({ title, description, children }) => (
  <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-6">
    <div className="px-6 py-5 border-b bg-gray-50/80">
      <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
      {description ? (
        <p className="mt-1 text-xs text-gray-500 max-w-3xl">{description}</p>
      ) : null}
    </div>
    <div className="px-6 py-6">{children}</div>
  </div>
);

const ToggleSwitch = ({ label, description, checked, onChange }) => (
  <label className="flex cursor-pointer select-none items-center justify-between gap-4 rounded-3xl border border-gray-200 bg-white px-4 py-4 transition hover:border-indigo-300">
    <span className="min-w-0">
      <span className="block text-sm font-semibold text-gray-900">{label}</span>
      <span className="block text-xs text-gray-500">{description}</span>
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition-colors duration-200 ${checked ? 'bg-indigo-600' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition duration-200 ${checked ? 'translate-x-7' : 'translate-x-1'}`} />
    </button>
  </label>
);

export default function TrainerSettings() {
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const [showPwd, setShowPwd] = useState(false);
  const [notifications, setNotifications] = useState({
    scheduleUpdates: true,
    payslipReady: true,
    attendanceApproved: true,
    complaintUpdates: true,
    chatMessages: true,
  });

  const notifLabels = {
    scheduleUpdates: "Schedule changes & new assignments",
    payslipReady: "Payslip generated notification",
    attendanceApproved: "Attendance verification updates",
    complaintUpdates: "Complaint status changes",
    chatMessages: "New chat messages",
  };

  const [savingNotif, setSavingNotif] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: "", new: "", confirm: "" });
  const [savingPwd, setSavingPwd] = useState(false);

  const handleSave = async () => {
    setSavingNotif(true);
    try {
      await api.put("/users/notification-preferences", { preferences: notifications });
      notify.success("Preferences saved");
    } catch {
      notify.error("Failed to save preferences");
    } finally {
      setSavingNotif(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordForm.new !== passwordForm.confirm) {
      notify.error("New passwords do not match");
      return;
    }
    if (passwordForm.new.length < 8) {
      notify.error("Password must be at least 8 characters");
      return;
    }
    setSavingPwd(true);
    try {
      await api.put("/auth/change-password", {
        currentPassword: passwordForm.current,
        newPassword: passwordForm.new,
      });
      notify.success("Password updated successfully");
      setPasswordForm({ current: "", new: "", confirm: "" });
    } catch (err) {
      notify.error(err?.message || "Failed to update password");
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24 md:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          Manage your notification preferences, password, and security settings from one place.
        </p>
      </div>

      {/* Profile overview */}
      <Section
        title="Your Account"
        description="This summary shows the account currently signed in. Keep your email secure and update your password regularly."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xl font-bold shrink-0">
            {(currentUser?.name || "T")[0]}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-base truncate">{currentUser?.name || "—"}</p>
            <p className="text-sm text-gray-500 truncate">{currentUser?.email}</p>
            <span className="inline-flex mt-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold uppercase tracking-[0.12em]">
              Trainer
            </span>
          </div>
        </div>
      </Section>

      {/* Notifications */}
      <Section
        title="Notifications"
        description="Choose the alerts you want to receive for schedule updates, payslips, attendance verification, and more."
      >
        <div className="space-y-3">
          {Object.entries(notifications).map(([key, val]) => (
            <ToggleSwitch
              key={key}
              label={notifLabels[key]}
              description={val ? 'Enabled' : 'Disabled'}
              checked={val}
              onChange={() => setNotifications((p) => ({ ...p, [key]: !val }))}
            />
          ))}
        </div>
        <div className="flex justify-end mt-5">
          <button
            onClick={handleSave}
            disabled={savingNotif}
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {savingNotif ? "Saving preferences…" : "Save preferences"}
          </button>
        </div>
      </Section>

      {/* Security / Password Change */}
      <Section title="Security">
        <form onSubmit={handlePasswordChange} className="space-y-4">
          {[
            { label: "Current password", key: "current" },
            { label: "New password", key: "new" },
            { label: "Confirm new password", key: "confirm" },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={passwordForm[key]}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, [key]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 pr-10"
                  required
                />
                <button type="button" onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
          <button type="submit" disabled={savingPwd}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-50">
            <Shield className="w-4 h-4" />
            {savingPwd ? "Updating…" : "Update password"}
          </button>
        </form>
      </Section>

      {/* Sign out */}
      <div className="bg-red-50 rounded-3xl p-6 border border-red-100 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-red-900">Sign out</h3>
            <p className="text-sm text-red-700">
              Sign out of the trainer portal to protect your account when you're finished.
            </p>
          </div>
          <button
            onClick={async () => {
              try {
                await logout();
                router.push('/');
              } catch (error) {
                console.error('Logout failed:', error);
                router.push('/');
              }
            }}
            className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
