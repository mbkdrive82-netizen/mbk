"use client";

import { useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    AcademicCapIcon, 
    BuildingOfficeIcon, 
    UserGroupIcon, 
    CalendarDaysIcon,
    ClockIcon,
    PencilSquareIcon, 
    TrashIcon, 
    PlusIcon, 
    ArrowLeftIcon,
    UserIcon,
    XMarkIcon,
    MagnifyingGlassIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline';
import { api } from '@/services/api';
import { notify } from '@/lib/toast';
import { getTrainers } from '@/services/trainerService';
import HierarchyBreadcrumb from '@/components/common/HierarchyBreadcrumb';
import DayDetailsModal from '@/components/modals/DayDetailsModal';

const BatchManagement = () => {
    const router = useRouter();
    const params = useParams();
    const queryClient = useQueryClient();

    const companyId = params?.companyId || params?.id;
    const courseId = params?.courseId;
    const collegeId = params?.collegeId;

    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [editingBatch, setEditingBatch] = useState(null);

    // Form state
    const [batchName, setBatchName] = useState('');
    const [batchCode, setBatchCode] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [capacity, setCapacity] = useState(60);
    const [sessionType, setSessionType] = useState('Both');
    const [endSessionType, setEndSessionType] = useState('Both');
    const [status, setStatus] = useState('active');
    const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState('Monday');
    const [scheduleStartTime, setScheduleStartTime] = useState('09:00');
    const [scheduleEndTime, setScheduleEndTime] = useState('17:00');
    const [selectedTrainers, setSelectedTrainers] = useState([]);

    // Student Assignment State
    const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
    const [activeBatchForStudents, setActiveBatchForStudents] = useState(null);
    const [studentSearchTerm, setStudentSearchTerm] = useState('');
    const [assignedStudentIds, setAssignedStudentIds] = useState([]);

    // Attendance View State
    const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
    const [activeBatchForAttendance, setActiveBatchForAttendance] = useState(null);
    const [selectedDayLog, setSelectedDayLog] = useState(null);
    const [isDayDetailsOpen, setIsDayDetailsOpen] = useState(false);

    // Queries
    const { data: collegeDetails } = useQuery({
        queryKey: ['admin', 'college-details', collegeId],
        enabled: Boolean(collegeId),
        queryFn: () => api.get(`/colleges/${collegeId}/details`),
        staleTime: 60 * 1000
    });

    const college = collegeDetails?.college || null;
    const courseTitle = college?.courseId?.title || college?.courseId?.name || 'Course';

    const { data: batches = [], isPending: loadingBatches, refetch: refetchBatches } = useQuery({
        queryKey: ['admin', 'batches', courseId, collegeId],
        enabled: Boolean(courseId && collegeId),
        queryFn: () => api.get(`/batches?courseId=${courseId}&collegeId=${collegeId}`),
        staleTime: 15 * 1000
    });

    const { data: allTrainersResponse } = useQuery({
        queryKey: ['admin', 'all-trainers'],
        queryFn: () => getTrainers(),
        staleTime: 5 * 60 * 1000
    });

    const allTrainers = useMemo(() => {
        const payload = allTrainersResponse?.data || allTrainersResponse || [];
        return Array.isArray(payload) ? payload : [];
    }, [allTrainersResponse]);

    const { data: studentsResponse } = useQuery({
        queryKey: ['admin', 'college-students', collegeId],
        enabled: Boolean(collegeId),
        queryFn: () => api.get(`/students/college/${collegeId}`),
        staleTime: 60 * 1000
    });

    const collegeStudents = useMemo(() => {
        const payload = studentsResponse?.data || studentsResponse || [];
        return Array.isArray(payload) ? payload : [];
    }, [studentsResponse]);

    const { data: batchAttendance = [], refetch: refetchBatchAttendance } = useQuery({
        queryKey: ['admin', 'batch-attendance', activeBatchForAttendance?._id],
        enabled: Boolean(activeBatchForAttendance?._id),
        queryFn: () => api.get(`/batches/${activeBatchForAttendance?._id}/attendance`)
    });

    // Mutations
    const saveBatchMutation = useMutation({
        mutationFn: async (payload) => {
            if (editingBatch) {
                return api.put(`/batches/${editingBatch._id}`, payload);
            } else {
                return api.post('/batches', payload);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'batches', courseId, collegeId] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'college-stats'] });
            setIsBatchModalOpen(false);
            notify.success(editingBatch ? 'Batch updated successfully!' : 'Batch created successfully!');
            resetForm();
        },
        onError: (err) => {
            notify.error(err.response?.data?.message || err.message || 'Failed to save batch');
        }
    });

    const deleteBatchMutation = useMutation({
        mutationFn: (id) => api.delete(`/batches/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'batches', courseId, collegeId] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'college-stats'] });
            notify.success('Batch deleted successfully!');
        },
        onError: (err) => {
            notify.error(err.response?.data?.message || err.message || 'Failed to delete batch');
        }
    });

    const saveStudentsMutation = useMutation({
        mutationFn: ({ batchId, studentIds }) => api.post(`/batches/${batchId}/students`, { studentIds }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'batches', courseId, collegeId] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'college-stats'] });
            setIsStudentModalOpen(false);
            notify.success('Students assigned successfully!');
        },
        onError: (err) => {
            notify.error(err.response?.data?.message || err.message || 'Failed to assign students');
        }
    });

    // Helpers
    const resetForm = () => {
        setBatchName('');
        setBatchCode('');
        setStartDate('');
        setEndDate('');
        setCapacity(60);
        setSessionType('Both');
        setEndSessionType('Both');
        setStatus('active');
        setScheduleDayOfWeek('Monday');
        setScheduleStartTime('09:00');
        setScheduleEndTime('17:00');
        setSelectedTrainers([]);
        setEditingBatch(null);
    };

    const handleOpenCreateModal = () => {
        resetForm();
        setIsBatchModalOpen(true);
    };

    const handleOpenEditModal = (batch) => {
        setEditingBatch(batch);
        setBatchName(batch.batchName || '');
        setBatchCode(batch.batchCode || '');
        setStartDate(batch.startDate ? new Date(batch.startDate).toISOString().split('T')[0] : '');
        setEndDate(batch.endDate ? new Date(batch.endDate).toISOString().split('T')[0] : '');
        setCapacity(batch.capacity || 60);
        setSessionType(batch.sessionType || 'Both');
        setEndSessionType(batch.endSessionType || 'Both');
        setStatus(batch.status || 'active');
        setScheduleDayOfWeek(batch.scheduleDayOfWeek || 'Monday');
        setScheduleStartTime(batch.scheduleStartTime || '09:00');
        setScheduleEndTime(batch.scheduleEndTime || '17:00');
        setSelectedTrainers(batch.trainerIds?.map(t => t._id || t) || []);
        setIsBatchModalOpen(true);
    };

    const handleDeleteBatch = (id, name) => {
        if (window.confirm(`Are you sure you want to delete batch "${name}"?`)) {
            deleteBatchMutation.mutate(id);
        }
    };

    const handleSaveBatch = (e) => {
        e.preventDefault();
        const payload = {
            courseId,
            collegeId,
            batchName,
            batchCode: batchCode || undefined, // Send undefined to auto-generate
            startDate: startDate || null,
            endDate: endDate || null,
            capacity: Number(capacity),
            sessionType,
            endSessionType,
            status,
            scheduleDayOfWeek,
            scheduleStartTime,
            scheduleEndTime,
            trainerIds: selectedTrainers
        };
        saveBatchMutation.mutate(payload);
    };

    const handleOpenStudentModal = (batch) => {
        setActiveBatchForStudents(batch);
        setAssignedStudentIds(batch.students || []);
        setStudentSearchTerm('');
        setIsStudentModalOpen(true);
    };

    const handleToggleStudent = (studentId) => {
        setAssignedStudentIds(prev => 
            prev.includes(studentId) 
                ? prev.filter(id => id !== studentId) 
                : [...prev, studentId]
        );
    };

    const handleSaveStudents = () => {
        if (!activeBatchForStudents) return;
        saveStudentsMutation.mutate({
            batchId: activeBatchForStudents._id,
            studentIds: assignedStudentIds
        });
    };

    const handleOpenAttendanceModal = (batch) => {
        setActiveBatchForAttendance(batch);
        setIsAttendanceModalOpen(true);
    };

    const filteredStudents = useMemo(() => {
        if (!studentSearchTerm) return collegeStudents;
        const lower = studentSearchTerm.toLowerCase();
        return collegeStudents.filter(s => 
            s.fullName?.toLowerCase().includes(lower) || 
            s.email?.toLowerCase().includes(lower) ||
            s.rollNo?.toLowerCase().includes(lower) ||
            s.registerNo?.toLowerCase().includes(lower)
        );
    }, [collegeStudents, studentSearchTerm]);

    // Find student counts mapped to other batches
    const studentBatchMappings = useMemo(() => {
        const mapping = {};
        batches.forEach(b => {
            b.students?.forEach(sId => {
                mapping[sId] = b.batchName;
            });
        });
        return mapping;
    }, [batches]);

    const breadcrumbItems = [
        { label: 'Company', value: college?.companyId?.name || 'Company', to: '/dashboard/companies' },
        { label: 'Course', value: courseTitle, to: `/dashboard/companies/${companyId}/courses/${courseId}` },
        { label: 'College', value: college?.name || 'College', to: `/dashboard/companies/${companyId}/courses/${courseId}` },
        { label: 'Batches', value: `${batches.length} Batches` }
    ];

    return (
        <div className="min-h-screen bg-slate-50/50">
            {/* Header */}
            <div className="bg-white border-b border-slate-100 py-6 mb-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center mb-4">
                        <button
                            onClick={() => router.push(`/dashboard/companies/${companyId}/courses/${courseId}`)}
                            className="flex items-center text-slate-600 hover:text-slate-900 transition-colors font-medium text-sm"
                        >
                            <ArrowLeftIcon className="h-4 w-4 mr-2" />
                            Back to Course colleges
                        </button>
                        <button
                            onClick={() => refetchBatches()}
                            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 text-sm font-semibold transition-colors"
                        >
                            <ArrowPathIcon className="h-4 w-4" />
                            Refresh
                        </button>
                    </div>
                    <HierarchyBreadcrumb items={breadcrumbItems} />
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6">
                        <div>
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight">{college?.name || 'College'}</h1>
                            <p className="text-slate-500 text-sm font-medium mt-1">
                                Course: <span className="text-indigo-600 font-bold">{courseTitle}</span> • Batch list and details.
                            </p>
                        </div>
                        <button
                            onClick={handleOpenCreateModal}
                            className="inline-flex items-center justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-indigo-100 active:scale-95 shrink-0"
                        >
                            <PlusIcon className="h-5 w-5 mr-1.5" />
                            Create Batch
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-xs">
                        <div className="flex items-center">
                            <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
                                <AcademicCapIcon className="h-6 w-6" />
                            </div>
                            <div className="ml-4">
                                <span className="block text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Batches</span>
                                <span className="text-2xl font-black text-slate-800">{batches.length}</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-xs">
                        <div className="flex items-center">
                            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
                                <UserGroupIcon className="h-6 w-6" />
                            </div>
                            <div className="ml-4">
                                <span className="block text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Students</span>
                                <span className="text-2xl font-black text-slate-800">
                                    {batches.reduce((acc, curr) => acc + (curr.students?.length || 0), 0)}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-xs">
                        <div className="flex items-center">
                            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
                                <UserIcon className="h-6 w-6" />
                            </div>
                            <div className="ml-4">
                                <span className="block text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Trainers</span>
                                <span className="text-2xl font-black text-slate-800">
                                    {[...new Set(batches.flatMap(b => b.trainerIds?.map(t => t._id || t) || []))].length}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Batches Cards Grid */}
                {loadingBatches ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
                        <p className="text-slate-400 text-sm font-medium">Loading batches...</p>
                    </div>
                ) : batches.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {batches.map((batch) => {
                            const activeTrainers = batch.trainerIds || [];
                            const stdCount = batch.students?.length || 0;
                            const isOverCapacity = stdCount > (batch.capacity || 60);

                            return (
                                <div key={batch._id} className="bg-white rounded-2xl border border-slate-100 hover:shadow-lg transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-xs">
                                    {/* Card Header */}
                                    <div className="p-5 border-b border-slate-50 flex items-start justify-between">
                                        <div>
                                            <h3 className="text-base font-extrabold text-slate-800">{batch.batchName}</h3>
                                            <span className="inline-block bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded mt-1.5 uppercase tracking-wider">
                                                Code: {batch.batchCode}
                                            </span>
                                        </div>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ring-1 ring-inset ${
                                            batch.status === 'active' 
                                                ? 'bg-green-50 text-green-700 ring-green-600/20' 
                                                : batch.status === 'completed'
                                                ? 'bg-slate-50 text-slate-600 ring-slate-500/10'
                                                : 'bg-indigo-50 text-indigo-700 ring-indigo-600/10'
                                        }`}>
                                            {batch.status}
                                        </span>
                                    </div>

                                    {/* Card Details */}
                                    <div className="p-5 flex-1 space-y-4">
                                        {/* Dates */}
                                        <div className="flex gap-4 text-xs text-slate-500 font-medium">
                                            <div className="flex items-center">
                                                <CalendarDaysIcon className="h-4 w-4 mr-1 text-slate-400" />
                                                <span>Start: {batch.startDate ? new Date(batch.startDate).toLocaleDateString() : 'N/A'}</span>
                                            </div>
                                            <div className="flex items-center">
                                                <ClockIcon className="h-4 w-4 mr-1 text-slate-400" />
                                                <span>End: {batch.endDate ? new Date(batch.endDate).toLocaleDateString() : 'N/A'}</span>
                                            </div>
                                        </div>

                                        {/* Capacity Tracker */}
                                        <div>
                                            <div className="flex justify-between items-center text-xs font-bold text-slate-600 mb-1.5">
                                                <span> Roster Capacity </span>
                                                <span className={isOverCapacity ? 'text-red-500' : 'text-slate-800'}>
                                                    {stdCount} / {batch.capacity || 60}
                                                </span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                <div 
                                                    className={`h-full rounded-full transition-all duration-300 ${
                                                        isOverCapacity ? 'bg-red-500' : 'bg-indigo-600'
                                                    }`}
                                                    style={{ width: `${Math.min(100, (stdCount / (batch.capacity || 60)) * 100)}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Trainers Assigned */}
                                        <div>
                                            <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Trainers Assigned</span>
                                            {activeTrainers.length > 0 ? (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {activeTrainers.map(trainer => (
                                                        <span key={trainer._id} className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-xs font-bold text-indigo-700">
                                                            {trainer.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400 font-medium">No trainers assigned yet.</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card Actions */}
                                    <div className="px-5 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => handleOpenStudentModal(batch)}
                                                className="inline-flex items-center bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                                            >
                                                Manage Students
                                            </button>
                                            <button
                                                onClick={() => handleOpenAttendanceModal(batch)}
                                                className="inline-flex items-center bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                                            >
                                                Attendance
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleOpenEditModal(batch)}
                                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                title="Edit Batch"
                                            >
                                                <PencilSquareIcon className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteBatch(batch._id, batch.batchName)}
                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete Batch"
                                            >
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="bg-white rounded-3xl border border-dashed border-slate-200 py-16 text-center max-w-lg mx-auto shadow-xs mt-12">
                        <BuildingOfficeIcon className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-600 font-bold text-lg mb-1">No batches found</p>
                        <p className="text-slate-400 text-sm mb-4 px-6">
                            Create your first training batch under this college and course to organize trainers and student rosters.
                        </p>
                        <button
                            onClick={handleOpenCreateModal}
                            className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow"
                        >
                            Create First Batch
                        </button>
                    </div>
                )}
            </div>

            {/* Batch Creation / Edit Modal */}
            {isBatchModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-lg font-black text-slate-800">
                                {editingBatch ? 'Edit Batch' : 'Create Batch'}
                            </h2>
                            <button onClick={() => setIsBatchModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSaveBatch} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Batch Name</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Batch 1"
                                    value={batchName}
                                    onChange={(e) => setBatchName(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            {editingBatch && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Batch Code (Auto Generated)</label>
                                    <input
                                        type="text"
                                        disabled
                                        value={batchCode}
                                        className="w-full px-3 py-2 border border-slate-100 bg-slate-50 text-slate-400 rounded-xl text-sm focus:outline-none"
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="flex items-center text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                                        <CalendarDaysIcon className="h-4 w-4 mr-1 text-slate-400" /> Timeline
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 flex items-center border border-slate-200 rounded-xl focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 bg-white overflow-hidden relative">
                                            <span className="pl-3 text-slate-400 text-[10px] font-bold uppercase tracking-wider shrink-0">
                                                Start
                                            </span>
                                            <input
                                                type="date"
                                                value={startDate}
                                                onChange={(e) => setStartDate(e.target.value)}
                                                className="flex-1 pl-3 pr-1 py-2 text-sm focus:outline-none bg-transparent"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setSessionType(prev => prev === 'Both' ? 'FN' : prev === 'FN' ? 'AN' : 'Both')}
                                                className={`px-3 py-2 text-[11px] font-bold border-l border-slate-200 transition-colors shrink-0 ${
                                                    sessionType !== 'Both' 
                                                        ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' 
                                                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                                                }`}
                                                title="Toggle Session (Both / FN / AN)"
                                            >
                                                {sessionType === 'Both' ? 'Both' : sessionType}
                                            </button>
                                        </div>
                                        <div className="relative flex-1 flex items-center border border-slate-200 rounded-xl focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 bg-white overflow-hidden">
                                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                                                End
                                            </span>
                                            <input
                                                type="date"
                                                value={endDate}
                                                onChange={(e) => setEndDate(e.target.value)}
                                                className="w-full pl-12 pr-1 py-2 text-sm focus:outline-none bg-transparent"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setEndSessionType(prev => prev === 'Both' ? 'FN' : prev === 'FN' ? 'AN' : 'Both')}
                                                className={`px-3 py-2 text-[11px] font-bold border-l border-slate-200 transition-colors shrink-0 ${
                                                    endSessionType !== 'Both' 
                                                        ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' 
                                                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                                                }`}
                                                title="Toggle End Session (Both / FN / AN)"
                                            >
                                                {endSessionType === 'Both' ? 'Both' : endSessionType}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Students</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={capacity}
                                        onChange={(e) => setCapacity(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Status</label>
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                    >
                                        <option value="active">Active</option>
                                        <option value="completed">Completed</option>
                                        <option value="upcoming">Upcoming</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Schedule Day</label>
                                    <select
                                        value={scheduleDayOfWeek}
                                        onChange={(e) => setScheduleDayOfWeek(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                    >
                                        <option value="Monday">Monday</option>
                                        <option value="Tuesday">Tuesday</option>
                                        <option value="Wednesday">Wednesday</option>
                                        <option value="Thursday">Thursday</option>
                                        <option value="Friday">Friday</option>
                                        <option value="Saturday">Saturday</option>
                                        <option value="Sunday">Sunday</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Start Time</label>
                                    <input
                                        type="time"
                                        value={scheduleStartTime}
                                        onChange={(e) => setScheduleStartTime(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">End Time</label>
                                    <input
                                        type="time"
                                        value={scheduleEndTime}
                                        onChange={(e) => setScheduleEndTime(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Assign Trainers</label>
                                <div className="max-h-28 overflow-y-auto border border-slate-200 rounded-xl p-2.5 space-y-2">
                                    {allTrainers.map(trainer => (
                                        <label key={trainer._id} className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={selectedTrainers.includes(trainer._id)}
                                                onChange={() => {
                                                    setSelectedTrainers(prev => 
                                                        prev.includes(trainer._id) 
                                                            ? prev.filter(id => id !== trainer._id) 
                                                            : [...prev, trainer._id]
                                                    );
                                                }}
                                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            {trainer.name} ({trainer.email})
                                        </label>
                                    ))}
                                    {allTrainers.length === 0 && (
                                        <span className="text-xs text-slate-400">No trainers found in system.</span>
                                    )}
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsBatchModalOpen(false)}
                                    className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saveBatchMutation.isPending}
                                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md shadow-indigo-50"
                                >
                                    {saveBatchMutation.isPending ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Student Assignment Modal */}
            {isStudentModalOpen && activeBatchForStudents && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black text-slate-800">
                                    Manage Roster - {activeBatchForStudents.batchName}
                                </h2>
                                <p className="text-xs text-slate-400 font-semibold mt-1">
                                    Total Selected: {assignedStudentIds.length} / {activeBatchForStudents.capacity || 60}
                                </p>
                            </div>
                            <button onClick={() => setIsStudentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Search and Filters */}
                        <div className="p-4 bg-slate-50 border-b border-slate-100">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <MagnifyingGlassIcon className="h-4 w-4 text-slate-400" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search by student name, roll number, or email..."
                                    value={studentSearchTerm}
                                    onChange={(e) => setStudentSearchTerm(e.target.value)}
                                    className="block w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl leading-5 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                />
                            </div>
                        </div>

                        {/* Student Lists */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-3">
                            {filteredStudents.map(student => {
                                const isAssigned = assignedStudentIds.includes(student._id);
                                const otherBatchName = studentBatchMappings[student._id];
                                const isMappedElsewhere = otherBatchName && otherBatchName !== activeBatchForStudents.batchName;

                                return (
                                    <div 
                                        key={student._id} 
                                        onClick={() => handleToggleStudent(student._id)}
                                        className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all duration-200 select-none ${
                                            isAssigned 
                                                ? 'bg-indigo-50/55 border-indigo-200 shadow-sm' 
                                                : 'bg-white border-slate-200/80 hover:bg-slate-50/50'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-extrabold text-sm text-slate-800 truncate">{student.fullName}</span>
                                                {student.rollNo && (
                                                    <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.25 rounded">
                                                        {student.rollNo}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="block text-xs text-slate-400 truncate mt-0.5">{student.email}</span>
                                            {isMappedElsewhere && (
                                                <span className="inline-block bg-amber-50 border border-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.25 rounded mt-1.5">
                                                    ⚠️ Assigned to {otherBatchName}
                                                </span>
                                            )}
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={isAssigned}
                                            readOnly
                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0 ml-4 h-4 w-4 pointer-events-none"
                                        />
                                    </div>
                                );
                            })}
                            {filteredStudents.length === 0 && (
                                <div className="text-center py-8 text-slate-400 text-sm">
                                    No students found for this college.
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsStudentModalOpen(false)}
                                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-100 bg-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveStudents}
                                disabled={saveStudentsMutation.isPending}
                                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md shadow-indigo-50"
                            >
                                {saveStudentsMutation.isPending ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Attendance Integration Modal */}
            {isAttendanceModalOpen && activeBatchForAttendance && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-2xl w-full overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black text-slate-800">
                                    Batch Attendance Log
                                </h2>
                                <p className="text-xs text-slate-400 font-semibold mt-1">
                                    {activeBatchForAttendance.batchName} ({activeBatchForAttendance.batchCode})
                                </p>
                            </div>
                            <button onClick={() => setIsAttendanceModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {batchAttendance.length > 0 ? (
                                <div className="border border-slate-100 rounded-xl overflow-hidden shadow-xs">
                                    <table className="min-w-full divide-y divide-slate-100">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Trainer</th>
                                                <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Att. Ratio</th>
                                                <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-slate-100">
                                            {batchAttendance.map((log) => (
                                                <tr key={log._id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-4 py-3.5 whitespace-nowrap text-sm font-semibold text-slate-700">
                                                        {new Date(log.date).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap text-sm text-slate-600">
                                                        {log.trainerId?.name || 'Unknown'}
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap text-center text-sm font-bold text-slate-700">
                                                        {log.studentsPresent} Present / {log.studentsAbsent} Absent
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap text-center">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ring-1 ring-inset ${
                                                            log.status === 'Present' || log.attendanceStatus === 'PRESENT'
                                                                ? 'bg-green-50 text-green-700 ring-green-600/20'
                                                                : 'bg-red-50 text-red-700 ring-red-600/20'
                                                        }`}>
                                                            {log.status || 'Absent'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap text-right text-sm">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedDayLog(log);
                                                                setIsDayDetailsOpen(true);
                                                            }}
                                                            className="text-indigo-600 hover:text-indigo-800 font-bold"
                                                        >
                                                            View Details
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-slate-400 text-sm font-medium">
                                    No attendance sessions have been logged for this batch yet.
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
                            <button
                                onClick={() => setIsAttendanceModalOpen(false)}
                                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Individual Day Attendance Details Modal */}
            {isDayDetailsOpen && selectedDayLog && (
                <DayDetailsModal
                    isOpen={isDayDetailsOpen}
                    onClose={() => setIsDayDetailsOpen(false)}
                    dayData={selectedDayLog}
                    refreshData={() => {
                        refetchBatchAttendance();
                    }}
                />
            )}
        </div>
    );
};

export default BatchManagement;
