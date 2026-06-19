"use client";

import { useCallback, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import DayDetailsModal from '@/components/modals/DayDetailsModal';
import HierarchyBreadcrumb from '@/components/common/HierarchyBreadcrumb';
import CollegeInfoCards from '@/components/college/CollegeInfoCards';
import TrainingProgress from '@/components/college/TrainingProgress';
import DaysGrid from '@/components/college/DaysGrid';
import { api } from '@/services/api';
import { notify } from '@/lib/toast';
import {
    clearTrainerDashboardScheduleSummaryCache,
    clearTrainerDashboardSnapshot,
    signalTrainerDashboardRefresh,
} from '@/portals/trainer/dashboard/dashboardUtils';
import {
    clearTrainerDashboardScheduleSummaryCache,
    clearTrainerDashboardSnapshot,
    signalTrainerDashboardRefresh,
} from '@/portals/trainer/dashboard/dashboardUtils';
import {
    extractDriveSyncResponseData,
    runDriveSyncDryRunPreview,
} from './driveSyncPreview';

const SuperAdminCollegeDetails = () => {
    const { id, departmentName } = useParams();
    const router = useRouter();
    const [syncingDrive, setSyncingDrive] = useState(false);
    const [previewingDrive, setPreviewingDrive] = useState(false);
    const [previewingCanonicalDrive, setPreviewingCanonicalDrive] = useState(false);
    const [syncingCanonicalDrive, setSyncingCanonicalDrive] = useState(false);
    const [normalizingDrive, setNormalizingDrive] = useState(false);
    const [syncDryRunPreview, setSyncDryRunPreview] = useState(null);
    const scrollToSection = (sectionId) => {
        const section = document.getElementById(sectionId);
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const selectedDepartmentParam = Array.isArray(departmentName)
        ? departmentName[0]
        : departmentName;
    const selectedDepartment = decodeURIComponent(selectedDepartmentParam || 'General');
    const detailsEndpoint = selectedDepartment
        ? `/colleges/${id}/details?department=${encodeURIComponent(selectedDepartment)}`
        : `/colleges/${id}/details`;
    const detailsQuery = useQuery({
        queryKey: ['admin', 'college-details', id, selectedDepartment],
        enabled: Boolean(id),
        queryFn: async () => {
            const response = await api.get(detailsEndpoint);
            return {
                college: response?.college || null,
                days: response?.days || [],
                trainers: response?.trainers || [],
                activeDepartmentId: response?.activeDepartmentId || null,
            };
        },
        staleTime: 90_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
        placeholderData: (previousData) => previousData,
    });
    const college = detailsQuery.data?.college || null;
    const days = detailsQuery.data?.days || [];
    const trainers = detailsQuery.data?.trainers || [];
    const activeDepartmentId = detailsQuery.data?.activeDepartmentId || null;
    const coursePagePath = college?.companyId?._id && (college?.courseId?._id || college?.courseId)
        ? `/dashboard/companies/${college.companyId._id}/courses/${college.courseId?._id || college.courseId}`
        : '/dashboard/companies';
    const hierarchyItems = [
        { label: 'Company', value: college?.companyId?.name || 'Company', to: '/dashboard/companies' },
        { label: 'Course', value: college?.courseId?.title || college?.courseId?.name || 'Course', to: coursePagePath },
        { label: 'College', value: college?.name || 'College', to: `/dashboard/companies/college/${id}` },
        { label: 'Department', value: selectedDepartment, onClick: () => scrollToSection('department-section') },
    ];

    const [selectedDay, setSelectedDay] = useState(null);
    const [isDayModalOpen, setIsDayModalOpen] = useState(false);

    const handleDayClick = (day) => {
        setSelectedDay(day);
        setIsDayModalOpen(true);
    };

    const refreshDetails = useCallback(async () => {
        const result = await detailsQuery.refetch();
        return result.data || null;
    }, [detailsQuery]);

    const handleSyncDrive = async () => {
        try {
            setSyncingDrive(true);
            setSyncDryRunPreview(null);
            const syncResponse = await api.post('/drive-hierarchy/sync-db', {
                collegeId: id,
                departmentId: activeDepartmentId || undefined,
            });

            const syncCounts = extractDriveSyncResponseData(syncResponse);
            const reconciliation = syncCounts?.reconciliation || {};
            const companiesSynced = Number(syncCounts.companiesSynced || 0);
            const coursesSynced = Number(syncCounts.coursesSynced || 0);
            const collegesSynced = Number(syncCounts.collegesSynced || 0);
            const departmentsSynced = Number(syncCounts.departmentsSynced || 0);
            const schedulesUpdated = Number(syncCounts.schedulesUpdated || 0);
            const schedulesReconciled = Number(reconciliation.schedulesReconciled || 0);
            const scannedFiles = Number(reconciliation.totalScanned || 0);
            const attendanceBackfilled = Number(reconciliation.attendanceBackfilled || 0);
            const geoTagBackfilled = Number(reconciliation.geoTagBackfilled || 0);
            const refreshedLinks = Number(reconciliation.refreshedLinks || 0);
            const skippedAmbiguous = Number(reconciliation.skippedAmbiguous || 0);
            const unchanged = Number(reconciliation.unchanged || 0);
            const reconciliationUpdated =
                attendanceBackfilled +
                geoTagBackfilled +
                refreshedLinks;
            const totalUpdated =
                companiesSynced +
                coursesSynced +
                collegesSynced +
                departmentsSynced +
                schedulesUpdated;

            await refreshDetails();

            if (totalUpdated === 0 && reconciliationUpdated === 0) {
                notify.success(
                    `Drive sync completed — no updates needed. Reconciled: ${schedulesReconciled}, Scanned: ${scannedFiles}, Backfilled: ${attendanceBackfilled + geoTagBackfilled}.`,
                );
                return;
            }

            notify.success(
                `Drive sync completed. Companies: ${companiesSynced}, Colleges: ${collegesSynced}, Schedules: ${schedulesUpdated}, Reconciled: ${schedulesReconciled}.`,
            );
        } catch (err) {
            console.warn('Drive sync failed:', err);
            const syncErrorCode = String(err?.response?.errorCode || '').trim().toUpperCase();
            const rawReason =
                err?.response?.error
                || err?.response?.message
                || err?.message
                || 'Unknown Drive sync error';
            const normalizedReason = String(rawReason).toLowerCase();

            const syncReason = (
                syncErrorCode === 'DRIVE_INVALID_GRANT'
                || normalizedReason.includes('invalid_grant')
            )
                ? 'Google Drive authorization expired. Please reconnect Drive credentials and retry.'
                : rawReason;

            notify.error(`Failed to sync Drive: ${syncReason}`);
        } finally {
            setSyncingDrive(false);
        }
    };

    const handleClearDuplicateDayFolders = async () => {
        try {
            setNormalizingDrive(true);
            setSyncDryRunPreview(null);
            const syncResponse = await api.post('/drive-hierarchy/sync-db?normalizeDuplicates=true', {
                collegeId: id,
                departmentId: activeDepartmentId || undefined,
            });

            const syncCounts = extractDriveSyncResponseData(syncResponse);
            const reconciliation = syncCounts?.reconciliation || {};
            const duplicateDayFoldersCleared = Number(reconciliation.duplicateDayFoldersCleared || 0);
            const skippedAmbiguous = Number(reconciliation.skippedAmbiguous || 0);
            const warningList = Array.isArray(reconciliation.warnings)
                ? reconciliation.warnings
                : 0;
            const warningCount = Array.isArray(warningList) ? warningList.length : 0;
            const warningPreview = Array.isArray(warningList)
                ? warningList.slice(0, 3).join('\n- ')
                : '';

            await refreshDetails();

            notify.success(
                `Duplicate folder cleanup done. Cleared: ${duplicateDayFoldersCleared}, Skipped: ${skippedAmbiguous}${warningCount ? `, Warnings: ${warningCount}` : ''}.`,
            );
        } catch (err) {
            console.warn('Drive duplicate cleanup failed:', err);
            const reason =
                err?.response?.error
                || err?.response?.message
                || err?.message
                || 'Unknown duplicate cleanup error';
            notify.error(`Failed to clear duplicate day folders: ${reason}`);
        } finally {
            setNormalizingDrive(false);
        }
    };

    const handlePreviewSyncDrive = async () => {
        try {
            setPreviewingDrive(true);
            const preview = await runDriveSyncDryRunPreview({
                apiClient: api,
                collegeId: id,
                departmentId: activeDepartmentId || undefined,
                normalizeDuplicates: true,
            });
            setSyncDryRunPreview({
                generatedAt: new Date().toISOString(),
                summary: preview.previewModel?.summary || preview.summary || {},
                normalization: preview.previewModel?.normalization || {},
                canonicalMapping: preview.canonicalMapping || {},
            });
        } catch (err) {
            console.warn('Drive sync dry-run failed:', err);
            const reason =
                err?.response?.error
                || err?.response?.message
                || err?.message
                || 'Unknown dry-run error';
            notify.error(`Failed to preview Drive sync: ${reason}`);
        } finally {
            setPreviewingDrive(false);
        }
    };

    const handlePreviewCanonicalMappings = async () => {
        try {
            setPreviewingCanonicalDrive(true);
            const preview = await runDriveSyncDryRunPreview({
                apiClient: api,
                collegeId: id,
                departmentId: activeDepartmentId || undefined,
                canonicalMappingsOnly: true,
            });
            setSyncDryRunPreview({
                generatedAt: new Date().toISOString(),
                summary: preview.previewModel?.summary || preview.summary || {},
                normalization: preview.previewModel?.normalization || {},
                canonicalMapping: preview.canonicalMapping || {},
            });
        } catch (err) {
            console.warn('Drive canonical mapping dry-run failed:', err);
            const reason =
                err?.response?.error
                || err?.response?.message
                || err?.message
                || 'Unknown canonical mapping dry-run error';
            notify.error(`Failed to preview canonical mapping: ${reason}`);
        } finally {
            setPreviewingCanonicalDrive(false);
        }
    };

    const handleApplyCanonicalMappings = async () => {
        try {
            setSyncingCanonicalDrive(true);
            setSyncDryRunPreview(null);
            const syncResponse = await api.post('/drive-hierarchy/sync-db?canonicalMappingsOnly=true', {
                collegeId: id,
                departmentId: activeDepartmentId || undefined,
            });

            const syncCounts = extractDriveSyncResponseData(syncResponse);
            const canonicalMapping = syncCounts?.canonicalMapping || {};
            const reconciliation = syncCounts?.reconciliation || {};
            const canonicalMappingsUpdated = Number(
                canonicalMapping.canonicalMappingsUpdated || reconciliation.canonicalMappingsUpdated || 0,
            );
            const ambiguousDaysSkipped = Number(canonicalMapping.ambiguousDaysSkipped || 0);
            const unchanged = Number(canonicalMapping.unchanged || 0);
            const warnings = Array.isArray(canonicalMapping.warnings) ? canonicalMapping.warnings : [];
            const errors = Array.isArray(canonicalMapping.errors) ? canonicalMapping.errors : [];

            await refreshDetails();

            notify.success(
                `Canonical mapping sync done. Updated: ${canonicalMappingsUpdated}, Skipped: ${ambiguousDaysSkipped}, Unchanged: ${unchanged}${errors.length ? `, Errors: ${errors.length}` : ''}.`,
            );
        } catch (err) {
            console.warn('Canonical mapping sync failed:', err);
            const reason =
                err?.response?.error
                || err?.response?.message
                || err?.message
                || 'Unknown canonical mapping error';
            notify.error(`Failed to apply canonical mapping: ${reason}`);
        } finally {
            setSyncingCanonicalDrive(false);
        }
    };

    const handleVerification = async (dayId, status) => {
        try {
            // Find the day to get attendanceId
            const day = days.find(d => d.id === dayId);
            if (!day) return;

            // If no attendance record exists, create one manually
            if (!day.attendanceId) {

                // Validation: Ensure Trainer and Date are present
                if (!day.trainerId) {
                    console.error('Validation failed: Missing Trainer', day);
                    notify.error('Cannot verify: Missing Trainer. Please edit the day details to assign a Trainer.');
                    return;
                }
                if (!day.date) {
                    console.error('Validation failed: Missing Date', day);
                    notify.error('Cannot verify: Missing Date. Please edit the day details to ensure the Date is correct.');
                    return;
                }

                let approvedBy = null;
                if (status === 'Approved') {
                    approvedBy = prompt('Enter your name (Approved By):');
                    if (!approvedBy || !approvedBy.trim()) {
                        notify.error('Approved By name is required');
                        return;
                    }
                }

                const payload = {
                    trainerId: day.trainerId,
                    collegeId: id,
                    scheduleId: day.id,
                    dayNumber: day.dayNumber,
                    date: day.date,
                    status: 'Present',
                    verificationStatus: status.toLowerCase(),
                    approvedBy: approvedBy,
                    remarks: 'Manual verification by admin',
                    studentsPresent: 0,
                    studentsAbsent: 0
                };


                const response = await api.post('/attendance/manual', payload);

                if (response.success) {
                    await refreshDetails();
                    notify.success(`Attendance manually ${status.toLowerCase()} successfully`);
                }
                return;
            }

            let approvedBy = null;
            if (status === 'Approved') {
                approvedBy = prompt('Enter your name (Approved By):');
                if (!approvedBy || !approvedBy.trim()) {
                    notify.error('Approved By name is required');
                    return;
                }
            }

            // Existing logic for updating verification
            await api.put(`/attendance/${day.attendanceId}/verify`, {
                status: status.toLowerCase(),
                approvedBy: approvedBy,
                verifiedBy: 'admin-uuid-placeholder'
            });

            // Refresh data to ensure consistency
            const detailsData = await refreshDetails();
            if (detailsData?.days) {
                const updatedDay = detailsData.days.find(d => d.id === dayId);
                if (updatedDay) setSelectedDay(updatedDay);
            }
            notify.success(`Attendance ${status.toLowerCase()} successfully`);
        } catch (err) {
            console.error('Error verifying attendance:', err);
            notify.error('Failed to update verification status: ' + (err.response?.data?.message || err.message));
        }
    };

    if (detailsQuery.isPending) return <div className="p-8 text-center">Loading...</div>;
    if (detailsQuery.error) return <div className="p-8 text-center text-red-600">{detailsQuery.error.message || 'Failed to load college details'}</div>;
    if (!college) return <div className="p-8 text-center">College not found</div>;

    const previewWarnings = [
        ...(Array.isArray(syncDryRunPreview?.summary?.warnings) ? syncDryRunPreview.summary.warnings : []),
        ...(Array.isArray(syncDryRunPreview?.canonicalMapping?.warnings)
            ? syncDryRunPreview.canonicalMapping.warnings
            : []),
    ];
    const previewErrors = [
        ...(Array.isArray(syncDryRunPreview?.summary?.errors) ? syncDryRunPreview.summary.errors : []),
        ...(Array.isArray(syncDryRunPreview?.canonicalMapping?.errors)
            ? syncDryRunPreview.canonicalMapping.errors
            : []),
    ];

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="mb-6">
                <button
                    onClick={() => router.back()}
                    className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors"
                >
                    <ArrowLeftIcon className="h-5 w-5 mr-2" />
                    Back
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{selectedDepartment} Department</h1>
                    <p className="mt-2 text-sm text-gray-600">Department Page -&gt; Days Schedule Cards</p>
                </div>
            </div>

            <div className="space-y-6 max-w-7xl mx-auto" id="department-section">
                <HierarchyBreadcrumb items={hierarchyItems} />

                {/* College Info */}
                <CollegeInfoCards
                    college={college}
                    department={selectedDepartment}
                    onCollegeUpdated={() => detailsQuery.refetch()}
                />

                {/* Training Progress */}
                <TrainingProgress days={days} />

                {/* Days Grid */}
                <div className="flex justify-end mb-4">
                    <button
                        type="button"
                        onClick={handlePreviewCanonicalMappings}
                        disabled={previewingCanonicalDrive || previewingDrive || syncingDrive || syncingCanonicalDrive || normalizingDrive}
                        className="mr-3 bg-cyan-700 text-white px-4 py-2 rounded-lg shadow hover:bg-cyan-800 transition disabled:opacity-60"
                    >
                        {previewingCanonicalDrive ? 'Previewing Canonical...' : 'Preview Canonical'}
                    </button>
                    <button
                        type="button"
                        onClick={handleApplyCanonicalMappings}
                        disabled={syncingCanonicalDrive || previewingCanonicalDrive || previewingDrive || syncingDrive || normalizingDrive}
                        className="mr-3 bg-indigo-700 text-white px-4 py-2 rounded-lg shadow hover:bg-indigo-800 transition disabled:opacity-60"
                    >
                        {syncingCanonicalDrive ? 'Applying Canonical...' : 'Canonical Mapping Only'}
                    </button>
                    <button
                        type="button"
                        onClick={handlePreviewSyncDrive}
                        disabled={previewingDrive || previewingCanonicalDrive || syncingDrive || syncingCanonicalDrive || normalizingDrive}
                        className="mr-3 bg-slate-600 text-white px-4 py-2 rounded-lg shadow hover:bg-slate-700 transition disabled:opacity-60"
                    >
                        {previewingDrive ? 'Previewing...' : 'Preview Sync'}
                    </button>
                    <button
                        type="button"
                        onClick={handleClearDuplicateDayFolders}
                        disabled={normalizingDrive || syncingDrive || syncingCanonicalDrive || previewingDrive || previewingCanonicalDrive}
                        className="mr-3 bg-amber-600 text-white px-4 py-2 rounded-lg shadow hover:bg-amber-700 transition disabled:opacity-60"
                    >
                        {normalizingDrive ? 'Clearing Duplicates...' : 'Clear Duplicate Days'}
                    </button>
                    <button
                        type="button"
                        onClick={handleSyncDrive}
                        disabled={syncingDrive || syncingCanonicalDrive || previewingDrive || previewingCanonicalDrive || normalizingDrive}
                        className="mr-3 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow hover:bg-emerald-700 transition disabled:opacity-60"
                    >
                        {syncingDrive ? 'Syncing Drive...' : 'Sync Drive'}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setSelectedDay(null);
                            setIsDayModalOpen(true);
                        }}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition"
                    >
                        + Add Day
                    </button>
                </div>
                {syncDryRunPreview ? (
                    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-900">
                                    Drive Sync Preview (Dry Run)
                                </h3>
                                <p className="text-xs text-slate-500">
                                    No database updates were made.
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-500">
                                    {syncDryRunPreview.generatedAt
                                        ? `Updated ${new Date(syncDryRunPreview.generatedAt).toLocaleString()}`
                                        : ''}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setSyncDryRunPreview(null)}
                                    className="text-xs font-medium text-slate-600 hover:text-slate-900"
                                >
                                    Clear Preview
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                ['Files Scanned', syncDryRunPreview.summary?.totalScanned],
                                ['Candidate Matches', syncDryRunPreview.summary?.candidateMatches],
                                ['Attendance Backfill', syncDryRunPreview.summary?.attendanceWouldBackfill],
                                ['GeoTag Backfill', syncDryRunPreview.summary?.geoWouldBackfill],
                                ['Refreshed Links', syncDryRunPreview.summary?.refreshedLinksWouldChange],
                                ['Skipped Ambiguous', syncDryRunPreview.summary?.skippedAmbiguous],
                                ['Unchanged', syncDryRunPreview.summary?.unchanged],
                                ['Would Clear Duplicates', syncDryRunPreview.summary?.duplicateDayFoldersWouldClear],
                                ['Canonical Would Change', syncDryRunPreview.canonicalMapping?.canonicalMappingsWouldChange],
                                ['Warnings', syncDryRunPreview.summary?.warnings?.length || 0],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                    <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
                                    <p className="text-base font-semibold text-slate-900">{Number(value || 0)}</p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                ['Canonical Updated', syncDryRunPreview.canonicalMapping?.canonicalMappingsUpdated],
                                ['Ambiguous Days Skipped', syncDryRunPreview.canonicalMapping?.ambiguousDaysSkipped],
                                ['Canonical Unchanged', syncDryRunPreview.canonicalMapping?.unchanged],
                                ['Canonical Warnings', syncDryRunPreview.canonicalMapping?.warnings?.length || 0],
                                ['Canonical Errors', syncDryRunPreview.canonicalMapping?.errors?.length || 0],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                                    <p className="text-[11px] uppercase tracking-wide text-indigo-700">{label}</p>
                                    <p className="text-sm font-semibold text-indigo-900">{Number(value || 0)}</p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                ['Departments', syncDryRunPreview.normalization?.departmentsAnalyzed],
                                ['Day Folders', syncDryRunPreview.normalization?.dayFoldersDetected],
                                ['Duplicates', syncDryRunPreview.normalization?.duplicateDayFolders],
                                ['Canonical Days', syncDryRunPreview.normalization?.canonicalDayFolders],
                                ['Ambiguous Days', syncDryRunPreview.normalization?.ambiguousDayFolders],
                                ['Safe Matches', syncDryRunPreview.normalization?.filesMatchedSafely],
                                ['Proposed Keep', syncDryRunPreview.normalization?.proposedActions?.keep],
                                ['Proposed Link', syncDryRunPreview.normalization?.proposedActions?.link],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                    <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
                                    <p className="text-sm font-semibold text-slate-900">{Number(value || 0)}</p>
                                </div>
                            ))}
                        </div>

                        {(previewWarnings.length > 0 || previewErrors.length > 0) ? (
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                                    <p className="text-xs font-semibold text-amber-800">Warnings</p>
                                    {previewWarnings.slice(0, 3).map((warning, index) => (
                                        <p key={`warn-${index + 1}`} className="text-xs text-amber-700 mt-1">
                                            {index + 1}. {warning}
                                        </p>
                                    ))}
                                </div>
                                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                                    <p className="text-xs font-semibold text-rose-800">Errors</p>
                                    {previewErrors.length > 0 ? (
                                        previewErrors.slice(0, 3).map((error, index) => (
                                            <p key={`error-${index + 1}`} className="text-xs text-rose-700 mt-1">
                                                {index + 1}. {error}
                                            </p>
                                        ))
                                    ) : (
                                        <p className="text-xs text-rose-700 mt-1">No errors reported.</p>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}
                <DaysGrid days={days} department={selectedDepartment} onDayClick={handleDayClick} />
            </div>

            <DayDetailsModal
                open={isDayModalOpen}
                onClose={() => setIsDayModalOpen(false)}
                day={selectedDay}
                trainers={trainers}
                onVerify={handleVerification}
                onSave={async (data) => {
                    try {
                        // Map frontend fields to backend schema
                        const payload = {
                            ...data,
                            scheduledDate: data.date, // Map date -> scheduledDate
                            startTime: data.time,     // Map time -> startTime
                            endTime: data.time ?
                                // Default endTime to 1 hour after startTime if not provided
                                (() => {
                                    const [hours, minutes] = data.time.split(':').map(Number);
                                    const endHours = (hours + 1) % 24;
                                    return `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                                })()
                                : '18:00', // Fallback
                            trainerId: data.trainerId || null
                        };

                        let scheduleId = selectedDay?.id;

                        if (selectedDay && selectedDay.id) {
                            // Update existing schedule
                            await api.put(`/schedules/${selectedDay.id}`, payload);
                        } else {
                            // Create new schedule (Day)
                            const newSchedulePayload = {
                                ...payload,
                                collegeId: id,
                                companyId: college.companyId || null,
                                courseId: college.courseId || null,
                                departmentId: activeDepartmentId || null,
                            };

                            const response = await api.post('/schedules/create', newSchedulePayload);
                            if (response.success && response.data) {
                                scheduleId = response.data._id || response.data.id;
                            }
                        }

                        // Handle attendance upload/update if scheduleId exists
                        if (scheduleId) {

                            const formData = new FormData();
                            formData.append('scheduleId', scheduleId);
                            formData.append('trainerId', data.trainerId);
                            formData.append('collegeId', id);
                            formData.append('date', data.date);

                            if (data.geoTag) {
                                const parts = data.geoTag.split(',').map(s => s.trim());
                                if (parts.length >= 2) {
                                    const [lat, lng] = parts;
                                    if (lat && lng) {
                                        formData.append('latitude', lat);
                                        formData.append('longitude', lng);
                                    }
                                }
                            }
                            if (data.attendancePdf) formData.append('attendancePdf', data.attendancePdf);
                            if (data.attendanceImage) formData.append('studentsPhoto', data.attendanceImage);
                            if (data.geoTagImages && data.geoTagImages.length > 0) {
                                data.geoTagImages.forEach(file => {
                                    formData.append('checkOutGeoImage', file);
                                });
                            } else if (data.geoTagImage) {
                                // Fallback for single image if needed
                                formData.append('checkOutGeoImage', data.geoTagImage);
                            }

                            if (data.verificationStatus) formData.append('verificationStatus', data.verificationStatus);
                            if (data.geoVerificationStatus) formData.append('geoVerificationStatus', data.geoVerificationStatus);

                            await api.post('/attendance/admin-upload', formData, {
                                headers: { 'Content-Type': 'multipart/form-data' }
                            });

                        }

                        // Invalidate trainer dashboard caches for affected trainer(s)
                        const previousTrainerId = selectedDay?.trainerId || selectedDay?.trainer?._id || selectedDay?.trainer?.id;
                        const currentTrainerId = data.trainerId || previousTrainerId;

                        if (previousTrainerId) {
                            clearTrainerDashboardScheduleSummaryCache(previousTrainerId);
                            clearTrainerDashboardSnapshot(previousTrainerId);
                            signalTrainerDashboardRefresh(previousTrainerId);
                        }

                        if (currentTrainerId && currentTrainerId !== previousTrainerId) {
                            clearTrainerDashboardScheduleSummaryCache(currentTrainerId);
                            clearTrainerDashboardSnapshot(currentTrainerId);
                            signalTrainerDashboardRefresh(currentTrainerId);
                        }

                        // Refresh
                        await refreshDetails();
                        setIsDayModalOpen(false);
                    } catch (err) {
                        console.error('Error saving day details:', err);
                        notify.error('Failed to save day details');
                    }
                }}
                /* onDelete removed — 12 fixed days cannot be deleted */
            />
        </div>
    );
};

export default SuperAdminCollegeDetails;
