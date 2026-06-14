import { api } from "@/services/api";

export const getTrainerAssignment = () => api.get("/trainer-portal/assignment");

export const verifyTrainerGps = (payload) =>
  api.post("/trainer-portal/verify-gps", payload);

export const getTrainerDashboardAnalytics = () =>
  api.get("/trainer-portal/dashboard");

export const getTrainerAttendanceRecords = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  return api.get(`/trainer-portal/attendance-records${suffix}`);
};

export const downloadAttendanceTemplate = async () => {
  const response = await fetch("/api/trainer-portal/attendance-template", {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("accessToken") || localStorage.getItem("authToken") || ""}`,
    },
  });
  return response.blob();
};

export const uploadAttendanceExcel = (formData) =>
  api.post("/trainer-portal/attendance-excel/upload", formData);

export const recordDriveFile = (payload) =>
  api.post("/trainer-portal/drive-file", payload);

export default {
  getTrainerAssignment,
  verifyTrainerGps,
  getTrainerDashboardAnalytics,
  getTrainerAttendanceRecords,
  downloadAttendanceTemplate,
  uploadAttendanceExcel,
  recordDriveFile,
};
