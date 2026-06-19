"use client";
import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef } from 'react';
import { App as AntdApp } from 'antd';

import { CalendarDaysIcon, ListBulletIcon } from '@heroicons/react/24/outline';
import scheduleService from '@/services/scheduleService';
import { getTrainerProfile } from '@/services/trainerService';
import { api } from '@/services/api';
import { getSecureImageUrl } from '@/utils/imageUtils';
import { formatGeoValidationSourceLabel } from '@/components/common/GeoVerificationReportCard';
import { useAuth } from '@/context/AuthContext';

import MobileTrainerLayout from '@/app/layouts/MobileTrainerLayout';
import PendingActionsPanel from './TrainerSchedule/PendingActionsPanel';
import ScheduleList from './TrainerSchedule/ScheduleList';
import ScheduleCalendarView from './TrainerSchedule/ScheduleCalendarView';
import TrainerScheduleSkeleton from './TrainerSchedule/TrainerScheduleSkeleton';
import {
    GEO_UPLOAD_ABSOLUTE_MAX_BYTES,
    GEO_UPLOAD_HARD_MAX_BYTES,
    GEO_UPLOAD_MAX_MEGAPIXELS,
    GEO_UPLOAD_MAX_PIXELS,
    GEO_UPLOAD_SOFT_MIN_BYTES,
    GEO_UPLOAD_TARGET_MAX_BYTES,
    formatUploadBytes,
    getGeoUploadSizeState,
    getPixelBudgetMaxDimension,
    shouldAutoCompressGeoImage,
} from './TrainerSchedule/geoImageUploadPolicy';
import {
    decorateScheduleForRender,
    getAssignedDateKey,
    isScheduleActionableForTrainerWorkflow,
    normalizeStatus,
    resolveEntityId,
} from './TrainerSchedule/scheduleProcessing';
import useScheduleProcessor, { isScheduleProcessorCancellationError } from './TrainerSchedule/useScheduleProcessor';
import useScheduleHook from './TrainerSchedule/useScheduleHook';
import useRenderCountDebug from "@/shared/perf/useRenderCountDebug";

const CheckInModal = dynamic(() => import("./TrainerSchedule/CheckInModal"), {
    ssr: false,
    loading: () => null,
});

const CheckOutModal = dynamic(() => import("./TrainerSchedule/CheckOutModal"), {
    ssr: false,
    loading: () => null,
});

const CHECK_OUT_IMAGE_SLOT_COUNT = 3;
const MB = 1024 * 1024;
const MIN_SCHEDULE_REFRESH_GAP_MS = 5_000;
const MAX_CACHED_MONTH_KEYS = 12;
const TRAINER_SCHEDULE_MONTH_SNAPSHOT_PREFIX = 'trainer-schedule:month:v1';
const TRAINER_SCHEDULE_PENDING_SNAPSHOT_PREFIX = 'trainer-schedule:pending:v1';
const TRAINER_SCHEDULE_SNAPSHOT_TTL_MS = 30 * 60 * 1000;
let imageCompressionModulePromise = null;

const getImageCompression = async () => {
    if (!imageCompressionModulePromise) {
        imageCompressionModulePromise = import('browser-image-compression')
            .then((module) => module.default || module);
    }

    return imageCompressionModulePromise;
};

const runWhenIdle = (callback) => {
    if (typeof window === 'undefined') {
        return () => {};
    }

    if (typeof window.requestIdleCallback === 'function') {
        const handle = window.requestIdleCallback(callback, { timeout: 900 });
        return () => window.cancelIdleCallback(handle);
    }

    const handle = window.setTimeout(callback, 0);
    return () => window.clearTimeout(handle);
};

const normalizeImageSlotStatus = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'verified' || normalized === 'completed') return 'verified';
    if (normalized === 'pending') return 'pending';
    return 'empty';
};

const createCheckOutImageSlot = (slotIndex, overrides = {}) => ({
    slotIndex,
    uploaded: false,
    file: null,
    previewUrl: null,
    persistedUrl: null,
    imageName: null,
    status: 'empty',
    reason: null,
    distance: null,
    latitude: null,
    longitude: null,
    validationSource: null,
    verificationReport: null,
    locked: false,
    ...overrides,
});

const createEmptyCheckOutImageSlots = () =>
    Array.from({ length: CHECK_OUT_IMAGE_SLOT_COUNT }, (_, index) => createCheckOutImageSlot(index));

const GEO_TAG_MATCH_RADIUS_LABEL = '10 KM';

const getFriendlyGeoFailureReason = (reason) => {
    const normalizedReason = String(reason || '').trim().toLowerCase();

    if (!normalizedReason) {
        return 'Verification failed. Please capture the image again.';
    }
    if (normalizedReason.includes('date not matched')) {
        return 'The photo date does not match the assigned training date.';
    }
    if (normalizedReason.includes('location not matched')) {
        return `The image was captured outside the allowed ${GEO_TAG_MATCH_RADIUS_LABEL} college area.`;
    }
    if (normalizedReason.includes('geo mismatch')) {
        return 'The image GPS stamp does not match the embedded image data.';
    }
    if (normalizedReason.includes('time mismatch')) {
        return 'The image time does not match the printed stamp time.';
    }
    if (normalizedReason.includes('no readable location')) {
        return 'GPS or date details could not be read. Upload the original GPS camera image.';
    }

    return reason;
};

const isJpegLikeFile = (file) => {
    const mimeType = String(file?.type || '').toLowerCase();
    const fileName = String(file?.name || '').toLowerCase();
    return mimeType.includes('jpeg') || mimeType.includes('jpg') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg');
};

const readImageDimensions = (file) => new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
        const width = Number(image.naturalWidth || image.width || 0);
        const height = Number(image.naturalHeight || image.height || 0);
        URL.revokeObjectURL(objectUrl);
        resolve({ width, height, pixels: width * height });
    };

    image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Unable to read image dimensions'));
    };

    image.src = objectUrl;
});

const optimizeGeoImageForUpload = async (file, dimensions, options = {}) => {
    const imageCompression = await getImageCompression();
    const { preserveExifPreferred = false } = options;
    const pixelBudgetMaxDimension = getPixelBudgetMaxDimension(dimensions);
    const lastKnownDimension = Math.max(640, pixelBudgetMaxDimension);
    const isJpegInput = isJpegLikeFile(file);
    const compressionProfiles = [
        { maxSizeMB: GEO_UPLOAD_TARGET_MAX_BYTES / MB, maxWidthOrHeight: lastKnownDimension, initialQuality: 0.92, useWebWorker: true },
        { maxSizeMB: GEO_UPLOAD_TARGET_MAX_BYTES / MB, maxWidthOrHeight: Math.max(640, Math.floor(lastKnownDimension * 0.9)), initialQuality: 0.86, useWebWorker: true },
        { maxSizeMB: GEO_UPLOAD_TARGET_MAX_BYTES / MB, maxWidthOrHeight: Math.max(640, Math.floor(lastKnownDimension * 0.82)), initialQuality: 0.8, useWebWorker: false },
        { maxSizeMB: GEO_UPLOAD_TARGET_MAX_BYTES / MB, maxWidthOrHeight: Math.max(640, Math.floor(lastKnownDimension * 0.72)), initialQuality: 0.72, useWebWorker: false },
        { maxSizeMB: GEO_UPLOAD_TARGET_MAX_BYTES / MB, maxWidthOrHeight: Math.max(640, Math.floor(lastKnownDimension * 0.64)), initialQuality: 0.66, useWebWorker: false },
        { maxSizeMB: GEO_UPLOAD_TARGET_MAX_BYTES / MB, maxWidthOrHeight: Math.max(640, Math.floor(lastKnownDimension * 0.58)), initialQuality: 0.58, useWebWorker: false },
    ];

    const optimizationAttempts = preserveExifPreferred
        ? [
            ...compressionProfiles.map((profile) => ({ ...profile, preserveExif: true })),
            ...compressionProfiles.map((profile) => ({ ...profile, preserveExif: false })),
        ]
        : [
            ...compressionProfiles.map((profile) => ({ ...profile, preserveExif: false })),
            ...compressionProfiles.map((profile) => ({ ...profile, preserveExif: true })),
        ];

    let smallestCandidate = null;
    let lastError = null;

    for (const options of optimizationAttempts) {
        try {
            const preserveExif = Boolean(options.preserveExif && isJpegInput);
            const compressedBlob = await imageCompression(file, {
                ...options,
                maxIteration: 25,
                preserveExif,
                fileType: isJpegInput ? undefined : 'image/jpeg',
            });
            const candidateMimeType = compressedBlob.type || (isJpegInput ? file.type : 'image/jpeg');
            const candidateName = candidateMimeType === 'image/jpeg'
                ? String(file.name || 'geo-upload.jpg').replace(/\.(png|webp)$/i, '.jpg')
                : file.name;

            const candidateFile = new File(
                [compressedBlob],
                candidateName,
                {
                    type: candidateMimeType || file.type || 'image/jpeg',
                    lastModified: Date.now(),
                },
            );

            if (!smallestCandidate || candidateFile.size < smallestCandidate.size) {
                smallestCandidate = candidateFile;
            }

            if (candidateFile.size <= GEO_UPLOAD_TARGET_MAX_BYTES) {
                return candidateFile;
            }
        } catch (error) {
            lastError = error;
        }
    }

    if (smallestCandidate) {
        return smallestCandidate;
    }

    throw lastError || new Error('Unable to optimize image');
};

const stripHtmlTags = (value) =>
    String(value || '')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const getFriendlyGeoUploadError = (uploadError) => {
    const possibleMessages = [
        uploadError?.response?.message,
        uploadError?.response?.error,
        uploadError?.message,
    ];

    for (const candidate of possibleMessages) {
        if (!candidate) continue;
        const normalizedCandidate = String(candidate).toLowerCase();
        if (
            normalizedCandidate.includes('file too large')
            || normalizedCandidate.includes('limit_file_size')
            || normalizedCandidate.includes('multererror')
        ) {
            return `Image file is too large. Target size is ${formatUploadBytes(GEO_UPLOAD_TARGET_MAX_BYTES)} (auto-compressed), hard limit is ${formatUploadBytes(GEO_UPLOAD_HARD_MAX_BYTES)}.`;
        }
        if (normalizedCandidate.includes('only allows') || normalizedCandidate.includes('unsupported upload field')) {
            return 'Unsupported image format. Please upload JPG, JPEG, or PNG.';
        }
    }

    for (const candidate of possibleMessages) {
        if (!candidate) continue;
        const cleaned = stripHtmlTags(candidate);
        if (cleaned) {
            return cleaned;
        }
    }

    return 'Failed to upload GeoTag image.';
};

const getGeoSlotStatusMessage = (slot, isVerified, isPending) => {
    const numericDistance = Number(slot?.distance);
    const hasDistance = Number.isFinite(numericDistance);
    const formattedDistance = hasDistance ? `${numericDistance.toFixed(2)} km` : null;

    if (isVerified) {
        return formattedDistance
            ? `Location matched within ${GEO_TAG_MATCH_RADIUS_LABEL} and date verified. Distance: ${formattedDistance}.`
            : `Location matched within ${GEO_TAG_MATCH_RADIUS_LABEL} and date verified.`;
    }

    if (isPending && slot?.reason) {
        return getFriendlyGeoFailureReason(slot.reason);
    }

    return slot?.uploaded
        ? 'Image uploaded and stored for final submit.'
        : 'Capture or upload the image for this slot.';
};

const getGeoSlotHeadline = (slot, isVerified, isPending) => {
    if (isVerified) {
        return 'Success';
    }
    if (isPending) {
        return 'Failed';
    }
    return 'Waiting';
};

const buildCheckOutImageSlots = (record = {}) => {
    const persistedImages = Array.isArray(record?.images) && record.images.length
        ? record.images
        : (Array.isArray(record?.checkOut?.images) ? record.checkOut.images : []);
    const persistedPhotos = Array.isArray(record?.checkOut?.photos) ? record.checkOut.photos : [];

    return createEmptyCheckOutImageSlots().map((slot, index) => {
        const persistedImage = persistedImages[index] || null;
        const persistedPhoto = persistedPhotos[index] || null;
        const normalizedStatus = normalizeImageSlotStatus(
            persistedImage?.status || persistedPhoto?.validationStatus
        );
        const uploaded = Boolean(persistedImage?.image || persistedPhoto?.url);

        return createCheckOutImageSlot(index, {
            uploaded,
            previewUrl: persistedPhoto?.url ? getSecureImageUrl(persistedPhoto.url) : null,
            persistedUrl: persistedPhoto?.url || null,
            imageName:
                persistedImage?.image
                || (typeof persistedPhoto?.url === 'string' ? persistedPhoto.url.split(/[/\\]/).pop() : null),
            status: uploaded ? normalizedStatus : 'empty',
            reason: normalizedStatus === 'pending' ? (persistedPhoto?.validationReason || null) : null,
            distance: persistedImage?.distance ?? persistedPhoto?.distanceKm ?? null,
            latitude: persistedImage?.latitude ?? persistedPhoto?.latitude ?? null,
            longitude: persistedImage?.longitude ?? persistedPhoto?.longitude ?? null,
            validationSource: persistedPhoto?.validationSource || persistedPhoto?.verificationReport?.source || null,
            verificationReport: persistedPhoto?.verificationReport || null,
            locked: normalizedStatus === 'verified',
        });
    });
};

const mergeUploadedGeoStateIntoSchedule = (schedule, uploadResponse = {}) => {
    if (!schedule) return schedule;

    const nextAttendanceStatus = uploadResponse?.attendanceStatus ?? schedule.attendanceStatus ?? null;
    const nextGeoVerificationStatus = uploadResponse?.geoVerificationStatus ?? schedule.geoVerificationStatus ?? null;
    let nextStatus = schedule.status;

    if (normalizeStatus(nextAttendanceStatus) === 'approved') {
        nextStatus = normalizeStatus(nextGeoVerificationStatus) === 'approved' ? 'COMPLETED' : 'inprogress';
    }

    return decorateScheduleForRender({
        ...schedule,
        status: nextStatus,
        assignedDate: uploadResponse?.assignedDate ?? schedule.assignedDate ?? null,
        images: Array.isArray(uploadResponse?.images) ? uploadResponse.images : schedule.images,
        finalStatus: uploadResponse?.finalStatus ?? schedule.finalStatus ?? null,
        attendanceStatus: nextAttendanceStatus,
        geoVerificationStatus: nextGeoVerificationStatus,
        geoValidationComment: uploadResponse?.geoValidationComment ?? schedule.geoValidationComment ?? null,
        checkOut: uploadResponse?.checkOut ?? schedule.checkOut ?? null,
    });
};

const toNumericCoordinate = (value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
};

const hasCoordinatePair = (latitude, longitude) => (
    Number.isFinite(toNumericCoordinate(latitude)) && Number.isFinite(toNumericCoordinate(longitude))
);

const buildGoogleMapsSearchUrl = (latitude, longitude) => {
    const normalizedLatitude = toNumericCoordinate(latitude);
    const normalizedLongitude = toNumericCoordinate(longitude);

    if (!Number.isFinite(normalizedLatitude) || !Number.isFinite(normalizedLongitude)) {
        return null;
    }

    return `https://www.google.com/maps/search/?api=1&query=${normalizedLatitude},${normalizedLongitude}`;
};

const formatDistanceLabel = (value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? `${numericValue.toFixed(2)} km` : 'N/A';
};

const getMissingGeoValidationItems = (report) => {
    if (!report || typeof report !== 'object') return [];

    const missingItems = [];
    if (!hasCoordinatePair(report?.exif?.latitude, report?.exif?.longitude)) {
        missingItems.push('EXIF location');
    }
    if (!(report?.exif?.capturedAt || report?.exif?.timestamp)) {
        missingItems.push('EXIF time');
    }
    if (!hasCoordinatePair(report?.ocr?.latitude, report?.ocr?.longitude)) {
        missingItems.push('OCR stamp location');
    }
    if (!(report?.ocr?.capturedAt || report?.ocr?.timestamp)) {
        missingItems.push('OCR stamp time');
    }

    return missingItems;
};

const revokeBlobPreview = (url) => {
    if (typeof url === 'string' && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
    }
};

const setMonthScheduleCacheValue = (cacheMap, key, value) => {
    cacheMap.set(key, value);
    if (cacheMap.size <= MAX_CACHED_MONTH_KEYS) {
        return;
    }
    const oldestKey = cacheMap.keys().next().value;
    if (oldestKey) {
        cacheMap.delete(oldestKey);
    }
};

const canUseSessionStorage = () => (
    typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
);

const buildMonthSnapshotStorageKey = (trainerId, month) => {
    const normalizedTrainerId = String(trainerId || '').trim();
    const normalizedMonth = String(month || '').trim();
    if (!normalizedTrainerId || !normalizedMonth) return '';
    return `${TRAINER_SCHEDULE_MONTH_SNAPSHOT_PREFIX}:${normalizedTrainerId}:${normalizedMonth}`;
};

const buildPendingSnapshotStorageKey = (trainerId) => {
    const normalizedTrainerId = String(trainerId || '').trim();
    if (!normalizedTrainerId) return '';
    return `${TRAINER_SCHEDULE_PENDING_SNAPSHOT_PREFIX}:${normalizedTrainerId}`;
};

const readSnapshotFromSessionStorage = (storageKey) => {
    if (!storageKey || !canUseSessionStorage()) {
        return null;
    }

    try {
        const rawSnapshot = window.sessionStorage.getItem(storageKey);
        if (!rawSnapshot) {
            return null;
        }

        const parsedSnapshot = JSON.parse(rawSnapshot);
        const updatedAt = Number(parsedSnapshot?.updatedAt || 0);
        const isFreshSnapshot = Number.isFinite(updatedAt)
            && (Date.now() - updatedAt) <= TRAINER_SCHEDULE_SNAPSHOT_TTL_MS;

        if (!isFreshSnapshot) {
            window.sessionStorage.removeItem(storageKey);
            return null;
        }

        return parsedSnapshot?.data ?? null;
    } catch {
        return null;
    }
};

const writeSnapshotToSessionStorage = (storageKey, data) => {
    if (!storageKey || !canUseSessionStorage()) {
        return;
    }

    try {
        window.sessionStorage.setItem(storageKey, JSON.stringify({
            updatedAt: Date.now(),
            data,
        }));
    } catch {
        // Ignore storage errors and continue with in-memory state.
    }
};

const buildDetailModalContent = (summary, details = []) => (
    <div className="space-y-4">
        {summary ? <p className="text-sm leading-6 text-slate-700">{summary}</p> : null}
        {details.length ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="space-y-2">
                    {details.map((detail) => (
                        <div key={detail.label} className="flex items-start gap-2 text-sm">
                            <span className="min-w-[92px] font-semibold text-slate-500">{detail.label}</span>
                            <span className="break-words font-mono text-slate-700">{detail.value}</span>
                        </div>
                    ))}
                </div>
            </div>
        ) : null}
    </div>
);

const formatReportDateTime = (value) => {
    if (!value) return 'N/A';

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'N/A';

    return parsed.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
};

const TrainerSchedule = ({ initialSelectedMonth }) => {
    useRenderCountDebug("TrainerSchedule");
    const { modal, message: messageApi } = AntdApp.useApp();
    const { currentUser } = useAuth();

    const [view, setView] = useState('list'); // 'calendar' or 'list'
    const [selectedMonth, setSelectedMonth] = useState(() => initialSelectedMonth || new Date().toISOString().slice(0, 7));
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentTrainerId, setCurrentTrainerId] = useState(() => resolveEntityId(currentUser));
    const [pendingSchedules, setPendingSchedules] = useState([]);
    const [hasHydratedScheduleSnapshot, setHasHydratedScheduleSnapshot] = useState(false);

    // Attendance submission modal
    const [showCheckInModal, setShowCheckInModal] = useState(false);
    const [showCheckOutModal, setShowCheckOutModal] = useState(false);
    const [selectedSchedule, setSelectedSchedule] = useState(null);
    const [isSubmittingCheckOut, setIsSubmittingCheckOut] = useState(false);

    // Check-In Data
    const [attendanceData, setAttendanceData] = useState({
        checkInTime: '',
        studentsPresent: '',
        studentsAbsent: '',
        attendancePdf: null,
        attendanceExcel: null,
        signature: null,
        checkInImage: null,
        photo: null
    });

    // Check-Out Data
    const [checkOutData, setCheckOutData] = useState({
        checkOutTime: '',
        photos: [],
        activityPhotos: [],
        activityVideos: [],
        latitude: null,
        longitude: null,
        location: null
    });
    const [checkOutImageSlots, setCheckOutImageSlots] = useState(() => createEmptyCheckOutImageSlots());
    const [uploadingCheckOutSlot, setUploadingCheckOutSlot] = useState(null);
    const [uploadingCheckOutPhase, setUploadingCheckOutPhase] = useState('idle');

    
    // Student Attendance States
    const [students, setStudents] = useState([]);
    const [studentAttendance, setStudentAttendance] = useState({}); // { studentId: true/false }
    const [fetchingStudents, setFetchingStudents] = useState(false);
    const studentsCacheRef = useRef(new Map());
    const refreshInFlightRef = useRef(false);
    const lastRefreshAtRef = useRef(0);
    const currentMonthAbortRef = useRef(null);
    const pendingAbortRef = useRef(null);
    const monthScheduleCacheRef = useRef(new Map());
    const monthScheduleInFlightRef = useRef(new Map());
    const activeMonthRequestTokenRef = useRef(0);


    // Location Status
    const [locationStatus, setLocationStatus] = useState({
        detected: false,
        details: null,
        loading: false,
        error: null
    });
    const {
        uploadedGeoImageCount,
        verifiedGeoImageCount,
        checkOutValidationResults,
        allThreeImagesUploaded,
        allThreeImagesVerified,
        derivedCheckOutFinalStatus,
    } = useScheduleHook(checkOutImageSlots);
    const {
        processCollegeStudents,
        processCurrentSchedules,
        processPendingSchedules,
    } = useScheduleProcessor();

    const showToast = useCallback((type, content, duration = 3.5) => {
        messageApi.open({
            type,
            content,
            duration,
            style: { marginTop: 88 },
        });
    }, [messageApi]);

    const showModernDialog = useCallback(({
        variant = 'info',
        title,
        summary,
        details = [],
        okText = 'OK',
    }) => {
        const modalOptions = {
            title,
            centered: true,
            width: 560,
            okText,
            content: buildDetailModalContent(summary, details),
        };

        if (variant === 'error') {
            modal.error(modalOptions);
            return;
        }
        if (variant === 'warning') {
            modal.warning(modalOptions);
            return;
        }
        if (variant === 'success') {
            modal.success(modalOptions);
            return;
        }

        modal.info(modalOptions);
    }, [modal]);

    const requestModernConfirm = useCallback(({
        title,
        summary,
        details = [],
        okText = 'Continue',
        cancelText = 'Cancel',
        okButtonProps = {},
    }) => new Promise((resolve) => {
        modal.confirm({
            title,
            centered: true,
            width: 560,
            okText,
            cancelText,
            okButtonProps,
            content: buildDetailModalContent(summary, details),
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
        });
    }), [modal]);

    const openGeoValidationDetails = useCallback((slot) => {
        const report = slot?.verificationReport;
        if (!report || typeof report !== 'object') return;

        const comparisons = report.comparisons || {};
        const missingItems = getMissingGeoValidationItems(report);
        const capturedMapUrl = buildGoogleMapsSearchUrl(
            slot?.latitude ?? report?.ocr?.latitude ?? report?.exif?.latitude,
            slot?.longitude ?? report?.ocr?.longitude ?? report?.exif?.longitude
        );
        const collegeMapUrl = buildGoogleMapsSearchUrl(
            comparisons.collegeLatitude,
            comparisons.collegeLongitude
        );
        const statusTone = slot?.status === 'verified'
            ? 'border-green-200 bg-green-50 text-green-700'
            : 'border-amber-200 bg-amber-50 text-amber-700';

        modal.info({
            title: `Image ${slot.slotIndex + 1} Validation`,
            centered: true,
            width: 620,
            okText: 'Close',
            content: (
                <div className="space-y-4">
                    <div className={`rounded-2xl border px-4 py-3 ${statusTone}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-bold">
                                {slot?.status === 'verified' ? 'Validation successful' : 'Validation pending'}
                            </p>
                            <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">
                                {formatGeoValidationSourceLabel(slot?.validationSource || report?.source)}
                            </span>
                        </div>
                        <p className="mt-2 text-sm">
                            {slot?.reason || 'Validation details are available for this image.'}
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Assigned Date</p>
                            <p className="mt-1 text-sm font-semibold text-slate-700">{comparisons.assignedDate || 'N/A'}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Detected Date</p>
                            <p className="mt-1 text-sm font-semibold text-slate-700">{comparisons.detectedDate || 'N/A'}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Detected Time</p>
                            <p className="mt-1 text-sm font-semibold text-slate-700">
                                {formatReportDateTime(report?.ocr?.capturedAt || report?.exif?.capturedAt || report?.ocr?.timestamp || report?.exif?.timestamp)}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Distance</p>
                            <p className="mt-1 text-sm font-semibold text-slate-700">{formatDistanceLabel(comparisons.distanceKm ?? slot?.distance)}</p>
                        </div>
                    </div>

                    {missingItems.length > 0 ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Missing Data</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {missingItems.map((item) => (
                                    <span key={item} className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-amber-700">
                                        {item}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                        <a
                            href={capturedMapUrl || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                                capturedMapUrl
                                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                    : 'pointer-events-none border-slate-200 bg-slate-50 text-slate-400'
                            }`}
                        >
                            {capturedMapUrl ? 'Open Captured Location in Maps' : 'Captured location map unavailable'}
                        </a>
                        <a
                            href={collegeMapUrl || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                                collegeMapUrl
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    : 'pointer-events-none border-slate-200 bg-slate-50 text-slate-400'
                            }`}
                        >
                            {collegeMapUrl ? 'Open College Location in Maps' : 'College location map unavailable'}
                        </a>
                    </div>
                </div>
            ),
        });
    }, [modal]);

    const getLiveLocation = useCallback(() =>
        new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject("Geolocation is not supported by your browser");
                return;
            }
            setLocationStatus(prev => ({ ...prev, loading: true, error: null }));
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const details = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy: Math.round(pos.coords.accuracy),
                        timestamp: new Date().toISOString()
                    };
                    setLocationStatus({
                        detected: true,
                        details,
                        loading: false,
                        error: null
                    });
                    resolve(details);
                },
                (err) => {
                    const errorMsg = "Location permission denied. Please enable GPS and allow location access.";
                    setLocationStatus(prev => ({ ...prev, loading: false, error: errorMsg }));
                    reject(errorMsg);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        }), []);
    const isTrainer = String(currentUser?.role || '').trim().toLowerCase() === 'trainer';
    const authTrainerId = isTrainer ? (currentUser?.trainerProfileId || currentUser?.id || resolveEntityId(currentUser)) : null;

    useEffect(() => {
        if (authTrainerId && authTrainerId !== currentTrainerId) {
            setCurrentTrainerId(authTrainerId);
        }
    }, [authTrainerId, currentTrainerId]);

    useEffect(() => {
        if (!initialSelectedMonth) {
            return;
        }

        setSelectedMonth((currentMonth) =>
            currentMonth === initialSelectedMonth ? currentMonth : initialSelectedMonth
        );
    }, [initialSelectedMonth]);

    // Load trainer ID only when auth state does not already have it.
    useEffect(() => {
        if (authTrainerId) {
            return undefined;
        }

        const fetchProfile = async () => {
            try {
                const response = await getTrainerProfile();
                const nextTrainerId = resolveEntityId(response?.data);
                if (nextTrainerId) {
                    setCurrentTrainerId(nextTrainerId);
                }
            } catch (err) {
                console.error('Error loading trainer profile:', err);
                setError('Failed to load trainer profile');
                setLoading(false);
            }
        };

        fetchProfile();
        return undefined;
    }, [authTrainerId]);

    useEffect(() => {
        if (!currentTrainerId) {
            setHasHydratedScheduleSnapshot(false);
            return;
        }

        const monthSnapshot = readSnapshotFromSessionStorage(
            buildMonthSnapshotStorageKey(currentTrainerId, selectedMonth),
        );
        const pendingSnapshot = readSnapshotFromSessionStorage(
            buildPendingSnapshotStorageKey(currentTrainerId),
        );

        const hasMonthSnapshot = Array.isArray(monthSnapshot);
        const hasPendingSnapshot = Array.isArray(pendingSnapshot);
        const hasSnapshotData = hasMonthSnapshot || hasPendingSnapshot;

        if (hasMonthSnapshot) {
            setSchedules(monthSnapshot);
        }
        if (hasPendingSnapshot) {
            setPendingSchedules(pendingSnapshot);
        }
        if (hasSnapshotData) {
            setError(null);
            setLoading(false);
        }

        setHasHydratedScheduleSnapshot(hasSnapshotData);
    }, [currentTrainerId, selectedMonth]);

    const loadCurrentMonthSchedule = useCallback(async ({ force = false } = {}) => {
        if (!currentTrainerId) return;
        const monthKey = `${currentTrainerId}:${selectedMonth}`;
        const cachedMonthSchedules = monthScheduleCacheRef.current.get(monthKey);
        if (!force && cachedMonthSchedules) {
            setSchedules(cachedMonthSchedules);
            return;
        }

        if (!force && monthScheduleInFlightRef.current.has(monthKey)) {
            try {
                await monthScheduleInFlightRef.current.get(monthKey);
            } catch {
                // Shared request owner already handles state updates and abort errors.
            }
            return;
        }

        const requestToken = Date.now() + Math.random();
        activeMonthRequestTokenRef.current = requestToken;
        try {
            setLoading(true);
            setError(null);

            const [year, month] = selectedMonth.split('-').map(Number);
            if (currentMonthAbortRef.current) {
                currentMonthAbortRef.current.abort();
            }
            currentMonthAbortRef.current = new AbortController();
            const loadPromise = scheduleService.getTrainerSchedule(
                currentTrainerId,
                { month, year },
                { signal: currentMonthAbortRef.current.signal },
            );
            monthScheduleInFlightRef.current.set(monthKey, loadPromise);
            const response = await loadPromise;
            const processedSchedules = await processCurrentSchedules(response.data || [], currentTrainerId);
            if (activeMonthRequestTokenRef.current !== requestToken) {
                return;
            }
            setMonthScheduleCacheValue(
                monthScheduleCacheRef.current,
                monthKey,
                processedSchedules,
            );
            setSchedules(processedSchedules);
            writeSnapshotToSessionStorage(
                buildMonthSnapshotStorageKey(currentTrainerId, selectedMonth),
                processedSchedules,
            );
        } catch (err) {
            if (isScheduleProcessorCancellationError(err)) {
                return;
            }
            console.error('Error loading schedule:', err);
            setError('Failed to load schedule');
        } finally {
            monthScheduleInFlightRef.current.delete(monthKey);
            setLoading(false);
        }
    }, [currentTrainerId, processCurrentSchedules, selectedMonth]);

    const loadPendingSchedules = useCallback(async () => {
        if (!currentTrainerId) return;

        try {
            if (pendingAbortRef.current) {
                pendingAbortRef.current.abort();
            }
            pendingAbortRef.current = new AbortController();
            const response = await scheduleService.getTrainerSchedule(
                currentTrainerId,
                {},
                { signal: pendingAbortRef.current.signal },
            );
            const pending = await processPendingSchedules(response.data || [], currentTrainerId);
            setPendingSchedules(pending);
            writeSnapshotToSessionStorage(
                buildPendingSnapshotStorageKey(currentTrainerId),
                pending,
            );
        } catch (err) {
            if (isScheduleProcessorCancellationError(err)) {
                return;
            }
            console.error('Error loading pending schedules:', err);
        }
    }, [currentTrainerId, processPendingSchedules]);

    useEffect(() => () => {
        currentMonthAbortRef.current?.abort();
        pendingAbortRef.current?.abort();
    }, []);

    const refreshScheduleData = useCallback(async (options = {}) => {
        const { includePending = true, force = false } = options;
        const now = Date.now();

        if (!force && refreshInFlightRef.current) {
            return;
        }

        if (!force && now - Number(lastRefreshAtRef.current || 0) < MIN_SCHEDULE_REFRESH_GAP_MS) {
            return;
        }

        refreshInFlightRef.current = true;
        lastRefreshAtRef.current = now;
        const tasks = [loadCurrentMonthSchedule({ force })];
        if (includePending) {
            tasks.push(loadPendingSchedules());
        }
        try {
            await Promise.all(tasks);
        } finally {
            refreshInFlightRef.current = false;
            lastRefreshAtRef.current = Date.now();
        }
    }, [loadCurrentMonthSchedule, loadPendingSchedules]);

    const resolveLatestScheduleSnapshot = useCallback((scheduleId) => {
        const normalizedScheduleId = resolveEntityId(scheduleId);
        if (!normalizedScheduleId) return null;

        return (
            schedules.find((schedule) => resolveEntityId(schedule.id) === normalizedScheduleId)
            || pendingSchedules.find((schedule) => resolveEntityId(schedule.id) === normalizedScheduleId)
            || null
        );
    }, [pendingSchedules, schedules]);

    const getLatestServerScheduleSnapshot = useCallback(async (scheduleId) => {
        const normalizedScheduleId = resolveEntityId(scheduleId);
        if (!currentTrainerId || !normalizedScheduleId) return null;

        try {
            const response = await scheduleService.getTrainerSchedule(currentTrainerId);
            const processed = await processCurrentSchedules(response.data || [], currentTrainerId);
            return (
                processed.find(
                    (schedule) => resolveEntityId(schedule.id) === normalizedScheduleId,
                ) || null
            );
        } catch (err) {
            if (isScheduleProcessorCancellationError(err)) {
                return null;
            }
            console.error("Error revalidating actionable schedule:", err);
            return null;
        }
    }, [currentTrainerId, processCurrentSchedules]);

    const guardActionableSchedule = useCallback(async (scheduleCandidate) => {
        const scheduleId = resolveEntityId(scheduleCandidate?.id || scheduleCandidate?._id);
        const latestSchedule = resolveLatestScheduleSnapshot(scheduleId) || scheduleCandidate || null;

        if (!latestSchedule) {
            showToast('warning', 'This schedule is no longer available. Refreshing now...');
            await refreshScheduleData({ force: true });
            return null;
        }

        if (!isScheduleActionableForTrainerWorkflow(latestSchedule)) {
            showToast('warning', 'This schedule is no longer actionable. Refreshing now...');
            await refreshScheduleData({ force: true });
            return null;
        }

        const latestServerSnapshot = await getLatestServerScheduleSnapshot(scheduleId);
        if (!latestServerSnapshot) {
            showToast('warning', 'This schedule is no longer available. Refreshing now...');
            await refreshScheduleData({ force: true });
            return null;
        }

        if (!isScheduleActionableForTrainerWorkflow(latestServerSnapshot)) {
            showToast('warning', 'This schedule is no longer actionable. Refreshing now...');
            await refreshScheduleData({ force: true });
            return null;
        }

        return latestServerSnapshot;
    }, [getLatestServerScheduleSnapshot, refreshScheduleData, resolveLatestScheduleSnapshot, showToast]);

    useEffect(() => {
        if (currentTrainerId) {
            loadCurrentMonthSchedule();
        }
    }, [currentTrainerId, loadCurrentMonthSchedule]);

    useEffect(() => {
        if (!currentTrainerId) return undefined;
        const cancelPendingLoad = runWhenIdle(() => {
            loadPendingSchedules();
        });
        return cancelPendingLoad;
    }, [currentTrainerId, loadPendingSchedules]);

    useEffect(() => {
        if (!currentTrainerId) return undefined;

        const refreshOnFocus = () => {
            if (document.visibilityState === 'visible') {
                refreshScheduleData({ force: true });
            }
        };

        const intervalHandle = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                refreshScheduleData();
            }
        }, 60_000);

        window.addEventListener('focus', refreshOnFocus);
        document.addEventListener('visibilitychange', refreshOnFocus);

        return () => {
            window.removeEventListener('focus', refreshOnFocus);
            document.removeEventListener('visibilitychange', refreshOnFocus);
            window.clearInterval(intervalHandle);
        };
    }, [currentTrainerId, refreshScheduleData]);


    const handleDelete = useCallback(async (scheduleId) => {
        const shouldDelete = await requestModernConfirm({
            title: 'Delete Schedule',
            summary: 'This will remove the selected schedule from your trainer view.',
            details: [
                { label: 'Action', value: 'Delete this schedule' },
                { label: 'Result', value: 'This change cannot be undone from this screen.' },
            ],
            okText: 'Delete',
            cancelText: 'Keep',
            okButtonProps: { danger: true },
        });
        if (!shouldDelete) return;

        try {
            await scheduleService.deleteSchedule(scheduleId);
            // Remove from local state immediately for UI feedback
            setSchedules(prev => prev.filter(s => s.id !== scheduleId));
            // Trigger reload to ensure sync
            refreshScheduleData({ force: true });
            showToast('success', 'Schedule deleted successfully.');
        } catch (err) {
            console.error('Error deleting schedule:', err);
            showToast('error', 'Failed to delete schedule.');
        }
    }, [refreshScheduleData, requestModernConfirm, showToast]);

    const openCheckInModal = useCallback(async (schedule) => {
        const actionableSchedule = await guardActionableSchedule(schedule);
        if (!actionableSchedule) {
            return;
        }

        setSelectedSchedule(actionableSchedule);
        setShowCheckInModal(true);
        setAttendanceData({
            checkInTime: new Date().toTimeString().slice(0, 5),
            studentsPresent: '',
            studentsAbsent: '',
            attendancePdf: null,
            attendanceExcel: null,
            signature: null,
            checkInImage: null,
            latitude: null,
            longitude: null,
            syllabus: actionableSchedule.subject || '' // Pre-fill with existing subject if available
        });
        setStudents([]);
        setStudentAttendance({});
        setLocationStatus({
            detected: false,
            details: null,
            loading: false,
            error: null,
        });
    }, [guardActionableSchedule]);

    const closeCheckInModal = useCallback(() => {
        setShowCheckInModal(false);
    }, []);

    const fetchStudentsForCollege = useCallback(async (collegeId) => {
        const normalizedCollegeId = String(collegeId || '').trim();
        if (!normalizedCollegeId) {
            setStudents([]);
            setStudentAttendance({});
            return;
        }

        const cachedStudents = studentsCacheRef.current.get(normalizedCollegeId);
        if (cachedStudents) {
            setStudents(cachedStudents.students);
            setStudentAttendance(cachedStudents.attendance);
            setAttendanceData(prev => ({
                ...prev,
                studentsPresent: cachedStudents.counts.present,
                studentsAbsent: cachedStudents.counts.absent,
            }));
            return;
        }

        try {
            setFetchingStudents(true);
            const res = await api.get(`/students/college/${normalizedCollegeId}`);
            if (res.success) {
                const preparedStudents = await processCollegeStudents(res.data || []);
                studentsCacheRef.current.set(normalizedCollegeId, preparedStudents);

                setStudents(preparedStudents.students);
                setStudentAttendance(preparedStudents.attendance);
                setAttendanceData(prev => ({
                    ...prev,
                    studentsPresent: preparedStudents.counts.present,
                    studentsAbsent: preparedStudents.counts.absent,
                }));
            }
        } catch (err) {
            if (isScheduleProcessorCancellationError(err)) {
                return;
            }
            console.error('Error fetching students:', err);
        } finally {
            setFetchingStudents(false);
        }
    }, [processCollegeStudents]);

    const handleStudentCheck = useCallback((studentId) => {
        setStudentAttendance(prev => {
            const nextStudentPresence = !prev[studentId];
            const newState = { ...prev, [studentId]: nextStudentPresence };

            setAttendanceData(prevData => {
                const currentPresent = Number(prevData.studentsPresent) || 0;
                const nextPresent = nextStudentPresence
                    ? currentPresent + 1
                    : Math.max(0, currentPresent - 1);

                return {
                    ...prevData,
                    studentsPresent: nextPresent,
                    studentsAbsent: Math.max(0, students.length - nextPresent),
                };
            });

            return newState;
        });
    }, [students.length]);

    const handleCheckInSubmit = async () => {
        if (!currentTrainerId) {
            showToast('error', 'Trainer ID is missing. Please reload the page.');
            return;
        }
        if (!selectedSchedule?.id) {
            showToast('error', 'Schedule ID is missing.');
            return;
        }

        const actionableSchedule = await guardActionableSchedule(selectedSchedule);
        if (!actionableSchedule) {
            return;
        }

        if (!attendanceData.attendancePdf && !attendanceData.attendanceExcel && !attendanceData.signature && !attendanceData.checkInImage) {
            showToast('warning', 'Attach attendance evidence (PDF, Excel, signature, or check-in image) before check-in so the Attendance folder is not left empty.');
            return;
        }

        if (!locationStatus.detected) {
            // alert('Please enable location and be inside college campus.');
            // return;
            console.warn("Location not detected, proceeding anyway as per user request");
        }

        try {
            const formData = new FormData();
            const checkInTrainerId = resolveEntityId(actionableSchedule.trainerId);
            const checkInCollegeId = resolveEntityId(actionableSchedule.collegeId);
            const checkInDayNumber = Number(actionableSchedule.dayNumber);

            if (!checkInTrainerId || !checkInCollegeId || !Number.isFinite(checkInDayNumber) || checkInDayNumber <= 0) {
                showToast('warning', 'This schedule is stale or no longer assigned. Refreshing schedule...');
                await refreshScheduleData({ force: true });
                return;
            }

            formData.append('scheduleId', actionableSchedule.id);
            if (checkInTrainerId) formData.append('trainerId', checkInTrainerId);
            if (checkInCollegeId) formData.append('collegeId', checkInCollegeId);
            const checkInCourseId = resolveEntityId(actionableSchedule.courseId);
            if (checkInCourseId) formData.append('courseId', checkInCourseId);
            formData.append('dayNumber', actionableSchedule.dayNumber);
            formData.append('checkInTime', attendanceData.checkInTime);
            formData.append('studentsPresent', attendanceData.studentsPresent);
            formData.append('studentsAbsent', attendanceData.studentsAbsent);
            if (attendanceData.syllabus) formData.append('syllabus', attendanceData.syllabus);
            
            // Add High Accuracy Location
            if (locationStatus.details) {
                formData.append('checkInLocation', JSON.stringify(locationStatus.details));
                formData.append('latitude', locationStatus.details.lat);
                formData.append('longitude', locationStatus.details.lng);
            }

            // Detailed Student List
            if (students.length > 0) {
                const studentList = students.map(s => ({
                    studentId: s._id,
                    rollNo: s.rollNo,
                    registerNo: s.registerNo,
                    name: s.name,
                    status: studentAttendance[s._id] ? 'Present' : 'Absent'
                }));
                formData.append('studentList', JSON.stringify(studentList));
            }

            if (attendanceData.latitude) formData.append('latitude', attendanceData.latitude);
            if (attendanceData.longitude) formData.append('longitude', attendanceData.longitude);

            if (attendanceData.attendancePdf) {
                formData.append('attendancePdf', attendanceData.attendancePdf);
            }
            if (attendanceData.attendanceExcel) {
                formData.append('attendanceExcel', attendanceData.attendanceExcel);
            }
            if (attendanceData.signature) {
                formData.append('signature', attendanceData.signature);
            }
            if (attendanceData.checkInImage) {
                formData.append('check_in_image', attendanceData.checkInImage);
            }

            const response = await api.post('/attendance/check-in', formData);

            if (response?.driveSync?.error && response.driveSync.queued !== true) {
                showModernDialog({
                    variant: 'warning',
                    title: 'Check-In Saved, Drive Sync Failed',
                    summary: 'The attendance was saved, but the Google Drive upload did not complete.',
                    details: [
                        { label: 'Reason', value: response.driveSync.error || 'Unknown Drive sync error' },
                    ],
                    okText: 'Understood',
                });
                return;
            }

            showToast(
                'success',
                response?.driveSync?.queued
                    ? 'Check-in successful. Google Drive sync is running in the background.'
                    : 'Check-in successful.',
            );
            setShowCheckInModal(false);
            refreshScheduleData({ force: true }); // Reload to show updated status
        } catch (error) {
            console.error('Error submitting check-in:', error);
            
            // Extract request details for debugging
            const requestDetails = {
                url: '/attendance/check-in',
                hasPdf: !!attendanceData.attendancePdf,
                pdfSize: attendanceData.attendancePdf ? Math.round(attendanceData.attendancePdf.size / 1024) + ' KB' : 'N/A',
                studentCount: students.length,
                locationDetected: locationStatus.detected,
                accuracy: locationStatus.details?.accuracy
            };

            const errorMsg = error.response?.message || error.message || "Unknown error";
            const backendDetail = error.response?.error || null;
            const errorStage = error.response?.stage || null;

            showModernDialog({
                variant: 'error',
                title: 'Check-In Failed',
                summary: errorMsg,
                details: [
                    { label: 'URL', value: requestDetails.url },
                    { label: 'Stage', value: errorStage || 'N/A' },
                    { label: 'Detail', value: backendDetail || 'N/A' },
                    { label: 'Status', value: String(error.status || 'Network/Fetch') },
                    { label: 'PDF Size', value: requestDetails.pdfSize },
                    { label: 'Students', value: String(requestDetails.studentCount) },
                    { label: 'Accuracy', value: String(requestDetails.accuracy || 'N/A') },
                    { label: 'Network', value: navigator.onLine ? 'Online' : 'Offline' },
                ],
                okText: 'Close',
            });
        }
    };
    const openCheckOutModal = useCallback(async (schedule) => {
        const actionableSchedule = await guardActionableSchedule(schedule);
        if (!actionableSchedule) {
            return;
        }

        if (normalizeStatus(actionableSchedule?.attendanceStatus) !== 'approved') {
            showToast('warning', 'Check-out is available only after SPOC approves check-in.');
            return;
        }
        checkOutImageSlots.forEach((slot) => revokeBlobPreview(slot.previewUrl));
        setSelectedSchedule(actionableSchedule);
        setShowCheckOutModal(true);
        setCheckOutData({
            checkOutTime: new Date().toTimeString().slice(0, 5),
            photos: [],
            activityPhotos: [],
            activityVideos: [],
            latitude: null,
            longitude: null,
            location: null
        });
        setCheckOutImageSlots(buildCheckOutImageSlots(actionableSchedule));
        setUploadingCheckOutSlot(null);
        setUploadingCheckOutPhase('idle');
        setLocationStatus({
            detected: false,
            details: null,
            loading: false,
            error: null,
        });
    }, [checkOutImageSlots, guardActionableSchedule, showToast]);

    const closeCheckOutModal = useCallback(() => {
        checkOutImageSlots.forEach((slot) => revokeBlobPreview(slot.previewUrl));
        setUploadingCheckOutSlot(null);
        setUploadingCheckOutPhase('idle');
        setShowCheckOutModal(false);
    }, [checkOutImageSlots]);

    const handleGeoImageUpload = async (slotIndex, file) => {
        if (!selectedSchedule || !file) {
            return;
        }

        const actionableSchedule = await guardActionableSchedule(selectedSchedule);
        if (!actionableSchedule) {
            return;
        }

        const activeSlot = checkOutImageSlots[slotIndex];
        if (activeSlot?.locked || activeSlot?.status === 'verified') {
            showToast('warning', `Image ${slotIndex + 1} is already verified and cannot be replaced.`);
            return;
        }

        if (slotIndex < 0 || slotIndex >= CHECK_OUT_IMAGE_SLOT_COUNT) {
            showToast('warning', 'Only 3 GeoTag image slots are allowed.');
            return;
        }

        const assignedDate = actionableSchedule.assignedDate || getAssignedDateKey(actionableSchedule.rawDate);
        const targetScheduleId = actionableSchedule.id;
        if (!assignedDate) {
            showToast('error', 'Assigned date is unavailable for this training day.');
            return;
        }

        const sourceDimensions = await readImageDimensions(file).catch(() => null);
        const sourcePixels = Number(sourceDimensions?.pixels || 0);
        const sourceMegaPixels = sourcePixels > 0 ? (sourcePixels / 1_000_000) : null;
        const sizeState = getGeoUploadSizeState(file.size);
        const EXIF_CHECK_ENABLED = true;
        const { detectExifGps } = await import('@/utils/exifUtils');
        const originalExif = EXIF_CHECK_ENABLED ? await detectExifGps(file) : null;

        if (sizeState === 'too_large_absolute') {
            showModernDialog({
                variant: 'error',
                title: 'Image Too Large',
                summary: `This file is too large to process safely. Please use an image under ${formatUploadBytes(GEO_UPLOAD_ABSOLUTE_MAX_BYTES)}.`,
                details: [
                    { label: 'Selected', value: formatUploadBytes(file.size) },
                    ...(Number.isFinite(sourceMegaPixels) ? [{ label: 'Resolution', value: `${sourceMegaPixels.toFixed(2)} MP` }] : []),
                ],
                okText: 'Close',
            });
            return;
        }

        if (sizeState === 'too_small_soft') {
            showToast(
                'warning',
                `Image is smaller than ${formatUploadBytes(GEO_UPLOAD_SOFT_MIN_BYTES)}. Upload will continue, but a clearer image is recommended.`,
                5,
            );
        }

        let uploadFile = file;
        let compressionApplied = false;
        if (shouldAutoCompressGeoImage({ size: file.size, pixels: sourcePixels })) {
            setUploadingCheckOutSlot(slotIndex);
            setUploadingCheckOutPhase('compressing');
            const preserveExifPreferred = Boolean(
                isJpegLikeFile(file)
                && originalExif?.isJpeg
                && (originalExif?.hasGps || originalExif?.hasDate)
            );
            try {
                uploadFile = await optimizeGeoImageForUpload(file, sourceDimensions, {
                    preserveExifPreferred,
                });
                compressionApplied = true;
            } catch (compressionError) {
                if (file.size <= GEO_UPLOAD_HARD_MAX_BYTES) {
                    uploadFile = file;
                    compressionApplied = false;
                    showToast(
                        'warning',
                        `Auto-compression failed. Continuing with original image (${formatUploadBytes(file.size)}) to preserve upload reliability.`,
                        5,
                    );
                } else {
                    showModernDialog({
                        variant: 'error',
                        title: 'Image Optimization Failed',
                        summary: 'Auto-compression could not prepare this image safely. Please recapture with your camera and try again.',
                        details: [
                            { label: 'Selected', value: formatUploadBytes(file.size) },
                            ...(Number.isFinite(sourceMegaPixels) ? [{ label: 'Resolution', value: `${sourceMegaPixels.toFixed(2)} MP` }] : []),
                            { label: 'Target', value: `${formatUploadBytes(GEO_UPLOAD_TARGET_MAX_BYTES)} and ${GEO_UPLOAD_MAX_MEGAPIXELS} MP` },
                        ],
                        okText: 'Close',
                    });
                    setUploadingCheckOutSlot(null);
                    setUploadingCheckOutPhase('idle');
                    return;
                }
            }

            if (uploadFile.size > GEO_UPLOAD_TARGET_MAX_BYTES) {
                if (uploadFile.size > GEO_UPLOAD_HARD_MAX_BYTES) {
                    showModernDialog({
                        variant: 'warning',
                        title: 'Image Still Too Large',
                        summary: `Please upload a smaller image. Target upload size is ${formatUploadBytes(GEO_UPLOAD_TARGET_MAX_BYTES)} and hard limit is ${formatUploadBytes(GEO_UPLOAD_HARD_MAX_BYTES)}.`,
                        details: [
                            { label: 'Optimized Size', value: formatUploadBytes(uploadFile.size) },
                            { label: 'Target', value: formatUploadBytes(GEO_UPLOAD_TARGET_MAX_BYTES) },
                            { label: 'Hard Limit', value: formatUploadBytes(GEO_UPLOAD_HARD_MAX_BYTES) },
                        ],
                        okText: 'Understood',
                    });
                    setUploadingCheckOutSlot(null);
                    setUploadingCheckOutPhase('idle');
                    return;
                }

                const proceedWithHighQualityUpload = await requestModernConfirm({
                    title: 'Image Above Target Size',
                    summary: 'Auto-compression reduced the file but could not reach the 3 MB target safely. You can continue with this optimized image.',
                    details: [
                        { label: 'Optimized Size', value: formatUploadBytes(uploadFile.size) },
                        { label: 'Target', value: formatUploadBytes(GEO_UPLOAD_TARGET_MAX_BYTES) },
                        { label: 'Hard Limit', value: formatUploadBytes(GEO_UPLOAD_HARD_MAX_BYTES) },
                    ],
                    okText: 'Continue Upload',
                    cancelText: 'Choose Another Image',
                });
                if (!proceedWithHighQualityUpload) {
                    setUploadingCheckOutSlot(null);
                    setUploadingCheckOutPhase('idle');
                    return;
                }
            }

            const compressedExif = EXIF_CHECK_ENABLED ? await detectExifGps(uploadFile) : null;
            const originalHadRequiredExif = Boolean(originalExif?.isJpeg && originalExif?.hasGps && originalExif?.hasDate);
            const compressedMissingRequiredExif = Boolean(compressedExif?.isJpeg && (!compressedExif?.hasGps || !compressedExif?.hasDate));

            if (originalHadRequiredExif && compressedMissingRequiredExif) {
                if (file.size <= GEO_UPLOAD_HARD_MAX_BYTES) {
                    const keepOriginal = await requestModernConfirm({
                        title: 'Metadata Preservation Check',
                        summary: 'Compression reduced EXIF GPS/date metadata. To keep geo verification integrity, you can upload the original image instead.',
                        details: [
                            { label: 'Original', value: `${formatUploadBytes(file.size)} (EXIF GPS/date detected)` },
                            { label: 'Compressed', value: `${formatUploadBytes(uploadFile.size)} (metadata reduced)` },
                            { label: 'Result', value: 'Original upload keeps verification metadata.' },
                        ],
                        okText: 'Use Original',
                        cancelText: 'Use Compressed',
                    });

                    if (keepOriginal) {
                        uploadFile = file;
                        compressionApplied = false;
                    }
                } else {
                    showModernDialog({
                        variant: 'error',
                        title: 'Metadata Preservation Failed',
                        summary: 'Compression removed required EXIF GPS/date metadata and the original file exceeds allowed upload size.',
                        details: [
                            { label: 'Original', value: formatUploadBytes(file.size) },
                            { label: 'Upload Limit', value: formatUploadBytes(GEO_UPLOAD_HARD_MAX_BYTES) },
                        ],
                        okText: 'Close',
                    });
                    setUploadingCheckOutSlot(null);
                    setUploadingCheckOutPhase('idle');
                    return;
                }
            }

            if (compressionApplied) {
                showToast(
                    'info',
                    `Image compressed: ${formatUploadBytes(file.size)} -> ${formatUploadBytes(uploadFile.size)}.`,
                    4,
                );
            }
        }

        if (EXIF_CHECK_ENABLED) {
            const exifResult = uploadFile === file ? originalExif : await detectExifGps(uploadFile);
            if (exifResult?.isJpeg && (!exifResult?.hasGps || !exifResult?.hasDate)) {
                const missingParts = [
                    !exifResult?.hasGps ? 'GPS tags' : null,
                    !exifResult?.hasDate ? 'date/time tags' : null,
                ].filter(Boolean).join(' + ');

                const shouldContinueWithoutExif = await requestModernConfirm({
                    title: 'GPS Metadata Missing',
                    summary: 'The selected image is missing required EXIF metadata. Auto verification may fail, but manual review will still be available.',
                    details: [
                        { label: 'File', value: uploadFile.name || file.name },
                        { label: 'Missing', value: missingParts || 'EXIF metadata' },
                        { label: 'Recommendation', value: 'Capture directly with camera app and GPS ON for auto verification.' },
                    ],
                    okText: 'Continue Upload',
                    cancelText: 'Use Camera Instead',
                });
                if (!shouldContinueWithoutExif) {
                    setUploadingCheckOutSlot(null);
                    setUploadingCheckOutPhase('idle');
                    return;
                }
            }
        }

        try {
            setUploadingCheckOutSlot(slotIndex);
            setUploadingCheckOutPhase('uploading');
            showToast('info', 'Upload ready. Sending for verification...', 2.5);
            const formData = new FormData();
            const uploadTrainerId = resolveEntityId(actionableSchedule.trainerId);
            const uploadCollegeId = resolveEntityId(actionableSchedule.collegeId);
            if (!uploadTrainerId || !uploadCollegeId) {
                showToast('warning', 'Schedule assignment details are missing. Refreshing...');
                await refreshScheduleData({ force: true });
                return;
            }

            formData.append('trainerId', uploadTrainerId);
            formData.append('collegeId', uploadCollegeId);

            const uploadScheduleId = actionableSchedule?.id || actionableSchedule?._id;
            if (uploadScheduleId) {
                formData.append('scheduleId', uploadScheduleId);
            }

            formData.append('assignedDate', assignedDate);
            formData.append('index', String(slotIndex));
            formData.append('image', uploadFile);

            const response = await api.post('/upload-image', formData);
            const nextPreviewUrl = URL.createObjectURL(file);
            const normalizedStatus = normalizeImageSlotStatus(response?.data?.status);

            setCheckOutImageSlots((previousSlots) =>
                previousSlots.map((slot, index) => {
                    if (index !== slotIndex) {
                        return slot;
                    }

                    revokeBlobPreview(slot.previewUrl);
                    return createCheckOutImageSlot(index, {
                        uploaded: true,
                        file: uploadFile,
                        previewUrl: nextPreviewUrl,
                        persistedUrl: response?.checkOut?.photos?.[slotIndex]?.url || slot.persistedUrl,
                        imageName: response?.data?.image || uploadFile.name,
                        status: normalizedStatus,
                        reason: normalizedStatus === 'pending' ? (response?.message || null) : null,
                        distance: response?.data?.distance ?? null,
                        latitude: response?.data?.latitude ?? null,
                        longitude: response?.data?.longitude ?? null,
                        validationSource:
                            response?.report?.source
                            || response?.checkOut?.photos?.[slotIndex]?.validationSource
                            || null,
                        verificationReport:
                            response?.report
                            || response?.checkOut?.photos?.[slotIndex]?.verificationReport
                            || null,
                        locked: normalizedStatus === 'verified',
                    });
                })
            );

            setSelectedSchedule((previous) =>
                previous
                    ? mergeUploadedGeoStateIntoSchedule(previous, {
                        assignedDate: response?.assignedDate ?? assignedDate,
                        images: response?.images,
                        finalStatus: response?.finalStatus,
                        geoVerificationStatus: response?.geoVerificationStatus,
                        geoValidationComment: response?.geoValidationComment,
                        checkOut: response?.checkOut,
                    })
                    : previous
            );
            setSchedules((previousSchedules) =>
                previousSchedules.map((schedule) =>
                    schedule.id === targetScheduleId
                        ? mergeUploadedGeoStateIntoSchedule(schedule, {
                            assignedDate: response?.assignedDate ?? assignedDate,
                            images: response?.images,
                            finalStatus: response?.finalStatus,
                            geoVerificationStatus: response?.geoVerificationStatus,
                            geoValidationComment: response?.geoValidationComment,
                            checkOut: response?.checkOut,
                        })
                        : schedule
                )
            );
            setPendingSchedules((previousSchedules) =>
                previousSchedules
                    .map((schedule) =>
                        schedule.id === targetScheduleId
                            ? mergeUploadedGeoStateIntoSchedule(schedule, {
                                assignedDate: response?.assignedDate ?? assignedDate,
                                images: response?.images,
                                finalStatus: response?.finalStatus,
                                geoVerificationStatus: response?.geoVerificationStatus,
                                geoValidationComment: response?.geoValidationComment,
                                checkOut: response?.checkOut,
                            })
                            : schedule
                    )
                    .filter((schedule) => !(normalizeStatus(schedule.attendanceStatus) === 'approved' && normalizeStatus(schedule.geoVerificationStatus) === 'approved'))
            );

            if (normalizeStatus(response?.geoVerificationStatus) === 'approved') {
                refreshScheduleData({ force: true });
            }

            const toastMessage = normalizedStatus === 'verified'
                ? `Image ${slotIndex + 1} verified successfully.`
                : `Image ${slotIndex + 1} is pending: ${response?.message || 'Validation failed.'}`;
            showToast(normalizedStatus === 'verified' ? 'success' : 'warning', toastMessage, 4.5);
        } catch (uploadError) {
            console.error('Error uploading GeoTag image:', uploadError);
            showModernDialog({
                variant: 'error',
                title: 'GeoTag Upload Failed',
                summary: getFriendlyGeoUploadError(uploadError),
                okText: 'Close',
            });
        } finally {
            setUploadingCheckOutSlot(null);
            setUploadingCheckOutPhase('idle');
        }
    };

    const handleCheckOutSubmit = async () => {
        if (isSubmittingCheckOut) {
            return;
        }
        const actionableSchedule = await guardActionableSchedule(selectedSchedule);
        if (!actionableSchedule) {
            return;
        }
        if (!allThreeImagesUploaded) {
            showToast('warning', 'Upload all 3 GeoTag images before submitting check-out.');
            return;
        }

        if (!allThreeImagesVerified) {
            const shouldContinue = await requestModernConfirm({
                title: 'Submit With Pending Verification?',
                summary: 'One or more GeoTag images are still pending, so the final status will stay PENDING after submission.',
                details: [
                    { label: 'Geo Images', value: `${uploadedGeoImageCount} uploaded / ${verifiedGeoImageCount} verified` },
                    { label: 'Result', value: 'Check-out will submit, but verification will remain pending.' },
                ],
                okText: 'Submit Anyway',
                cancelText: 'Review Images',
            });
            if (!shouldContinue) {
                return;
            }
        }

        try {
            setIsSubmittingCheckOut(true);
            const formData = new FormData();
            formData.append('scheduleId', actionableSchedule.id);
            const checkoutTrainerId = resolveEntityId(actionableSchedule.trainerId);
            const checkoutCollegeId = resolveEntityId(actionableSchedule.collegeId);
            const checkoutDayNumber = Number(actionableSchedule.dayNumber);
            if (!checkoutTrainerId || !checkoutCollegeId || !Number.isFinite(checkoutDayNumber) || checkoutDayNumber <= 0) {
                showToast('warning', 'This schedule is stale or no longer assigned. Refreshing schedule...');
                await refreshScheduleData({ force: true });
                return;
            }
            formData.append('trainerId', checkoutTrainerId);
            formData.append('collegeId', checkoutCollegeId);
            formData.append('dayNumber', checkoutDayNumber);
            
            // New standardized payload
            if (locationStatus.details) {
                 formData.append('lat', locationStatus.details.lat);
                 formData.append('lng', locationStatus.details.lng);
                 formData.append('accuracy', locationStatus.details.accuracy);
            }

            // Optional Activity Media
            Array.from(checkOutData.activityPhotos).forEach(file => {
                formData.append('activityPhotos', file);
            });
            Array.from(checkOutData.activityVideos).forEach(file => {
                formData.append('activityVideos', file);
            });
            
            // Additional context for backend
            formData.append('checkOutTime', checkOutData.checkOutTime);
            if (locationStatus.details) {
                formData.append('checkOutLocation', JSON.stringify(locationStatus.details));
            }

            const response = await api.post('/attendance/check-out', formData);

            if (response?.driveSync?.error && response.driveSync.queued !== true) {
                showModernDialog({
                    variant: 'warning',
                    title: 'Check-Out Saved, Drive Sync Failed',
                    summary: 'The check-out was saved, but the Google Drive upload did not complete.',
                    details: [
                        { label: 'Reason', value: response.driveSync.error || 'Unknown Drive sync error' },
                    ],
                    okText: 'Understood',
                });
            }

            const autoValidation = response?.autoValidation || null;
            const imageResults = Array.isArray(autoValidation?.imageGeoTags) ? autoValidation.imageGeoTags : [];
            setCheckOutImageSlots(buildCheckOutImageSlots(response?.data || selectedSchedule));
            setSelectedSchedule((previous) =>
                previous
                    ? mergeUploadedGeoStateIntoSchedule(previous, {
                        assignedDate: response?.data?.assignedDate,
                        images: response?.data?.images,
                        finalStatus: response?.data?.finalStatus,
                        attendanceStatus: response?.data?.verificationStatus,
                        geoVerificationStatus: response?.data?.geoVerificationStatus,
                        geoValidationComment: response?.data?.geoValidationComment,
                        checkOut: response?.data?.checkOut,
                    })
                    : previous
            );
            if (autoValidation?.status === 'pending') {
                showModernDialog({
                    variant: 'warning',
                    title: 'Check-Out Submitted With Pending Verification',
                    summary: 'At least one of the 3 GeoTag images did not verify, so the final status remains PENDING.',
                    details: imageResults.map((item) => ({
                        label: `Image ${item.imageIndex}`,
                        value: `${String(item.status || 'pending').toUpperCase()}${item.reason ? ` - ${item.reason}` : ''}`,
                    })),
                    okText: 'OK',
                });
                refreshScheduleData({ force: true });
                return;
            } else {
                showToast(
                    'success',
                    response?.driveSync?.queued
                        ? 'Check-out successful. Drive sync is running in the background.'
                        : 'Check-out successful. All 3 GeoTag images were verified.',
                    4,
                );
            }
            closeCheckOutModal();
            refreshScheduleData({ force: true }); // Reload to show updated status
        } catch (error) {
            console.error('Error submitting check-out:', error);
            const errorMsg = error.response?.message || error.message || 'Unknown error';
            const backendDetail = error.response?.error || null;
            const errorStage = error.response?.stage || null;
            showModernDialog({
                variant: 'error',
                title: 'Check-Out Failed',
                summary: errorMsg,
                details: [
                    { label: 'Stage', value: errorStage || 'N/A' },
                    { label: 'Detail', value: backendDetail || 'N/A' },
                    { label: 'Status', value: String(error.status || 'Network/Fetch') },
                    { label: 'Geo Photos', value: String(uploadedGeoImageCount) },
                    { label: 'Photos', value: String(checkOutData.activityPhotos.length) },
                    { label: 'Videos', value: String(checkOutData.activityVideos.length) },
                    { label: 'Location', value: locationStatus.detected ? 'Detected' : 'Missing' },
                    { label: 'Network', value: navigator.onLine ? 'Online' : 'Offline' },
                ],
                okText: 'Close',
            });
        } finally {
            setIsSubmittingCheckOut(false);
        }
    };

    const isInitialLoading = (
        loading
        && schedules.length === 0
        && pendingSchedules.length === 0
        && !hasHydratedScheduleSnapshot
    );

    if (isInitialLoading) {
        return (
            <TrainerScheduleSkeleton description="Loading the latest sessions and pending attendance actions." />
        );
    }

    return (
        <MobileTrainerLayout>
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
                <p className="text-sm text-gray-500">Manage sessions and attendance.</p>
                {loading ? (
                    <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                        Refreshing schedule
                    </span>
                ) : null}
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full sm:w-auto rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 px-3"
                />
                <div className="flex rounded-lg shadow-sm border border-gray-300 overflow-hidden w-full sm:w-auto">
                    <button
                        onClick={() => setView('list')}
                        className={`flex-1 sm:flex-none px-4 py-2.5 text-sm font-medium flex items-center justify-center ${view === 'list'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                    >
                        <ListBulletIcon className="h-4 w-4 mr-2" />
                        List
                    </button>
                    <button
                        onClick={() => setView('calendar')}
                        className={`flex-1 sm:flex-none px-4 py-2.5 text-sm font-medium flex items-center justify-center border-l border-gray-300 ${view === 'calendar'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                    >
                        <CalendarDaysIcon className="h-4 w-4 mr-2" />
                        Calendar
                    </button>
                </div>
            </div>

            {/* List View */}
            {view === 'list' && (
                <div className="space-y-6">
                    <PendingActionsPanel
                        pendingSchedules={pendingSchedules}
                        onOpenCheckIn={openCheckInModal}
                        onOpenCheckOut={openCheckOutModal}
                    />
                    <ScheduleList
                        schedules={schedules}
                        onOpenCheckIn={openCheckInModal}
                        onOpenCheckOut={openCheckOutModal}
                        onDelete={handleDelete}
                    />
                </div>
            )}

            {/* Calendar View */}
            {view === 'calendar' && (
                <ScheduleCalendarView
                    schedules={schedules}
                    selectedMonth={selectedMonth}
                    onOpenCheckIn={openCheckInModal}
                    onOpenCheckOut={openCheckOutModal}
                />
            )}

            {showCheckInModal && selectedSchedule && (
                <CheckInModal
                    attendanceData={attendanceData}
                    fetchingStudents={fetchingStudents}
                    fetchStudentsForCollege={fetchStudentsForCollege}
                    getLiveLocation={getLiveLocation}
                    handleCheckInSubmit={handleCheckInSubmit}
                    handleStudentCheck={handleStudentCheck}
                    locationStatus={locationStatus}
                    onClose={closeCheckInModal}
                    selectedSchedule={selectedSchedule}
                    setAttendanceData={setAttendanceData}
                    studentAttendance={studentAttendance}
                    students={students}
                />
            )}
            {showCheckOutModal && selectedSchedule && (
                <CheckOutModal
                    allThreeImagesUploaded={allThreeImagesUploaded}
                    allThreeImagesVerified={allThreeImagesVerified}
                    checkOutData={checkOutData}
                    checkOutImageSlots={checkOutImageSlots}
                    checkOutValidationResults={checkOutValidationResults}
                    closeCheckOutModal={closeCheckOutModal}
                    derivedCheckOutFinalStatus={derivedCheckOutFinalStatus}
                    getLiveLocation={getLiveLocation}
                    handleCheckOutSubmit={handleCheckOutSubmit}
                    handleGeoImageUpload={handleGeoImageUpload}
                    isSubmittingCheckOut={isSubmittingCheckOut}
                    locationStatus={locationStatus}
                    openGeoValidationDetails={openGeoValidationDetails}
                    selectedSchedule={selectedSchedule}
                    setCheckOutData={setCheckOutData}
                    uploadedGeoImageCount={uploadedGeoImageCount}
                    uploadingCheckOutSlot={uploadingCheckOutSlot}
                    uploadingCheckOutPhase={uploadingCheckOutPhase}
                />
            )}
        </MobileTrainerLayout>
    );
};

export default TrainerSchedule;
