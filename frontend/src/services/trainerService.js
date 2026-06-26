import { api } from "@/services/api";

/**
 * Get all trainers
 */
export const getTrainers = (query = "") => api.get(`/trainers${query}`);

/**
 * Paginated trainer list (supports: page, limit, search)
 * Normalizes varying backend response shapes into:
 * { data, total, page, limit, totalPages, hasNextPage, hasPrevPage }
 */
export const fetchTrainersPage = async ({
  page = 1,
  limit = 20,
  search = "",
} = {}) => {
  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("limit", String(limit));
  if (String(search || "").trim()) {
    query.set("search", String(search).trim());
  }

  const response = await api.get(`/v1/trainers?${query.toString()}`);
  const payload = response?.data || response || {};

  let rows = [];
  if (Array.isArray(payload)) {
    rows = payload;
  } else if (Array.isArray(payload?.data)) {
    rows = payload.data;
  } else if (Array.isArray(payload?.trainers)) {
    rows = payload.trainers;
  } else if (Array.isArray(payload?.data?.trainers)) {
    rows = payload.data.trainers;
  }

  const pagination = payload?.pagination || payload?.data?.pagination || {};
  const resolvedTotal = Number(
    payload?.total ??
      payload?.count ??
      pagination?.total ??
      rows.length,
  );
  const resolvedPage = Number(
    payload?.page ??
      pagination?.page ??
      page,
  );
  const resolvedLimit = Number(
    payload?.limit ??
      pagination?.limit ??
      limit,
  );
  const resolvedTotalPages = Number(
    payload?.totalPages ??
      pagination?.totalPages ??
      Math.max(1, Math.ceil(resolvedTotal / Math.max(1, resolvedLimit))),
  );

  return {
    data: rows,
    total: Number.isFinite(resolvedTotal) ? resolvedTotal : rows.length,
    page: Number.isFinite(resolvedPage) ? resolvedPage : page,
    limit: Number.isFinite(resolvedLimit) ? resolvedLimit : limit,
    totalPages: Number.isFinite(resolvedTotalPages) ? resolvedTotalPages : 1,
    hasNextPage:
      payload?.hasNextPage ??
      pagination?.hasNextPage ??
      (resolvedPage < resolvedTotalPages),
    hasPrevPage:
      payload?.hasPrevPage ??
      pagination?.hasPrevPage ??
      (resolvedPage > 1),
  };
};

/**
 * Create a new trainer
 */
export const createTrainer = (data) => api.post("/trainers", data);

/**
 * Update an existing trainer
 */
export const updateTrainer = (id, data) => api.put(`/trainers/${id}`, data);

/**
 * Delete a trainer (if needed)
 */
/**
 * Delete a trainer (if needed)
 */
export const deleteTrainer = (id) => api.delete(`/trainers/${id}`);

/**
 * Get a single trainer by ID
 */
export const getTrainer = (id, query = "") =>
  api.get(`/trainers/${id}${query}`);

/**
 * Get current trainer profile
 */
export const getTrainerProfile = (query = "") =>
  api.get(`/trainers/profile/me${query}`);

/**
 * Upload a document for a trainer
 * @param {FormData} formData - Contains file, trainerId, documentType
 */
export const uploadDocument = (formData) =>
  // uploads must be authenticated for trainer document routes
  api.post("/trainer-documents/upload", formData);

/**
 * Verify or reject a document
 * @param {string} trainerId
 * @param {object} data - { documentType, verified, rejectionReason }
 */
export const verifyDocument = (trainerId, data) =>
  api.put(`/trainers/${trainerId}/verify-document`, data);

/**
 * Upload profile picture
 * @param {FormData} formData
 */
export const uploadProfilePicture = (formData) =>
  api.post("/trainers/upload-profile-picture", formData);

/**
 * Submit trainer registration (Final Step)
 */
export const submitRegistration = () =>
  api.post("/trainers/submit-registration");

/**
 * Submit profile for verification (Internal)
 */
export const submitVerification = () =>
  api.put("/trainer-documents/submit-verification");

/**
 * Trainer Register (Unified Submit)
 */
export const registerTrainer = (data) => api.post("/trainers/register", data);

/**
 * Save Registration Step (Refined)
 */
export const saveRegistrationStep = (data) =>
  api.post("/trainers/save-step", data);

/**
 * Create Step 1 (Initial Record)
 */
export const createStep1 = (data) => api.post("/trainers/create-step1", data);

/**
 * Update Registration Step 2 (Profile)
 */
export const updateStep2 = (data) => api.post("/trainers/update-step2", data);

/**
 * Update Registration Step 3 (Documents)
 */
export const updateStep3 = (data) => api.post("/trainers/update-step3", data);

/**
 * Final Registration Submit
 */
export const submitFinal = (data) => api.post("/trainers/submit", data);

/**
 * Get Trainer Progress (Refined)
 */
export const getTrainerProgress = async (email) => {
  const response = await api.get(`/trainers/progress?email=${email}`);

  if (typeof response === "string") {
    try {
      return JSON.parse(response);
    } catch (error) {
      console.error("Failed to parse trainer progress response", error);
    }
  }

  return response;
};

/**
 * Get managed NDA agreement template
 */
export const getNdaTemplate = () => api.get("/trainers/nda-template");

/**
 * Update managed NDA agreement template
 */
export const updateNdaTemplate = (data) => api.put("/trainers/nda-template", data);

/**
 * Update current trainer profile
 */
export const updateTrainerProfile = (data) =>
  api.put("/trainers/profile/me", data);
