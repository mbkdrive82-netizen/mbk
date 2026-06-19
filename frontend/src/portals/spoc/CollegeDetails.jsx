"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { ArrowLeftIcon } from '@heroicons/react/24/outline';
// import BatchModal from '@/components/BatchModal';
import DayDetailsModal from '@/components/modals/DayDetailsModal';
import HierarchySidebar from '@/components/common/HierarchySidebar';
import {
  clearTrainerDashboardScheduleSummaryCache,
  clearTrainerDashboardSnapshot,
  signalTrainerDashboardRefresh,
  normalizeTrainerId,
} from '@/portals/trainer/dashboard/dashboardUtils';
import HierarchyBreadcrumb from '@/components/common/HierarchyBreadcrumb';
import { api } from '@/services/api';
import { notify } from '@/lib/toast';

const MOCK_COLLEGE = {
    id: 1,
    name: 'Loading...',
    spocName: 'Loading...',
    spocPhone: '',
    spocEmail: '',
    course: ''
};

const resolveTrainerId = (trainerField) => {
    const normalizedId = normalizeTrainerId(trainerField);
    return normalizedId || null;
};

const CollegeDetails = () => {
    const { id } = useParams();
    const router = useRouter();
    const [college, setCollege] = useState(MOCK_COLLEGE);
    const [days, setDays] = useState([]);
    const [trainers, setTrainers] = useState([]);
    const [activeDepartmentId, setActiveDepartmentId] = useState(null);
    const [selectedDay, setSelectedDay] = useState(null);
    const [isDayModalOpen, setIsDayModalOpen] = useState(false);

    const [error, setError] = useState(null);
    const detailsEndpoint = `/colleges/${id}/details`;
    const completedDays = days.filter((d) => d.status === 'Completed').length;
    const progressPercentage = days.length ? Math.round((completedDays / days.length) * 100) : 0;
    const scrollToSection = (sectionId) => {
        const section = document.getElementById(sectionId);
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const hierarchyItems = [
        { label: 'Company', value: college?.companyId?.name || 'Company', to: '/spoc/colleges' },
        { label: 'Course', value: college?.courseId?.title || college?.courseId?.name || college?.course || 'Course', to: '/spoc/colleges' },
        { label: 'College', value: college?.name || 'College', onClick: () => scrollToSection('college-section') },
        { label: 'Department', value: college?.department || 'General', onClick: () => scrollToSection('department-section') },
    ];

    useEffect(() => {
        const fetchData = async () => {
            try {
                setError(null);
                const response = await api.get(detailsEndpoint);
                if (response.college) {
                    setCollege(response.college);
                    setDays(response.days || []);
                    setTrainers(response.trainers || []);
                    setActiveDepartmentId(response.activeDepartmentId || null);
                }
            } catch (error) {
                console.error("Error fetching college details:", error);
                setError(error.message || "Failed to load college details");
            }
        };

        if (id) {
            fetchData();
        }
    }, [id, detailsEndpoint]);

    // const handleAddBatch = () => {
    //     setSelectedBatch(null);
    //     setIsBatchModalOpen(true);
    // };

    // const handleEditBatch = (batch) => {
    //     setSelectedBatch(batch);
    //     setIsBatchModalOpen(true);
    // };

    const handleDayClick = (day) => {
        setSelectedDay(day);
        setIsDayModalOpen(true);
    };

    const handleVerification = async (dayId, status) => {
        try {
            // Find the day to get attendanceId
            const day = days.find(d => d.id === dayId);
            if (!day) return;

            // If no attendance record exists, create one manually
            if (!day.attendanceId) {
                console.log('No attendance record found. Creating manual entry...');

                // Validation: Ensure Trainer and Date are present
                if (!day.trainerId) {
                    notify.error('Cannot verify: Missing Trainer. Please edit the day details to assign a Trainer.');
                    return;
                }
                if (!day.date) {
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
                    verificationStatus: status,
                    approvedBy: approvedBy
                };

                const response = await api.post('/attendance/manual', payload);
                if (response.success) {
                    // Update local state
                    const newAttendance = response.data;
                    setDays(prevDays => prevDays.map(d =>
                        d.id === dayId ? {
                            ...d,
                            attendanceId: newAttendance._id,
                            verificationStatus: status,
                            status: status === 'Approved' ? 'Completed' : d.status,
                            approvedBy: approvedBy
                        } : d
                    ));
                    if (selectedDay?.id === dayId) {
                        setSelectedDay(prev => ({
                            ...prev,
                            attendanceId: newAttendance._id,
                            verificationStatus: status,
                            status: status === 'Approved' ? 'Completed' : prev.status,
                            approvedBy: approvedBy
                        }));
                    }
                    notify.success(`Attendance manually created and ${status}`);
                }
                return;
            }

            // Existing attendance record - Update status
            let approvedBy = day.approvedBy;
            if (status === 'Approved' && !approvedBy) {
                approvedBy = prompt('Enter your name (Approved By):');
                if (!approvedBy || !approvedBy.trim()) {
                    notify.error('Approved By name is required');
                    return;
                }
            }

            await api.put(`/attendance/${day.attendanceId}/verify`, {
                status,
                approvedBy
            });

            // Update local state
            setDays(prevDays =>
                prevDays.map(d =>
                    d.id === dayId
                        ? {
                            ...d,
                            verificationStatus: status,
                            status: status === 'Approved' ? 'Completed' : d.status,
                            approvedBy: approvedBy
                        }
                        : d
                )
            );

            if (selectedDay?.id === dayId) {
                setSelectedDay(prev => ({
                    ...prev,
                    verificationStatus: status,
                    status: status === 'Approved' ? 'Completed' : prev.status,
                    approvedBy: approvedBy
                }));
            }

        } catch (error) {
            console.error('Error verifying attendance:', error);
            notify.error('Failed to update verification status');
        }
    };

    // const handleSaveBatch = (formData) => {
    //     if (selectedBatch) {
    //         setBatches((batches || []).map(b => b.id === selectedBatch.id ? { ...b, ...formData } : b));
    //     } else {
    //         setBatches([...(batches || []), { id: Date.now(), ...formData }]);
    //     }
    // };

    return (
        <div className="px-4 sm:px-6 lg:px-8">
            <div className="mb-6">
                <button
                    onClick={() => router.back()}
                    className="flex items-center text-sm text-gray-500 hover:text-gray-700"
                >
                    <ArrowLeftIcon className="h-4 w-4 mr-1" />
                    Back to Colleges
                </button>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-50 text-red-800 rounded-md">
                    <p className="text-sm">{error}</p>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="lg:col-span-3">
                    <HierarchySidebar
                        companyName={college?.companyId?.name || 'Company'}
                        courseName={college?.courseId?.title || college?.courseId?.name || college?.course || 'Course'}
                        collegeName={college?.name || 'College'}
                        departmentName={college?.department || 'General'}
                        days={days}
                        selectedDayId={selectedDay?.id}
                        onSelectDay={handleDayClick}
                    />
                </div>

                <div className="space-y-6 lg:col-span-9">
                    <HierarchyBreadcrumb items={hierarchyItems} />

                    {/* College Header Info */}
                    <div id="college-section" className="bg-white shadow overflow-hidden sm:rounded-lg">
                        <div className="px-4 py-5 sm:px-6">
                            <h3 className="text-lg leading-6 font-medium text-gray-900">College & Department Details</h3>
                            <p className="mt-1 max-w-2xl text-sm text-gray-500">Structured as Company &gt; Course &gt; College &gt; Department.</p>
                        </div>
                        <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                            <dl className="sm:divide-y sm:divide-gray-200">
                                <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                                    <dt className="text-sm font-medium text-gray-500">College Name</dt>
                                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{college?.name || 'Loading...'}</dd>
                                </div>
                                <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                                    <dt className="text-sm font-medium text-gray-500">Course</dt>
                                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{college?.courseId?.title || college?.courseId?.name || college?.course || 'N/A'}</dd>
                                </div>
                                <div id="department-section" className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                                    <dt className="text-sm font-medium text-gray-500">Department</dt>
                                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{college?.department || 'General'}</dd>
                                </div>
                                <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                                    <dt className="text-sm font-medium text-gray-500">SPOC Name</dt>
                                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{college?.spocName || 'N/A'}</dd>
                                </div>
                                <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                                    <dt className="text-sm font-medium text-gray-500">Contact</dt>
                                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{college?.spocPhone} / {college?.spocEmail}</dd>
                                </div>
                            </dl>
                        </div>
                    </div>

                    {/* Program Progress */}
                    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                        <div className="px-4 py-5 sm:px-6">
                            <h3 className="text-lg leading-6 font-medium text-gray-900">Program Progress</h3>
                            <p className="mt-1 max-w-2xl text-sm text-gray-500">Overall completion status of the training program.</p>
                        </div>
                        <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
                            <div className="relative pt-1">
                                <div className="flex mb-2 items-center justify-between">
                                    <div>
                                        <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-indigo-600 bg-indigo-200">
                                            Progress
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-semibold inline-block text-indigo-600">
                                            {progressPercentage}%
                                        </span>
                                    </div>
                                </div>
                                <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-indigo-200">
                                    <div style={{ width: `${progressPercentage}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500"></div>
                                </div>
                                <p className="text-sm text-gray-500">
                                    {completedDays} of {days.length} days completed
                                </p>
                            </div>
                        </div>
                    </div>

                    <div id="days-section" className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-800">
                                {college?.department || 'General'} Department
                            </h2>
                            <button
                                onClick={() => {
                                    setSelectedDay(null);
                                    setIsDayModalOpen(true);
                                }}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition"
                            >
                                + Add Day
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                            {days.map((day) => {
                                const dayTitle = day.name || (day.date
                                    ? new Date(day.date).toLocaleDateString(undefined, { weekday: 'long' })
                                    : `Day ${day.dayNumber}`);
                                const dayStatus = day.status || 'Pending';
                                const statusColor = dayStatus === 'Completed' ? 'text-green-600' : 'text-amber-600';
                                const trainerName = day.trainerName || day.trainer?.name || 'Not Assigned';
                                const timeRange = day.startTime && day.endTime
                                    ? `${day.startTime} - ${day.endTime}`
                                    : (day.time || '09:00 - 17:00');

                                return (
                                    <div
                                        key={day.id || day.dayNumber}
                                        className="bg-white rounded-xl shadow-md p-5 border hover:shadow-lg transition"
                                    >
                                        <div className="flex justify-between items-center">
                                            <h4 className="font-semibold text-gray-800">
                                                {dayTitle}
                                            </h4>
                                            <span className={`text-sm ${statusColor}`}>
                                                {dayStatus}
                                            </span>
                                        </div>

                                        <div className="mt-3 text-sm text-gray-600">
                                            Trainer: {trainerName}
                                        </div>

                                        <div className="text-sm text-gray-600">
                                            Time: {timeRange}
                                        </div>

                                        <div className="mt-4 flex justify-end">
                                            <button
                                                type="button"
                                                onClick={() => handleDayClick(day)}
                                                className="text-blue-600 text-sm font-medium hover:underline"
                                            >
                                                View Details &rarr;
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* <BatchModal
                open={isBatchModalOpen}
                onClose={() => setIsBatchModalOpen(false)}
                onSave={handleSaveBatch}
                initialData={selectedBatch}
            /> */}

            <DayDetailsModal
                open={isDayModalOpen}
                onClose={() => setIsDayModalOpen(false)}
                day={selectedDay}
                college={college}
                trainers={trainers}
                onVerify={handleVerification}
                onSave={async (data) => {
                    try {
                        console.log('Saving day details:', data);

                        // Map frontend fields to backend schema
                        const payload = {
                            ...data,
                            scheduledDate: data.date, // Map date -> scheduledDate
                            startTime: data.time,     // Map time -> startTime
                            endTime: data.time ?
                                (() => {
                                    const [hours, minutes] = data.time.split(':').map(Number);
                                    const endHours = (hours + 1) % 24;
                                    return `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                                })()
                                : '18:00', // Fallback
                            trainerId: data.trainerId || null
                        };

                        let scheduleId = selectedDay?.id;

                        if (selectedDay && selectedDay.id && !selectedDay.id.toString().startsWith('placeholder')) {
                            // Update existing schedule
                            console.log('Updating schedule with payload:', payload);
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
                            console.log('Creating new schedule with payload:', newSchedulePayload);
                            const response = await api.post('/schedules/create', newSchedulePayload);
                            if (response.success && response.data) {
                                scheduleId = response.data._id;
                            }
                        }

                        // Handle attendance upload if files/geoTag exist and we have a scheduleId
                        if (scheduleId && (data.attendancePdf || data.attendanceImage || data.geoTag)) {
                            console.log('Uploading attendance data...');
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

                            await api.post('/attendance/admin-upload', formData, {
                                headers: { 'Content-Type': 'multipart/form-data' }
                            });
                            console.log('Attendance uploaded successfully');
                        }

                        // Refresh
                        const response = await api.get(detailsEndpoint);
                        if (response.college) {
                            setDays(response.days || []);
                            setActiveDepartmentId(response.activeDepartmentId || null);
                        }
                        setIsDayModalOpen(false);
                    } catch (err) {
                        console.error('Error saving day details:', err);
                        notify.error('Failed to save day details');
                    }
                }}
                onDelete={async (dayId) => {
                    try {
                        console.log('Deleting day:', dayId);
                        await api.delete(`/schedules/${dayId}`);

                        const trainerId = resolveTrainerId(selectedDay?.trainerId || selectedDay?.trainer);
                        if (trainerId) {
                            clearTrainerDashboardScheduleSummaryCache(trainerId);
                            clearTrainerDashboardSnapshot(trainerId);
                            signalTrainerDashboardRefresh(trainerId);
                        }

                        // Refresh
                        const response = await api.get(detailsEndpoint);
                        if (response.college) {
                            setDays(response.days || []);
                            setActiveDepartmentId(response.activeDepartmentId || null);
                        }
                        setIsDayModalOpen(false);
                        setSelectedDay(null);
                        notify.success('Day deleted successfully');
                    } catch (err) {
                        console.error('Error deleting day:', err);
                        notify.error('Failed to delete day');
                    }
                }}
            />
        </div>
    );
};

export default CollegeDetails;
