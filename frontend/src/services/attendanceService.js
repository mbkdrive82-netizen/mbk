import { api } from '@/services/api';

/**
 * Attendance Service
 * Handles all attendance-related API calls
 */

/**
 * Canonical flow step 1: check-in.
 */
export const checkInAttendance = (formData) => {
    return api.post('/attendance/check-in', formData);
};

/**
 * Canonical flow step 2: check-out.
 */
export const checkOutAttendance = (formData) => {
    return api.post('/attendance/check-out', formData);
};

/**
 * Legacy adapter endpoint. Prefer checkInAttendance + checkOutAttendance.
 */
export const submitAttendance = (formData) => {
    return api.post('/attendance/submit', formData);
};

/**
 * Get pending attendance submissions for SPOC verification
 * @param {Object} filters - Optional filters (collegeId, trainerId)
 */
export const getPendingSubmissions = (filters = {}, requestOptions = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/attendance/pending${params ? `?${params}` : ''}`, requestOptions);
};

/**
 * Get all attendance records (for Super Admin)
 * @param {Object} filters - Optional filters
 */
export const getAllAttendance = (filters = {}, requestOptions = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/attendance${params ? `?${params}` : ''}`, requestOptions);
};

/**
 * Get single attendance submission details
 * @param {number} id - Attendance ID
 */
export const getSubmission = (id) => {
    return api.get(`/attendance/${id}`);
};

/**
 * Verify (approve/reject) attendance submission
 * @param {number} id - Attendance ID
 * @param {Object} verificationData - { verificationStatus, verificationComment, verifiedBy }
 */
export const verifySubmission = (id, verificationData) => {
    return api.put(`/attendance/${id}/verify`, verificationData);
};

/**
 * Upload attendance with image and signature (LEGACY - for trainers)
 * @param {FormData} formData - Form data containing image, signature, and attendance details
 */
export const uploadAttendance = (formData) => {
    return api.post('/attendance/upload', formData);
};

/**
 * Manual attendance entry (for Company Admin)
 * @param {Object} data - Attendance data
 * @param {File} imageFile - Optional image file
 */
export const createManualAttendance = (data, imageFile = null) => {
    const formData = new FormData();

    // Append all data fields
    Object.keys(data).forEach(key => {
        if (data[key] !== null && data[key] !== undefined) {
            formData.append(key, data[key]);
        }
    });

    // Append image if provided
    if (imageFile) {
        formData.append('image', imageFile);
    }

    return api.post('/attendance/manual', formData);
};

/**
 * Get attendance records for a trainer
 * @param {number} trainerId - Trainer ID
 * @param {Object} filters - Optional filters (startDate, endDate, collegeId)
 */
export const getTrainerAttendance = (trainerId, filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/attendance/trainer/${trainerId}${params ? `?${params}` : ''}`);
};

/**
 * Get attendance records for a college
 * @param {number} collegeId - College ID
 * @param {Object} filters - Optional filters (date, trainerId)
 */
export const getCollegeAttendance = (collegeId, filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/attendance/college/${collegeId}${params ? `?${params}` : ''}`);
};

/**
 * Get attendance statistics for a trainer
 * @param {number} trainerId - Trainer ID
 * @param {Object} filters - Optional filters (month, year)
 */
export const getAttendanceStats = (trainerId, filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return api.get(`/attendance/stats/${trainerId}${params ? `?${params}` : ''}`);
};

/**
 * Update attendance record
 * @param {number} id - Attendance ID
 * @param {Object} data - Update data (checkOutTime, status, remarks)
 */
export const updateAttendance = (id, data) => {
    return api.put(`/attendance/${id}`, data);
};
