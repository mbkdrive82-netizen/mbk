"use client";

import dynamic from "next/dynamic";
import { memo, useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ClockIcon, ChartPieIcon, CalendarIcon, PlusIcon, TrashIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid';
import scheduleService from '@/services/scheduleService';
import { useScheduleAssociationsQuery } from '@/modules/schedules';
import { api } from '@/services/api';
import { notify } from '@/lib/toast';
import { ArrowDownTrayIcon, DocumentTextIcon, XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, CloudArrowUpIcon, PencilSquareIcon as SolidPencilSquareIcon, TrashIcon as SolidTrashIcon } from '@heroicons/react/24/solid';
import { useSocket } from '@/context/SocketContext';
import { clearTrainerDashboardScheduleSummaryCache, clearTrainerDashboardSnapshot, signalTrainerDashboardRefresh } from '@/portals/trainer/dashboard/dashboardUtils';
import useRenderCountDebug from "@/shared/perf/useRenderCountDebug";

const DayDetailsModal = dynamic(() => import("@/components/modals/DayDetailsModal"), {
    loading: () => null,
    ssr: false,
});

const unwrapApiPayload = (response) => {
    if (
        response &&
        typeof response === 'object' &&
        'data' in response &&
        typeof response.data !== 'undefined' &&
        typeof response.success === 'undefined'
    ) {
        return response.data;
    }
    return response;
};

const unwrapApiList = (response) => {
    const payload = unwrapApiPayload(response);
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
};

const BulkUploadModal = memo(function BulkUploadModal({ show, onClose, onRefresh, trainerId }) {
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState(null);
    const [dragActive, setDragActive] = useState(false);

    const downloadErrorReport = () => {
        if (!result || !result.skippedDetails) return;
        
        let report = `Bulk Load Error Report - ${new Date().toLocaleString()}\n`;
        report += `Trainer ID: ${trainerId}\n`;
        report += `Total Success: ${result.inserted}\n`;
        report += `Total Skipped: ${result.skipped}\n`;
        report += `-------------------------------------------\n\n`;
        
        result.skippedDetails.forEach(s => {
            report += `Row ${s.rowNumber}: ${s.reason}\n`;
        });

        const element = document.createElement("a");
        const file = new Blob([report], {type: 'text/plain'});
        const blobUrl = URL.createObjectURL(file);
        element.href = blobUrl;
        element.download = `Bulk_Upload_Errors_${Date.now()}.txt`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    };

    const handleUpload = async (file) => {
        if (!file) return;
        setUploading(true);
        setResult(null);
        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await api.post("/schedules/bulk-upload", formData);
            if (response.success) {
                setResult(response);
                if (typeof onRefresh === 'function') {
                    onRefresh();
                }
            } else {
                throw new Error(response.message || "Upload failed");
            }
        } catch (err) {
            console.error("Upload error:", err);
            notify.error(err.message || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    if (!show) return null;

    return (
        <div className="dashboard-modal-overlay fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm transition-all">
            <div className="dashboard-modal-panel w-full max-w-xl animate-in overflow-hidden rounded-2xl bg-white shadow-2xl fade-in zoom-in duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center">
                        <CloudArrowUpIcon className="h-5 w-5 mr-2 text-indigo-600" />
                        Bulk Upload Schedule
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>

                <div className="p-8">
                    {!result ? (
                        <div className="space-y-6">
                            <div className="flex justify-center">
                                <a 
                                    href="/templates/Bulk_Trainer_Schedule_Template.xlsx" 
                                    target="_blank"
                                    className="inline-flex items-center px-4 py-2 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 text-sm font-semibold transition-all"
                                >
                                    <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                                    Download Excel Template
                                </a>
                            </div>

                            <div 
                                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                                onDragLeave={() => setDragActive(false)}
                                onDrop={(e) => { e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files[0]); }}
                                className={`relative group border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
                                    dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-400 bg-gray-50/50'
                                }`}
                                onClick={() => document.getElementById('bulk-file-input').click()}
                            >
                                <input 
                                    id="bulk-file-input"
                                    type="file" 
                                    className="hidden" 
                                    accept=".xlsx,.xls"
                                    onChange={(e) => handleUpload(e.target.files[0])}
                                />
                                <div className="flex flex-col items-center">
                                    <div className={`p-4 rounded-full mb-4 transition-transform group-hover:scale-110 ${dragActive ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                                        <CloudArrowUpIcon className={`h-8 w-8 ${dragActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                                    </div>
                                    <p className="text-sm font-bold text-gray-900 mb-1">
                                        {uploading ? 'Processing File...' : 'Click or drag Excel file to upload'}
                                    </p>
                                    <p className="text-xs text-gray-500">Sheet name must be "Schedule"</p>
                                </div>
                            </div>

                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start space-x-3">
                                <DocumentTextIcon className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                                <div>
                                    <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-1">Required Columns</h4>
                                    <p className="text-xs text-blue-700 leading-relaxed">
                                        Company, Course, College, TrainerID, Date, Day, StartTime, EndTime
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-green-50 border border-green-100 rounded-2xl p-5 text-center">
                                    <div className="flex justify-center mb-1">
                                        <CheckCircleIcon className="h-6 w-6 text-green-500" />
                                    </div>
                                    <p className="text-2xl font-bold text-green-700">{result.inserted}</p>
                                    <p className="text-xs font-semibold text-green-600 uppercase tracking-wider">Inserted</p>
                                </div>
                                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 text-center">
                                    <div className="flex justify-center mb-1">
                                        <ExclamationTriangleIcon className="h-6 w-6 text-amber-500" />
                                    </div>
                                    <p className="text-2xl font-bold text-amber-700">{result.skipped}</p>
                                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Skipped</p>
                                </div>
                            </div>

                            {result.skippedDetails?.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Skip Reasons</h4>
                                        <button 
                                            onClick={downloadErrorReport}
                                            className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center"
                                        >
                                            <ArrowDownTrayIcon className="h-3.5 w-3.5 mr-1" />
                                            Download Report
                                        </button>
                                    </div>
                                    <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50/50 p-3 space-y-2">
                                        {result.skippedDetails.map((s, idx) => (
                                            <div key={idx} className="flex items-start text-[10px] leading-relaxed">
                                                <span className="text-red-600 font-bold mr-2 whitespace-nowrap">Row {s.rowNumber}:</span>
                                                <span className="text-gray-600">{s.reason}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button 
                                onClick={() => { setResult(null); onClose(); }} 
                                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                            >
                                Done
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});


function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

const TimeInput12H = ({ value, onChange, className }) => {
    // Parse the 24h string "HH:mm" into 12h parts
    let hour24 = 0;
    let minute = '00';
    if (value) {
        const [h, m] = value.split(':');
        hour24 = parseInt(h, 10);
        minute = m;
    } else {
        hour24 = 9;
        minute = '00';
    }

    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;

    const updateTime = (h12, m, p) => {
        let h = parseInt(h12, 10);
        if (p === 'PM' && h < 12) h += 12;
        if (p === 'AM' && h === 12) h = 0;
        const hStr = h.toString().padStart(2, '0');
        onChange(`${hStr}:${m}`);
    };

    const hours = Array.from({ length: 12 }, (_, i) => i + 1);
    const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

    return (
        <div className={`flex items-center bg-gray-50 border border-gray-200 rounded-xl p-1 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all ${className}`}>
            <select
                value={hour12}
                onChange={(e) => updateTime(e.target.value, minute, period)}
                className="bg-transparent border-none text-gray-900 text-sm font-medium focus:ring-0 p-1 cursor-pointer appearance-none text-center min-w-10"
            >
                {hours.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="text-gray-400 font-medium px-1">:</span>
            <select
                value={minute}
                onChange={(e) => updateTime(hour12, e.target.value, period)}
                className="bg-transparent border-none text-gray-900 text-sm font-medium focus:ring-0 p-1 cursor-pointer appearance-none text-center min-w-10"
            >
                {minutes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="mx-2 h-4 w-px bg-gray-300"></div>
            <select
                value={period}
                onChange={(e) => updateTime(hour12, minute, e.target.value)}
                className="bg-transparent border-none text-indigo-600 text-sm font-bold focus:ring-0 p-1 cursor-pointer appearance-none sm:text-xs"
            >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
            </select>
        </div>
    );
};


const TrainerAnalytics = () => {
    useRenderCountDebug("SpocTrainerAnalytics");
    const { id } = useParams();
    const trainerRouteId = Array.isArray(id) ? id[0] : id;
    const hasAutoOpenedAssignRef = useRef(false);
    const { socket } = useSocket();
    const queryClient = useQueryClient();

    // State for Calendar
    const [selectedMonth, setSelectedMonth] = useState(new Date());

    // State for Add Activity Modal
    const [showModal, setShowModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [showCalendarModal, setShowCalendarModal] = useState(false);
    const [loading, setLoading] = useState(false); // General loading for submit
    const [selectedStatusDay, setSelectedStatusDay] = useState(null);
    const [dayStatusMessage, setDayStatusMessage] = useState(null);
    const [tempScheduleList, setTempScheduleList] = useState([]);
    const [selectedDays, setSelectedDays] = useState([]);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [newActivity, setNewActivity] = useState({
        company: '',
        course: '',
        college: '',
        department: '',
        startTime: '09:00',
        endTime: '17:00',
        date: '', // Added for single edit
        rescheduleReason: ''
    });

    const openAssignModal = useCallback(() => {
        setEditingSchedule(null);
        setNewActivity({
            company: '',
            course: '',
            college: '',
            department: '',
            startTime: '09:00',
            endTime: '17:00',
            date: '',
            rescheduleReason: ''
        });
        setShowModal(true);
    }, []);

const associationsQuery = useScheduleAssociationsQuery();

const schedulesQuery = useQuery({
    queryKey: ['spoc', 'trainer-analytics', 'schedules', trainerRouteId],
    enabled: Boolean(trainerRouteId),
    queryFn: async () => {
        const response = await scheduleService.getTrainerSchedule(trainerRouteId);
        return unwrapApiList(response);
    },
    placeholderData: (previousData) => previousData,
});

const associations = associationsQuery.data || {
    companies: [],
    courses: [],
    colleges: [],
    departments: [],
};
const schedules = schedulesQuery.data || [];
const loadingSchedules = schedulesQuery.isPending;

useEffect(() => {
    if (hasAutoOpenedAssignRef.current) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('open') !== 'assign') return;
    openAssignModal();
    hasAutoOpenedAssignRef.current = true;
}, [openAssignModal]);

// Filter courses based on selected company
const filteredCourses = newActivity.company
    ? associations.courses.filter(c => c.companyId == newActivity.company)
    : associations.courses;

// Filter colleges based on selected company AND course
// Helper to safely get ID string
const getSafeId = (field) => {
    if (!field) return '';
    // If it's an object with _id (populated), return _id
    if (typeof field === 'object' && field._id) return field._id.toString();
    // If it's already a string/number, return it as string
    return field.toString();
};

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

// Filter colleges based on selected company AND course
const filteredColleges = newActivity.course
    ? associations.colleges.filter(c => getSafeId(c.courseId) == newActivity.course)
    : (newActivity.company
        ? associations.colleges.filter(c => getSafeId(c.companyId) == newActivity.company)
        : associations.colleges);

const filteredDepartments = newActivity.college
    ? associations.departments.filter(d => getSafeId(d.collegeId) == newActivity.college)
    : (newActivity.course
        ? associations.departments.filter(d => getSafeId(d.courseId) == newActivity.course)
        : (newActivity.company
            ? associations.departments.filter(d => getSafeId(d.companyId) == newActivity.company)
            : associations.departments));

const selectedCollegeName = associations.colleges.find((item) => getSafeId(item._id || item.id || item) == newActivity.college)?.name || 'College';

const hasFullDayFilter = Boolean(
    newActivity.company
    && newActivity.course
    && newActivity.college
    && newActivity.department
);

const departmentDaysQuery = useQuery({
    queryKey: ['spoc', 'trainer-analytics', 'department-days', newActivity.department],
    enabled: hasFullDayFilter && Boolean(newActivity.department),
    queryFn: async () => {
        const response = await scheduleService.getDepartmentDays(newActivity.department);
        const payload = unwrapApiPayload(response);
        return Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    },
    placeholderData: (previousData) => previousData,
});

const departmentDays = departmentDaysQuery.data || [];
const loadingDepartmentDays = departmentDaysQuery.isFetching;

useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const shouldDisableSidebar = showModal || showBulkModal || showCalendarModal;
    document.body.classList.toggle('sidebar-disabled', shouldDisableSidebar);

    return () => {
        document.body.classList.remove('sidebar-disabled');
    };
}, [showModal, showBulkModal, showCalendarModal]);

const refreshTrainerAnalyticsData = useCallback(() => {
    queryClient.invalidateQueries({
        queryKey: ['spoc', 'trainer-analytics', 'schedules', trainerRouteId],
    });

    if (newActivity.department) {
        queryClient.invalidateQueries({
            queryKey: ['spoc', 'trainer-analytics', 'department-days', newActivity.department],
        });
    }
}, [queryClient, trainerRouteId, newActivity.department]);

useEffect(() => {
    if (!hasFullDayFilter) {
        setDayStatusMessage(null);
        setSelectedStatusDay(null);
    }
}, [hasFullDayFilter]);

useEffect(() => {
    if (!socket || !showModal || !hasFullDayFilter || !newActivity.department) return undefined;

    const handleAttendanceUpdate = () => {
        queryClient.invalidateQueries({
            queryKey: ['spoc', 'trainer-analytics', 'department-days', newActivity.department],
        });
        queryClient.invalidateQueries({
            queryKey: ['spoc', 'trainer-analytics', 'schedules', trainerRouteId],
        });
    };

    socket.on('attendanceUpdate', handleAttendanceUpdate);
    return () => {
        socket.off('attendanceUpdate', handleAttendanceUpdate);
    };
}, [socket, showModal, hasFullDayFilter, newActivity.department, queryClient, trainerRouteId]);

    const dayStatusMap = departmentDays.reduce((acc, day) => {
        const dayNumber = Number(day.dayNumber);
        if (!Number.isFinite(dayNumber) || dayNumber <= 0) return acc;
        const statusCode = normalizeStatus(day.status) || 'not_assigned';
        acc[dayNumber] = statusCode;
        return acc;
    }, {});

    const getDayColor = (status) => {
        if (status === 'completed') return 'green';
        if (status === 'pending') return 'orange';
        return 'grey';
    };

    const getDayTooltip = (day) => {
        if (day?.statusTooltip) return day.statusTooltip;
        if (normalizeStatus(day?.status) === 'completed') return 'All documents uploaded';
        if (normalizeStatus(day?.status) === 'pending') return 'GeoTag missing';
        return 'Trainer not assigned';
    };

    useEffect(() => {
        setSelectedDays((prev) => {
            const next = prev.filter((item) => dayStatusMap[Number(item.dayId)] !== 'completed' && dayStatusMap[Number(item.dayId)] !== 'pending');
            return next.length === prev.length ? prev : next;
        });
    }, [newActivity.company, newActivity.course, newActivity.college, newActivity.department, departmentDays]);

    const handleAddToTempList = () => {
        // Standard Batch Mode
        if (!newActivity.company || !newActivity.course || !newActivity.college || !newActivity.department || !newActivity.startTime || !newActivity.endTime || selectedDays.length === 0) {
            notify.error('Please select Company, Course, College, Department, and at least one Day');
            return;
        }

        const companyName = associations.companies.find(c => (c._id || c.id) == newActivity.company)?.name || '';
        const courseName = associations.courses.find(c => (c._id || c.id) == newActivity.course)?.name || '';
        const collegeName = associations.colleges.find(c => (c._id || c.id) == newActivity.college)?.name || '';
        const departmentName = associations.departments.find(d => (d._id || d.id) == newActivity.department)?.name || '';

        const newItems = selectedDays.map(day => ({
            id: Date.now() + Math.random(),
            companyId: newActivity.company,
            courseId: newActivity.course,
            collegeId: newActivity.college,
            departmentId: newActivity.department,
            company: companyName,
            course: courseName,
            college: collegeName,
            department: departmentName,
            dayNumber: day.dayId,
            dayLabel: day.label,
            date: day.date,
            startTime: newActivity.startTime,
            endTime: newActivity.endTime,
            time: `${newActivity.startTime} - ${newActivity.endTime}`
        }));

        setTempScheduleList([...tempScheduleList, ...newItems]);
        setSelectedDays([]);
        // Keep all fields (company, course, college, times) for convenience in adding multiple batches
    };

    const handleRemoveFromTemp = (itemId) => {
        setTempScheduleList(tempScheduleList.filter(item => item.id !== itemId));
    };

    const handleEdit = (schedule) => {
        setEditingSchedule(schedule);
        setNewActivity({
            company: schedule.companyId?._id || schedule.companyId,
            course: schedule.courseId?._id || schedule.courseId,
            college: schedule.collegeId?._id || schedule.collegeId,
            department: schedule.departmentId?._id || schedule.departmentId || '',
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            date: schedule.scheduledDate ? new Date(schedule.scheduledDate).toISOString().split('T')[0] : '',
            rescheduleReason: schedule.rescheduleReason || ''
        });
        setShowModal(true);
    };

    const handleDelete = async (scheduleId) => {
        if (!window.confirm('Are you sure you want to delete this schedule?')) return;

        const reason = window.prompt('Please provide a reason for cancellation (e.g., Trainer unavailable):');
        if (reason === null) return; // User cancelled the prompt

        try {
            await scheduleService.deleteSchedule(scheduleId, reason || 'Session cancelled by administrator.');
            await queryClient.invalidateQueries({
                queryKey: ['spoc', 'trainer-analytics', 'schedules', trainerRouteId],
            });

            if (trainerRouteId) {
                clearTrainerDashboardScheduleSummaryCache(trainerRouteId);
                clearTrainerDashboardSnapshot(trainerRouteId);
                signalTrainerDashboardRefresh(trainerRouteId);
            }
        } catch (err) {
            console.error('Error deleting schedule:', err);
            notify.error('Failed to delete schedule');
        }
    };

    const handleFinalSubmit = async () => {
        if (!editingSchedule && tempScheduleList.length === 0) {
            notify.error('No activities to assign');
            return;
        }

        try {
            setLoading(true);

            // Get current user ID for createdBy
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;
            const createdBy = user ? (user.id || user._id) : null;

            if (!createdBy) {
                console.error('User identification failed. User object in local storage:', user);
                notify.error('Could not identify creator. Please log in again.');
                setLoading(false);
                return;
            }

            if (!trainerRouteId) {
                notify.error('Trainer ID is missing in route. Please reopen trainer analytics.');
                setLoading(false);
                return;
            }

            if (editingSchedule) {
                // Update existing schedule
                await scheduleService.updateSchedule(editingSchedule._id, {
                    companyId: newActivity.company,
                    courseId: newActivity.course,
                    collegeId: newActivity.college,
                    departmentId: newActivity.department || null,
                    scheduledDate: newActivity.date,
                    startTime: newActivity.startTime,
                    endTime: newActivity.endTime,
                    subject: associations.courses.find(c => c._id == newActivity.course)?.name || '',
                    rescheduleReason: newActivity.rescheduleReason
                });
                notify.success('Schedule updated successfully!');
            } else {
                // Bulk create
                const schedulesToCreate = tempScheduleList.map(item => ({
                    trainerId: trainerRouteId,
                    companyId: item.companyId,
                    courseId: item.courseId,
                    collegeId: item.collegeId,
                    departmentId: item.departmentId || null,
                    dayNumber: item.dayNumber,
                    scheduledDate: item.date,
                    startTime: item.startTime,
                    endTime: item.endTime,
                    subject: item.course
                }));

                // Guard: ensure every item has a valid scheduled date before calling the API
                const missingDate = schedulesToCreate.find(s => !s.scheduledDate);
                if (missingDate) {
                    notify.error(`Day ${missingDate.dayNumber} is missing a scheduled date. Please set a date for all selected days.`);
                    setLoading(false);
                    return;
                }

                const bulkResult = await scheduleService.bulkCreateSchedules(schedulesToCreate, createdBy);
                const inserted = bulkResult?.inserted ?? bulkResult?.data?.inserted ?? '?';
                const skipped = bulkResult?.skipped ?? bulkResult?.data?.skipped ?? 0;
                notify.success(`Schedules assigned successfully! ${inserted} created${skipped > 0 ? `, ${skipped} skipped` : ''}.`);
            }

            // Reload schedules/day statuses
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: ['spoc', 'trainer-analytics', 'schedules', trainerRouteId],
                }),
                queryClient.invalidateQueries({
                    queryKey: ['spoc', 'trainer-analytics', 'department-days', newActivity.department],
                }),
            ]);

            // Reset form
            setTempScheduleList([]);
            setShowModal(false);
            setEditingSchedule(null);
            setNewActivity({ 
            company: '', 
            course: '', 
            college: '', 
            department: '',
            startTime: '09:00', 
            endTime: '17:00', 
            date: '',
            rescheduleReason: ''
        });

        } catch (err) {
            console.error('Error saving schedules:', err);
            const serverMessage = err?.response?.data?.message || err?.message || '';
            notify.error(`Failed to save schedules. ${serverMessage ? `Server: ${serverMessage}` : 'Please try again.'}`);
        } finally {
            setLoading(false);
        }
    };

    // Calendar Helper Functions

    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay(); // 0 (Sun) to 6 (Sat)

        const days = [];
        // Add padding for previous month
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push({ date: '', isCurrentMonth: false });
        }

        // Add days of current month
        for (let i = 1; i <= daysInMonth; i++) {
            const currentDate = new Date(year, month, i);
            // Use local date string construction to avoid timezone shifts
            const yearStr = currentDate.getFullYear();
            const monthStr = String(currentDate.getMonth() + 1).padStart(2, '0');
            const dayStr = String(currentDate.getDate()).padStart(2, '0');
            const dateString = `${yearStr}-${monthStr}-${dayStr}`;

            days.push({
                date: dateString,
                day: i,
                isCurrentMonth: true,
                events: schedules.filter(s => s.scheduledDate && s.scheduledDate.startsWith(dateString))
            });
        }

        // Add padding for next month to complete the grid
        const remainingCells = 42 - days.length;
        for (let i = 0; i < remainingCells; i++) {
            days.push({ date: '', isCurrentMonth: false });
        }

        return days;
    };

    const calendarDays = getDaysInMonth(selectedMonth);

    const clampPercent = (value) => Math.min(100, Math.max(0, Number(value) || 0));

    const totalSchedules = schedules.length;
    const completedSchedules = schedules.filter((s) => normalizeStatus(s.status) === 'completed').length;
    const cancelledSchedules = schedules.filter((s) => normalizeStatus(s.status) === 'cancelled').length;
    const activeSchedules = Math.max(totalSchedules - cancelledSchedules, 0);
    const pendingSchedules = Math.max(activeSchedules - completedSchedules, 0);
    const completionRate = activeSchedules > 0 ? Math.round((completedSchedules / activeSchedules) * 100) : 0;

    const attendanceRows = schedules.filter((s) => s.attendanceStatus != null);
    const verifiedAttendanceCount = attendanceRows.filter((s) =>
        ['approved', 'verified'].includes(normalizeStatus(s.attendanceStatus))
    ).length;
    const attendanceAvg = attendanceRows.length > 0
        ? Math.round((verifiedAttendanceCount / attendanceRows.length) * 100)
        : 0;

    const completionRatePct = clampPercent(completionRate);
    const attendanceAvgPct = clampPercent(attendanceAvg);

    const handleCalendarMonthChange = (offset) => {
        setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
            <div className="sm:flex sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Trainer Analytics</h1>
                    <p className="mt-2 text-sm text-gray-700">Performance tracking overview.</p>
                </div>
                <div className="mt-4 sm:mt-0 flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={openAssignModal}
                        className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                        <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                        Assign
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowCalendarModal(true)}
                        className="inline-flex items-center justify-center rounded-md bg-white p-2 text-gray-600 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 hover:text-indigo-600"
                        aria-label="Open schedule calendar"
                        title="Open Schedule Calendar"
                    >
                        <CalendarIcon className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl p-6">
                    <h2 className="text-base font-semibold leading-6 text-gray-900 flex items-center mb-6">
                        <ClockIcon className="h-5 w-5 mr-2 text-green-500" />
                        Schedule Performance
                    </h2>
                    <div className="relative flex items-center justify-center">
                        <div className="relative h-32 w-32">
                            <svg className="h-full w-full transform -rotate-90" viewBox="0 0 36 36">
                                <path className="text-gray-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                                <path className="text-green-500 drop-shadow-md" strokeDasharray={`${completionRatePct}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center flex-col">
                                <span className="text-2xl font-bold text-gray-900">{completionRatePct}%</span>
                                <span className="text-xs text-gray-500">Completed</span>
                            </div>
                        </div>
                        <div className="ml-8 flex-1">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-500">Pending</span>
                                <span className="font-medium text-gray-900">{pendingSchedules}</span>
                            </div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-500">Completed</span>
                                <span className="font-medium text-gray-900">{completedSchedules}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Total Schedules</span>
                                <span className="font-medium text-gray-900">{totalSchedules}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl p-6">
                    <h2 className="text-base font-semibold leading-6 text-gray-900 flex items-center mb-6">
                        <ChartPieIcon className="h-5 w-5 mr-2 text-blue-500" />
                        Activity Statistics
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-gray-600">Completion Rate</span>
                                <span className="font-medium text-gray-900">{completionRatePct}%</span>
                            </div>
                            <div className="overflow-hidden h-2 text-xs flex rounded bg-blue-100">
                                <div style={{ width: `${completionRatePct}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500"></div>
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-gray-600">Attendance Verified</span>
                                <span className="font-medium text-gray-900">{attendanceAvgPct}%</span>
                            </div>
                            <div className="overflow-hidden h-2 text-xs flex rounded bg-indigo-100">
                                <div style={{ width: `${attendanceAvgPct}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Activities Table */}
            <div className="mt-8 bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-200">
                    <h3 className="text-base font-semibold leading-6 text-gray-900">All Schedules & Activities</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-300">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-gray-900">Topic / Course</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">College</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Date & Time</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Day</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                                <th scope="col" className="relative py-3.5 pl-3 pr-6 sm:pr-0">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {loadingSchedules ? (
                                <tr>
                                    <td colSpan="6" className="py-4 text-center text-sm text-gray-500">Loading schedules...</td>
                                </tr>
                            ) : schedules.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="py-4 text-center text-sm text-gray-500">No schedules found.</td>
                                </tr>
                            ) : (
                                schedules.map((schedule) => (
                                    <tr key={schedule._id}>
                                        <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-medium text-gray-900">
                                            {schedule.courseId?.title || schedule.course?.title || schedule.subject || 'N/A'}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {schedule.collegeId?.name || schedule.college?.name || 'N/A'}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {new Date(schedule.scheduledDate).toLocaleDateString()} <br />
                                            <span className="text-xs text-gray-400">{schedule.startTime} - {schedule.endTime}</span>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {schedule.dayNumber === 0 ? 'Custom' : `Day ${schedule.dayNumber}`}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                                            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${schedule.status === 'completed' ? 'bg-green-50 text-green-700 ring-green-600/20' :
                                                schedule.status === 'cancelled' ? 'bg-red-50 text-red-700 ring-red-600/20' :
                                                    'bg-yellow-50 text-yellow-700 ring-yellow-600/20'
                                                }`}>
                                                {schedule.status || 'Scheduled'}
                                            </span>
                                        </td>
                                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                                            <button
                                                onClick={() => handleEdit(schedule)}
                                                className="text-indigo-600 hover:text-indigo-900 mr-4"
                                            >
                                                <PencilSquareIcon className="h-5 w-5" aria-hidden="true" />
                                                <span className="sr-only">Edit, {schedule.subject}</span>
                                            </button>
                                            <button
                                                onClick={() => handleDelete(schedule._id)}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                <TrashIcon className="h-5 w-5" aria-hidden="true" />
                                                <span className="sr-only">Delete, {schedule.subject}</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Schedule Calendar Modal */}
            {showCalendarModal ? (
                <div className="dashboard-modal-overlay fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
                    <div className="dashboard-modal-panel dashboard-modal-panel--wide flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-base font-semibold leading-6 text-gray-900 flex items-center">
                                <CalendarIcon className="h-5 w-5 mr-2 text-indigo-500" />
                                Schedule Calendar
                            </h2>
                            <button
                                type="button"
                                onClick={() => setShowCalendarModal(false)}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <span className="sr-only">Close calendar</span>
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="p-6 overflow-auto">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    {selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                </h3>
                                <div className="flex items-center rounded-md shadow-sm">
                                    <button
                                        type="button"
                                        onClick={() => handleCalendarMonthChange(-1)}
                                        className="relative inline-flex items-center rounded-l-md bg-white px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-10"
                                    >
                                        <span className="sr-only">Previous month</span>
                                        <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleCalendarMonthChange(1)}
                                        className="relative -ml-px inline-flex items-center rounded-r-md bg-white px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-10"
                                    >
                                        <span className="sr-only">Next month</span>
                                        <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 text-center text-xs font-semibold leading-6 text-gray-700 lg:flex-none">
                                <div className="bg-white py-2">S</div>
                                <div className="bg-white py-2">M</div>
                                <div className="bg-white py-2">T</div>
                                <div className="bg-white py-2">W</div>
                                <div className="bg-white py-2">T</div>
                                <div className="bg-white py-2">F</div>
                                <div className="bg-white py-2">S</div>
                            </div>
                            <div className="flex bg-gray-200 text-xs leading-6 text-gray-700 lg:flex-auto">
                                <div className="w-full grid grid-cols-7 gap-px">
                                    {calendarDays.map((day, dayIdx) => (
                                        <div key={dayIdx} className={classNames(
                                            day.isCurrentMonth ? 'bg-white' : 'bg-gray-50 text-gray-500',
                                            'relative min-h-[90px] px-3 py-2'
                                        )}>
                                            <time dateTime={day.date} className={day.isCurrentMonth ? 'font-semibold' : ''}>
                                                {day.day}
                                            </time>
                                            {day.events && day.events.length > 0 && (
                                                <ol className="mt-2">
                                                    {day.events.map((event) => (
                                                        <li key={event._id} className="mb-1">
                                                            <div className="group flex flex-col border-l-2 border-indigo-600 bg-indigo-50 p-1 text-xs hover:bg-opacity-75">
                                                                <p className="font-semibold truncate text-indigo-700">
                                                                    {event.courseId?.title || event.course?.title || event.subject || 'N/A'}
                                                                </p>
                                                                <p className="text-gray-600 truncate">{event.collegeId?.name || event.college?.name || 'N/A'}</p>
                                                                <p className="text-gray-500 truncate font-medium">
                                                                    {event.startTime} - {event.endTime}
                                                                </p>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ol>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Add Activity Modal */}
            {showModal ? (
                <div className="dashboard-modal-overlay dashboard-modal-scrollport fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-900/50 p-4 backdrop-blur-sm transition-opacity">
                    <div className="dashboard-modal-panel dashboard-modal-panel--wide flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
                        
                        {/* Header */}
                        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-transparent">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">{editingSchedule ? 'Edit Activity' : 'Assign Schedule'}</h3>
                                <p className="text-sm text-gray-500 mt-1">Configure schedule details and assign to days.</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <span className="sr-only">Close</span>
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body - Scrollable */}
                        <div className="flex-1 overflow-y-auto px-8 py-6">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
                                
                                {/* Left Column: Configuration Form (5 cols) */}
                                <div className="lg:col-span-5 space-y-6">
                                    
                                    <div className="space-y-5">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Company</label>
                                            <select
                                                className="block w-full rounded-xl border-gray-200 bg-gray-50/50 text-gray-900 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2.5 px-3 transition-colors hover:bg-white"
                                                value={newActivity.company}
                                                onChange={(e) => setNewActivity({
                                                    ...newActivity,
                                                    company: e.target.value,
                                                    course: '',
                                                    college: '',
                                                    department: ''
                                                })}
                                            >
                                                <option value="">Select Company</option>
                                                {associations.companies.map((c, i) => <option key={`${c.id}-${i}`} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Course</label>
                                            <select
                                                className="block w-full rounded-xl border-gray-200 bg-gray-50/50 text-gray-900 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2.5 px-3 transition-colors hover:bg-white"
                                                value={newActivity.course}
                                                onChange={(e) => {
                                                    const selectedCourseId = e.target.value;
                                                    const selectedCourse = associations.courses.find(c => c.id == selectedCourseId);
                                                    setNewActivity({
                                                        ...newActivity,
                                                        course: selectedCourseId,
                                                        company: selectedCourse?.companyId || newActivity.company,
                                                        college: '',
                                                        department: ''
                                                    });
                                                }}
                                            >
                                                <option value="">Select Course</option>
                                                {filteredCourses.map((c, i) => <option key={`${c.id}-${i}`} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">College</label>
                                            <select
                                                className="block w-full rounded-xl border-gray-200 bg-gray-50/50 text-gray-900 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2.5 px-3 transition-colors hover:bg-white"
                                                value={newActivity.college}
                                                onChange={(e) => setNewActivity({ ...newActivity, college: e.target.value, department: '' })}
                                                disabled={!newActivity.course}
                                            >
                                                <option value="">Select College</option>
                                                {filteredColleges.map((c, i) => <option key={`${c.id}-${i}`} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Department</label>
                                            <select
                                                className="block w-full rounded-xl border-gray-200 bg-gray-50/50 text-gray-900 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2.5 px-3 transition-colors hover:bg-white"
                                                value={newActivity.department}
                                                onChange={(e) => setNewActivity({ ...newActivity, department: e.target.value })}
                                                disabled={!newActivity.college}
                                            >
                                                <option value="">Select Department</option>
                                                {filteredDepartments.map((d, i) => <option key={`${d.id}-${i}`} value={d.id}>{d.name}</option>)}
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Start Time</label>
                                                <TimeInput12H
                                                    value={newActivity.startTime}
                                                    onChange={(val) => setNewActivity({ ...newActivity, startTime: val })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">End Time</label>
                                                <TimeInput12H
                                                    value={newActivity.endTime}
                                                    onChange={(val) => setNewActivity({ ...newActivity, endTime: val })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Day/Date Selection (7 cols) */}
                                <div className="lg:col-span-7 flex flex-col h-full border-t lg:border-t-0 lg:border-l border-gray-100 lg:pl-8 pt-8 lg:pt-0">
                                    
                                    {editingSchedule ? (
                                        <div className="space-y-4">
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Select Date</label>
                                            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100/50">
                                                <input
                                                    type="date"
                                                    className="block w-full rounded-lg border-gray-200 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-4 py-3"
                                                    value={newActivity.date}
                                                    onChange={(e) => setNewActivity({ ...newActivity, date: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-4 pt-4">
                                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Rescheduling Reason</label>
                                                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100/50">
                                                    <textarea
                                                        className="block w-full rounded-lg border-gray-200 focus:border-amber-500 focus:ring-amber-500 sm:text-sm px-4 py-3 bg-white"
                                                        placeholder="Please enter the reason for rescheduling..."
                                                        rows={3}
                                                        value={newActivity.rescheduleReason}
                                                        onChange={(e) => setNewActivity({ ...newActivity, rescheduleReason: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col h-full">
                                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex justify-between items-center">
                                                <span>Select Days & Dates</span>
                                                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                                    {selectedDays.length} Selected
                                                </span>
                                            </label>
                                            
                                            {/* Days Grid */}
                                            {!hasFullDayFilter ? (
                                                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-5 py-10 text-center">
                                                    <p className="text-sm font-semibold text-gray-700">
                                                        Select company, course, college, and department to load days
                                                    </p>
                                                </div>
                                            ) : loadingDepartmentDays ? (
                                                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-5 py-10 text-center">
                                                    <p className="text-sm font-semibold text-gray-700">
                                                        Loading day status from database
                                                    </p>
                                                </div>
                                            ) : !departmentDays.length ? (
                                                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-5 py-10 text-center">
                                                    <p className="text-sm font-semibold text-gray-700">
                                                        No day slots found for this department
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-3 gap-3">
                                                    {departmentDays.map(day => {
                                                        const dayNumber = Number(day.dayNumber);
                                                        const selectedInfo = selectedDays.find(d => d.dayId === dayNumber);
                                                        const isSelected = !!selectedInfo;
                                                        const dayStatus = normalizeStatus(day.status) || dayStatusMap[dayNumber] || 'not_assigned';
                                                        const dayColor = getDayColor(dayStatus);
                                                        const isCompleted = dayStatus === 'completed';
                                                        const isPending = dayStatus === 'pending';
                                                        const isSelectable = dayStatus === 'not_assigned';
                                                        const tooltipText = getDayTooltip(day);
                                                        const defaultDateValue = (() => {
                                                            if (day.date) {
                                                                const parsed = new Date(day.date);
                                                                if (!Number.isNaN(parsed.getTime())) {
                                                                    return parsed.toISOString().slice(0, 10);
                                                                }
                                                            }
                                                            const nextDate = new Date();
                                                            nextDate.setDate(nextDate.getDate() + dayNumber);
                                                            return nextDate.toISOString().slice(0, 10);
                                                        })();
                                                        const tileClasses = isSelected
                                                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                                            : dayColor === 'green'
                                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                : dayColor === 'orange'
                                                                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                                    : 'border-gray-100 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50';
                                                        const statusLabel = day.statusLabel || (isCompleted ? 'Completed' : isPending ? 'Pending' : 'Not assigned');
                                                        const statusBadgeClasses = dayColor === 'green'
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : dayColor === 'orange'
                                                                ? 'bg-amber-100 text-amber-700'
                                                                : 'bg-gray-100 text-gray-500';
                                                        
                                                        return (
                                                            <div
                                                                key={day.id || dayNumber}
                                                                title={tooltipText}
                                                                className={`relative group flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 ease-in-out ${tileClasses} ${isSelectable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                                                                onClick={(e) => {
                                                                    if (e.target.tagName === 'INPUT') return;

                                                                    if (isCompleted) {
                                                                        setSelectedStatusDay(day);
                                                                        setDayStatusMessage(null);
                                                                        return;
                                                                    }

                                                                    if (isPending) {
                                                                        setSelectedStatusDay(null);
                                                                        setDayStatusMessage({
                                                                            tone: 'warning',
                                                                            text: `${day.label || `Day ${dayNumber}`}: Upload Missing Docs`,
                                                                            detail: tooltipText,
                                                                        });
                                                                        return;
                                                                    }

                                                                    if (isSelected) {
                                                                        setSelectedDays(selectedDays.filter(d => d.dayId !== dayNumber));
                                                                        setDayStatusMessage(null);
                                                                    } else {
                                                                        setSelectedDays([...selectedDays, { dayId: dayNumber, label: day.label || `Day ${dayNumber}`, date: defaultDateValue }]);
                                                                        setDayStatusMessage({
                                                                            tone: 'info',
                                                                            text: `${day.label || `Day ${dayNumber}`}: Assign Trainer`,
                                                                            detail: tooltipText,
                                                                        });
                                                                    }
                                                                }}
                                                            >
                                                                <span className={`text-sm font-bold ${isSelected ? 'text-indigo-900' : isCompleted ? 'text-emerald-800' : isPending ? 'text-amber-800' : 'text-gray-700'}`}>
                                                                    {day.label || `Day ${dayNumber}`}
                                                                </span>
                                                                
                                                                <div className="mt-1 w-full flex flex-col items-center">
                                                                    {isSelected ? (
                                                                        <input 
                                                                            type="date"
                                                                            className="text-[10px] w-full border-none bg-transparent p-0 text-center font-medium focus:ring-0 text-indigo-600"
                                                                            value={selectedInfo.date}
                                                                            onChange={(e) => {
                                                                                const newDate = e.target.value;
                                                                                setSelectedDays(selectedDays.map(d => d.dayId === dayNumber ? { ...d, date: newDate } : d));
                                                                            }}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        />
                                                                    ) : (
                                                                        <span className="text-[10px] opacity-80">
                                                                            {(() => {
                                                                                if (day.date) {
                                                                                    const parsed = new Date(day.date);
                                                                                    if (!Number.isNaN(parsed.getTime())) {
                                                                                        return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                                                                    }
                                                                                }
                                                                                const nextDate = new Date();
                                                                                nextDate.setDate(nextDate.getDate() + dayNumber);
                                                                                return nextDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                                                            })()}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <span className={`mt-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClasses}`}>
                                                                    {statusLabel}
                                                                </span>
                                                                
                                                                {isCompleted ? (
                                                                    <div className="absolute top-2 right-2 text-emerald-600">
                                                                        <CheckCircleIcon className="h-5 w-5" />
                                                                    </div>
                                                                ) : isPending ? (
                                                                    <div className="absolute top-2 right-2 text-amber-500">
                                                                        <ClockIcon className="h-5 w-5" />
                                                                    </div>
                                                                ) : isSelected && (
                                                                    <div className="absolute top-2 right-2 h-2 w-2 bg-indigo-600 rounded-full animate-pulse" />
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {dayStatusMessage && (
                                                <div className={`mt-4 rounded-2xl border px-4 py-3 ${
                                                    dayStatusMessage.tone === 'warning'
                                                        ? 'border-amber-200 bg-amber-50'
                                                        : 'border-slate-200 bg-slate-50'
                                                }`}>
                                                    <p className={`text-sm font-semibold ${
                                                        dayStatusMessage.tone === 'warning' ? 'text-amber-800' : 'text-slate-800'
                                                    }`}>
                                                        {dayStatusMessage.text}
                                                    </p>
                                                    {dayStatusMessage.detail && (
                                                        <p className={`mt-1 text-xs ${
                                                            dayStatusMessage.tone === 'warning' ? 'text-amber-700' : 'text-slate-600'
                                                        }`}>
                                                            {dayStatusMessage.detail}
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            <div className="mt-6 pt-4 border-t border-gray-100">
                                                 <button
                                                    type="button"
                                                    onClick={handleAddToTempList}
                                                    disabled={selectedDays.length === 0}
                                                    className="w-full flex items-center justify-center space-x-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-gray-800 disabled:opacity-50 disabled:shadow-none transition-all hover:scale-[1.02] active:scale-[0.98]"
                                                >
                                                    <PlusIcon className="h-5 w-5" />
                                                    <span>Add {selectedDays.length} Days to List</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Staged Items / Footer */}
                        <div className="bg-gray-50 px-8 py-5 border-t border-gray-200">
                             {!editingSchedule && tempScheduleList.length > 0 ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Ready to Assign ({tempScheduleList.length})</h4>
                                        <button 
                                            onClick={() => setTempScheduleList([])} 
                                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                                        >
                                            Clear All
                                        </button>
                                    </div>
                                    
                                    {/* Horizontal Scroll List */}
                                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide py-1">
                                        {tempScheduleList.map((item, idx) => (
                                            <div key={idx} className="flex-none w-64 bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col relative group">
                                                <div className="flex justify-between items-start mb-1">
                                                     <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                                                        {item.dayLabel || 'Custom'}
                                                    </span>
                                                    <button onClick={() => handleRemoveFromTemp(item.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                                                        <TrashIcon className="h-4 w-4" />
                                                    </button>
                                                </div>
                                                <p className="text-xs font-bold text-gray-900 truncate mb-0.5">{item.course || item.subject}</p>
                                                <p className="text-[10px] text-gray-500 truncate">{item.college}</p>
                                                <p className="text-[10px] text-gray-500 truncate">{item.department || 'No department'}</p>
                                                <p className="text-[10px] text-gray-400 mt-1">{item.time}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="border-t border-gray-200 pt-3 flex justify-end">
                                         <button
                                            type="button"
                                            onClick={handleFinalSubmit}
                                            disabled={loading}
                                            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow-lg hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-all transform hover:-translate-y-0.5"
                                        >
                                            {loading ? 'Processing...' : 'Confirm Assignment'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex justify-between items-center text-sm text-gray-500">
                                    <p>Configure details above and add days to the list.</p>
                                    
                                     {editingSchedule && (
                                         <button
                                            type="button"
                                            onClick={handleFinalSubmit}
                                            disabled={loading}
                                            className="inline-flex rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-500"
                                        >
                                            Update Schedule
                                        </button>
                                     )}
                                     
                                     {!editingSchedule && (
                                        <button
                                            type="button"
                                            onClick={() => setShowModal(false)}
                                            className="text-gray-600 hover:text-gray-900 font-medium px-4"
                                        >
                                            Cancel
                                        </button>
                                     )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
            {selectedStatusDay ? (
                <DayDetailsModal
                    open={!!selectedStatusDay}
                    onClose={() => setSelectedStatusDay(null)}
                    day={selectedStatusDay}
                    college={{ name: selectedCollegeName }}
                    trainers={[]}
                />
            ) : null}
            {/* Bulk Upload Modal */}
            {showBulkModal ? (
                <BulkUploadModal 
                    show={showBulkModal} 
                    onClose={() => setShowBulkModal(false)} 
                    onRefresh={refreshTrainerAnalyticsData}
                    trainerId={trainerRouteId}
                />
            ) : null}
        </div>
    );
};

export default TrainerAnalytics;
