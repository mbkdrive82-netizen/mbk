"use client";

import { useState, Fragment, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

import { Tab, Dialog, Transition } from '@headlessui/react';
import { UserCircleIcon, IdentificationIcon, DocumentChartBarIcon, CreditCardIcon, PlusIcon, XMarkIcon, ChevronLeftIcon, ChevronRightIcon, CheckCircleIcon, XCircleIcon, ClockIcon, EyeIcon, ArrowDownTrayIcon, AcademicCapIcon, BanknotesIcon, FolderIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import scheduleService from '@/services/scheduleService';
import { useScheduleAssociationsQuery } from '@/modules/schedules';
import { getTrainer, uploadDocument } from '@/services/trainerService';
import { api, FILE_BASE_URL } from '@/services/api';
import { notify } from '@/lib/toast';
import { getProfilePictureUrl } from '@/utils/imageUtils';
import { clearTrainerDashboardScheduleSummaryCache, clearTrainerDashboardSnapshot, signalTrainerDashboardRefresh } from '@/portals/trainer/dashboard/dashboardUtils';
import useRenderCountDebug from "@/shared/perf/useRenderCountDebug";

function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}

const getDocumentUrl = (filePath) => {
    if (!filePath) return null;
    if (typeof filePath === 'string' && filePath.startsWith('http')) {
        return filePath;
    }
    return `${FILE_BASE_URL}/${filePath.replace(/\\/g, '/')}`;
};

const getStatusBadge = (status) => {
    const styles = {
        'approved': 'bg-green-100 text-green-800 border-green-200',
        'verified': 'bg-green-100 text-green-800 border-green-200',
        'pending': 'bg-amber-100 text-amber-800 border-amber-200',
        'rejected': 'bg-red-100 text-red-800 border-red-200'
    };
    const icons = {
        'approved': CheckCircleIcon,
        'verified': CheckCircleIcon,
        'pending': ClockIcon,
        'rejected': XCircleIcon
    };
    const Icon = icons[status] || ClockIcon;

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-full text-xs font-semibold ${styles[status] || styles.pending}`}>
            <Icon className="h-3.5 w-3.5 mr-1" />
            {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending'}
        </span>
    );
};

const DocumentCard = ({ title, icon: Icon, children, status }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center border border-gray-200 shadow-sm text-indigo-600">
                    <Icon className="h-6 w-6" />
                </div>
                <div>
                    <h3 className="font-semibold text-gray-900">{title}</h3>
                    <div className="flex mt-1">{getStatusBadge(status)}</div>
                </div>
            </div>
        </div>
        <div className="p-6">
            {children}
        </div>
    </div>
);

const DocActionsForReal = ({ doc, handleVerifyDoc }) => {
    if (!doc) return <p className="text-sm text-gray-400 italic">Not uploaded</p>;

    return (
        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
            <a 
                href={doc.driveViewLink || getDocumentUrl(doc.filePath)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="View"
            >
                <EyeIcon className="h-5 w-5" />
            </a>
            
            {doc.verificationStatus === 'pending' && (
                <>
                    <button 
                        onClick={() => handleVerifyDoc(doc._id, 'approved')}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Approve"
                    >
                        <CheckCircleIcon className="h-5 w-5" />
                    </button>
                    <button 
                        onClick={() => handleVerifyDoc(doc._id, 'rejected')}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Reject"
                    >
                        <XCircleIcon className="h-5 w-5" />
                    </button>
                </>
            )}
            
            <div className="ml-2">
                {getStatusBadge(doc.verificationStatus)}
            </div>
        </div>
    );
};

const DocPreview = ({ doc, label, handleVerifyDoc }) => (
    <div className="flex-1 min-w-[200px] border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center min-h-[160px] relative group hover:border-indigo-300 transition-colors bg-gray-50/30">
         <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 w-full text-left">{label}</p>
         {doc ? (
             <div className="w-full flex-1 flex flex-col items-center">
                 {['image/jpeg', 'image/png', 'image/jpg'].includes(doc.mimeType) ? (
                     <img 
                         src={getDocumentUrl(doc.filePath)} 
                         alt="Doc" 
                         className="h-32 object-contain rounded shadow-sm"
                     />
                 ) : (
                     <DocumentTextIcon className="h-16 w-16 text-gray-400" />
                 )}
                 <div className="mt-2 text-center">
                     <p className="text-xs font-medium text-gray-900 truncate max-w-[150px]">{doc.fileName}</p>
                     <p className="text-[10px] text-gray-400">{(doc.fileSize / 1024).toFixed(0)} KB</p>
                 </div>
                 <DocActionsForReal doc={doc} handleVerifyDoc={handleVerifyDoc} />
             </div>
         ) : (
             <div className="text-center text-gray-400">
                 <ArrowDownTrayIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                 <p className="text-sm">No document</p>
             </div>
         )}
    </div>
);

const TrainerProfile = () => {
    useRenderCountDebug("AdminTrainerProfile");
    const { id } = useParams();

    const [trainer, setTrainer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [uploadingDoc, setUploadingDoc] = useState(null);

    // Fetch trainer details
    const fetchTrainerDetails = useCallback(async () => {
        try {
            setLoading(true);
            const response = await getTrainer(id);
            const data = response.data.data || response.data;

            setTrainer({
                id: data.id,
                name: data.name,
                email: data.email,
                phone: data.phone,
                address: data.address || 'N/A',
                college: data.colleges?.map(c => c.name).join(', ') || 'No College Assigned',
                status: data.verificationStatus === 'verified' ? 'Active' : 'Pending',
                verificationStatus: data.verificationStatus, // Add exact status
                documents: data.documents, // Add raw documents
                profilePicture: data.profilePicture, // Added profilePicture to state
                resume: getProfilePictureUrl(data.documents?.resume?.file),
                kyc: {
                    aadhaar: 'N/A',
                    aadhaarFront: getProfilePictureUrl(data.documents?.aadhar?.front),
                    aadhaarBack: getProfilePictureUrl(data.documents?.aadhar?.back),
                    pan: data.documents?.pan?.number || 'N/A',
                    panFront: getProfilePictureUrl(data.documents?.pan?.file),
                    panBack: null, // Schema doesn't support back
                },
                bank: {
                    accountNumber: data.documents?.bank?.accountNumber || 'N/A',
                    ifsc: data.documents?.bank?.ifscCode || 'N/A',
                    bankName: data.documents?.bank?.branchName || 'N/A', // Assuming branchName is bankName in UI
                    branchName: data.documents?.bank?.branchName || 'N/A',
                    chequeFront: getProfilePictureUrl(data.documents?.bank?.passbook),
                },
                reports: [],
                schedule: [],
                monthlyStats: [],
                attendanceStats: {
                    present: 0,
                    absent: 0,
                    totalDays: 0,
                    percentage: 0
                }
            });
        } catch (err) {
            console.error('Error fetching trainer details:', err);
            setError('Failed to load trainer details');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) {
            fetchTrainerDetails();
        }
    }, [id, fetchTrainerDetails]);

    const handleFileUpload = async (e, docType) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadingDoc(docType);
        const formData = new FormData();
        formData.append('document', file);
        formData.append('documentType', docType);
        formData.append('targetTrainerId', id); // Pass trainer ID for Super Admin upload

        try {
            const response = await uploadDocument(formData);
            if (response.data && response.data.success) {
                notify.success('Document uploaded successfully!');
                fetchTrainerDetails(); // Refresh details
            } else {
                notify.success('Upload success, refreshing...');
                fetchTrainerDetails();
            }
        } catch (error) {
            console.error('Error uploading document:', error);
            let errorMsg = 'Network error occurred';
            if (error.response) {
                if (typeof error.response.data === 'object' && error.response.data.message) {
                    errorMsg = error.response.data.message;
                } else if (error.response.status === 413) {
                    errorMsg = 'File is too large (max 15MB).';
                }
            }
            notify.error('Failed to upload: ' + errorMsg);
        } finally {
            setUploadingDoc(null);
        }
    };

    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [newReport, setNewReport] = useState({ title: '', date: '', status: 'Pending', description: '', company: 'City Engineering College' });

    const [activitySearch, setActivitySearch] = useState('');
    const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
    const [activeTabIndex, setActiveTabIndex] = useState(0);
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [newActivity, setNewActivity] = useState({
        company: '',
        course: '',
        college: '',
        date: '',
        startTime: '',
        endTime: '',
        dayNumber: 1,
        subject: ''
    });
    const associationsQuery = useScheduleAssociationsQuery();
    const associations = associationsQuery.data || { companies: [], courses: [], colleges: [], departments: [] };

    const fetchSchedule = useCallback(async () => {
        try {
            const month = selectedMonth.getMonth() + 1;
            const year = selectedMonth.getFullYear();
            const response = await scheduleService.getTrainerSchedule(id, { month, year });

            if (response.data) {
                // Transform API data to component format
                // Group by date
                const grouped = {};
                response.data.forEach(item => {
                    const date = item.scheduledDate.split('T')[0];
                    if (!grouped[date]) {
                        grouped[date] = [];
                    }
                    grouped[date].push({
                        id: item.id,
                        name: item.subject || item.Course?.name || 'Activity',
                        time: `${item.startTime} - ${item.endTime}`,
                        college: item.College?.name || 'Unknown College',
                        trainer: item.Trainer?.name || 'Unknown Trainer',
                        status: item.status === 'completed' ? 'Present' : 'Scheduled' // Map status
                    });
                });

                // Convert to array
                const scheduleArray = Object.keys(grouped).map(date => ({
                    date,
                    isCurrentMonth: new Date(date).getMonth() === selectedMonth.getMonth(),
                    events: grouped[date]
                }));

                setTrainer(prev => ({ ...prev, schedule: scheduleArray }));
            }
        } catch (error) {
            console.error('Error fetching schedule:', error);
        }
    }, [id, selectedMonth]);

    useEffect(() => {
        if (activeTabIndex !== 3) {
            return;
        }
        fetchSchedule();
    }, [activeTabIndex, fetchSchedule]);

    const handleAddReport = (e) => {
        e.preventDefault();
        const report = {
            id: trainer.reports.length + 1,
            ...newReport
        };
        setTrainer(prev => ({
            ...prev,
            reports: [report, ...prev.reports]
        }));
        setNewReport({ title: '', date: '', status: 'Pending', description: '', company: 'City Engineering College' });
        setIsReportModalOpen(false);
    };

    const handleAddActivity = async (e) => {
        e.preventDefault();
        try {
            const userStr = localStorage.getItem('user');
            const user = userStr ? JSON.parse(userStr) : null;

            const scheduleData = {
                trainerId: id, // From useParams
                companyId: newActivity.company,
                courseId: newActivity.course,
                collegeId: newActivity.college,
                dayNumber: parseInt(newActivity.dayNumber),
                scheduledDate: newActivity.date,
                startTime: newActivity.startTime,
                endTime: newActivity.endTime,
                subject: newActivity.subject,
                createdBy: user?.id
            };

            await scheduleService.createSchedule(scheduleData);
            notify.success('Activity added successfully!');
            clearTrainerDashboardScheduleSummaryCache(id);
            clearTrainerDashboardSnapshot(id);
            signalTrainerDashboardRefresh(id);
            setIsActivityModalOpen(false);
            setNewActivity({
                company: '',
                course: '',
                college: '',
                date: '',
                startTime: '',
                endTime: '',
                dayNumber: 1,
                subject: ''
            });
            fetchSchedule();
        } catch (error) {
            console.error('Error adding activity:', error);
            notify.error('Failed to add activity');
        }

    };

    // --- Verification Logic & Components ---

    const handleVerifyDoc = async (docId, status) => {
        let comment = '';
        if (status === 'rejected') {
            comment = window.prompt('Enter rejection reason:');
            if (comment === null) return;
        }

        try {
            const response = await api.put(`/trainer-documents/${docId}/verify`, {
                verificationStatus: status,
                verificationComment: comment
            });

            if (response.success) {
                // Refresh trainer details
                fetchTrainerDetails();
            }
        } catch (error) {
            console.error('Error verifying document:', error);
            notify.error('Failed to verify document');
        }
    };

    const handleProfileStatus = async (status) => {
        if (!window.confirm(`Are you sure you want to mark this profile as ${status}?`)) return;

        try {
            const response = await api.put(`/trainer-documents/trainer/${id}/status`, { status });
            if (response.success) {
                notify.success(`Trainer profile ${status} successfully!`);
                fetchTrainerDetails();
            }
        } catch (error) {
            console.error('Error updating profile status:', error);
            notify.error('Failed to update profile status');
        }
    };

    // Components

    const DocActions = ({ doc }) => {
        // Since doc structure might vary slightly if coming from populated vs raw, 
        // we use what we have in trainer.documents (which seems to be the mongoose object structure)
        
        if (!doc) return <p className="text-sm text-gray-400 italic">Not uploaded</p>;

        // Handle nested file path if needed (though API extract usually gives full URL or path)
        const filePath = doc.file || doc.front || doc.passbook || (typeof doc === 'string' ? doc : doc.path); 
        // Note: The structure in trainer.documents (from backend) matches the schema:
        // aadhar: { front: "path", back: "path", verified: bool, verificationStatus: "pending" ... }
        // Wait, the Schema has distinct fields. Let's look at passed 'doc' object.
        // If we pass the sub-object (e.g. trainer.documents.aadhar), it has 'front', 'back'.
        // But the specific verification status is on the PARENT object property in Mongoose schema?
        // Actually, looking at the Mongoose schema:
        // documents: { aadhar: { front: String, verified: Boolean ... } }
        // The Verification API acts on `TrainerDocument` model which is separate?
        // AH! `TrainerDocument` is a separate collection, BUT `Trainer` model also has embedded docs.
        // PROBABLY the `getTrainer` API returns the `Trainer` object.
        // My `TrainerDocuments.jsx` was fetching from `/trainer-documents/trainer/:id`.
        // This `TrainerProfile.jsx` fetches from `/trainers/:id`.
        // I need to decide if I verify the *Trainer* embedded doc or the *TrainerDocument* doc.
        // The verification API `PUT /trainer-documents/:id/verify` works on `TrainerDocument` model.
        // `Trainer` model embedded docs are just references/copies?
        // Let's check `trainerDocumentRoutes.js` "upload" again.
        // It updates BOTH `TrainerDocument` and `Trainer` model.
        // BUT the verification API (`router.put('/:id/verify'`) updates `TrainerDocument`.
        // DOES IT UPDATE `TRAINER`?
        // I checked `trainerDocumentRoutes.js` in Step 762/765. 
        // It updates `TrainerDocument`. It DOES NOT sync back to `Trainer` model verified status automatically in that specific endpoint.
        // Wait, that's a potential de-sync.
        // However, the `TrainerDocuments.jsx` UI uses `/trainer-documents/trainer/:id` to fetch the LIST of documents.
        // `TrainerProfile.jsx` uses `getTrainer` which fetches the `Trainer` object.
        // The `Trainer` object has `documents.aadhar.front` (string path), `documents.aadhar.verified` (boolean).
        // It lacks the rich `verificationStatus` ('pending', 'rejected') per document that `TrainerDocument` has.
        // `TrainerDocument` has `verificationStatus` enum. `Trainer` schema has `verified` boolean.
        
        // CRITICAL DECISION:
        // To support the rich verification UI (Approve/Reject with reasons), I MUST fetch the `TrainerDocument` list here too.
        // `Trainer` model's embedded docs are insufficient for the full admin workflow (they don't store rejection reasons or 'pending' status well, just bool).
        
        // PLAN UPDATE:
        // I need to fetch `trainerDocuments` in `TrainerProfile.jsx` as well.
        
        return null; // Logic placeholder
    };
    
    // I will implement a hook to fetch documents specifically for this view.
    const [trainerDocs, setTrainerDocs] = useState([]);
    
    useEffect(() => {
        if (id) {
            const fetchDocs = async () => {
                try {
                    const res = await api.get(`/trainer-documents/trainer/${id}`);
                    if (res.success) {
                        setTrainerDocs(res.data);
                    }
                } catch (err) {
                    console.error("Failed to fetch trainer docs", err);
                }
            };
            fetchDocs();
        }
    }, [id]);

    const getDoc = (type) => {
        // 1. Try exact match
        let doc = trainerDocs.find(d => d.documentType === type);
        if (doc) return doc;

        // 2. Try camelCase (aadhar_front -> aadharFront)
        const camel = type.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        doc = trainerDocs.find(d => d.documentType === camel);
        if (doc) return doc;

        // 3. Special cases mapping
        if (type === 'bank_passbook' || type === 'bank_document') {
            return trainerDocs.find(d => d.documentType === 'bankDocument' || d.documentType === 'bank_document' || d.documentType === 'bank_passbook');
        }
        if (type === 'degree_certificate') {
            return trainerDocs.find(d => d.documentType === 'degreeCertificate' || d.documentType === 'degree_certificate');
        }

        return undefined;
    };




    if (loading) {
        return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
    }

    if (error) {
        return <div className="flex justify-center items-center min-h-screen text-red-600">{error}</div>;
    }

    if (!trainer) {
        return <div className="flex justify-center items-center min-h-screen">Trainer not found</div>;
    }

    const categories = {
        'Profile Info': (
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Trainer Information</h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">Personal details and application.</p>
                </div>
                <div className="border-t border-gray-200">
                    <dl>
                        <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Full name</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{trainer.name}</dd>
                        </div>
                        <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Email address</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{trainer.email}</dd>
                        </div>
                        <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Phone number</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{trainer.phone}</dd>
                        </div>
                        <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Address</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{trainer.address}</dd>
                        </div>
                        <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Assigned College</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{trainer.college}</dd>
                        </div>
                        <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Status</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                                <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${trainer.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {trainer.status}
                                </span>
                            </dd>
                        </div>
                        <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Resume</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                                {trainer.resume ? (
                                    <div className="flex items-center space-x-4">
                                        <a
                                            href={trainer.resume}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-full shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                        >
                                            View Resume
                                        </a>
                                        <label className="cursor-pointer text-sm text-indigo-600 hover:text-indigo-900">
                                            <span>{uploadingDoc === 'resume' ? 'Updating...' : 'Update'}</span>
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                                onChange={(e) => handleFileUpload(e, 'resume')}
                                                disabled={uploadingDoc === 'resume'}
                                            />
                                        </label>
                                    </div>
                                ) : (
                                    <label className="cursor-pointer text-sm text-indigo-600 hover:text-indigo-900">
                                        <span>{uploadingDoc === 'resume' ? 'Uploading...' : 'Upload Resume'}</span>
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                            onChange={(e) => handleFileUpload(e, 'resume')}
                                            disabled={uploadingDoc === 'resume'}
                                        />
                                    </label>
                                )}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>
        ),
        'Documents': (
            <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6">
                {/* Profile Verification Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 pb-6 border-b border-gray-100 gap-4">
                    <div>
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Documents Verification</h3>
                        <p className="mt-1 text-sm text-gray-500">Verify trainer's uploaded documents.</p>
                    </div>
                    <div className="flex gap-3">
                        {trainer.verificationStatus === 'pending' && (
                            <>
                                <button
                                    onClick={() => handleProfileStatus('verified')}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold shadow-md shadow-green-200 hover:bg-green-700 transition"
                                >
                                    Approve Profile
                                </button>
                                <button
                                    onClick={() => handleProfileStatus('rejected')}
                                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition"
                                >
                                    Reject Profile
                                </button>
                            </>
                        )}
                        {trainer.verificationStatus !== 'pending' && (
                            <span className={`px-4 py-2 rounded-lg font-semibold border ${trainer.verificationStatus === 'verified' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                Profile {trainer.verificationStatus === 'verified' ? 'Approved' : 'Rejected'}
                            </span>
                        )}
                    </div>
                </div>

                {/* Documents List */}
                <div>
                    {/* Aadhaar */}
                    <DocumentCard
                        title="Aadhaar Card"
                        icon={IdentificationIcon}
                        status={
                            (getDoc('aadhar_front')?.verificationStatus === 'approved' && getDoc('aadhar_back')?.verificationStatus === 'approved') ? 'approved' :
                                (getDoc('aadhar_front')?.verificationStatus === 'rejected' || getDoc('aadhar_back')?.verificationStatus === 'rejected') ? 'rejected' : 'pending'
                        }
                    >
                        <div className="flex flex-col md:flex-row gap-6">
                            <DocPreview doc={getDoc('aadhar_front')} label="Front Side" handleVerifyDoc={handleVerifyDoc} />
                            <DocPreview doc={getDoc('aadhar_back')} label="Back Side" handleVerifyDoc={handleVerifyDoc} />
                        </div>
                    </DocumentCard>

                    {/* PAN */}
                    <DocumentCard title="PAN Card" icon={DocumentTextIcon} status={getDoc('pan_front')?.verificationStatus}>
                        <div className="flex flex-col md:flex-row gap-6">
                            <DocPreview doc={getDoc('pan_front')} label="Front Side" handleVerifyDoc={handleVerifyDoc} />
                        </div>
                    </DocumentCard>

                    {/* Degree */}
                    <DocumentCard title="Degree Certificate" icon={AcademicCapIcon} status={getDoc('degree_certificate')?.verificationStatus}>
                        <div className="flex flex-col md:flex-row gap-6">
                            <DocPreview doc={getDoc('degree_certificate')} label="Certificate File" handleVerifyDoc={handleVerifyDoc} />
                        </div>
                    </DocumentCard>

                    {/* Resume */}
                    <DocumentCard title="Resume / CV" icon={FolderIcon} status={getDoc('resume')?.verificationStatus}>
                        <div className="flex flex-col md:flex-row gap-6">
                            <DocPreview doc={getDoc('resume')} label="Resume File" handleVerifyDoc={handleVerifyDoc} />
                        </div>
                    </DocumentCard>

                    {/* Bank */}
                    <DocumentCard title="Bank Document" icon={BanknotesIcon} status={getDoc('bank_document')?.verificationStatus || getDoc('bank_passbook')?.verificationStatus}>
                        <div className="flex flex-col md:flex-row gap-6">
                            <DocPreview doc={getDoc('bank_document') || getDoc('bank_passbook')} label="Passbook / Cheque" handleVerifyDoc={handleVerifyDoc} />

                            {/* Bank Details Text */}
                            {(getDoc('bank_document') || getDoc('bank_passbook')) && (
                                <div className="flex-1 bg-blue-50/50 rounded-xl p-4 border border-blue-100">
                                    <h4 className="font-semibold text-blue-900 mb-3">Submitted Details</h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between border-b border-blue-100 pb-1">
                                            <span className="text-blue-600">Account No:</span>
                                            <span className="font-medium text-gray-800">{(getDoc('bank_document') || getDoc('bank_passbook'))?.accountNumber || 'N/A'}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-blue-100 pb-1">
                                            <span className="text-blue-600">IFSC:</span>
                                            <span className="font-medium text-gray-800">{(getDoc('bank_document') || getDoc('bank_passbook'))?.ifscCode || 'N/A'}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-blue-100 pb-1">
                                            <span className="text-blue-600">Bank:</span>
                                            <span className="font-medium text-gray-800">{(getDoc('bank_document') || getDoc('bank_passbook'))?.bankName || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </DocumentCard>
                </div>
            </div>
        ),
        'Reports': (
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Trainer Reports</h3>
                    <button
                        onClick={() => setIsReportModalOpen(true)}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        <PlusIcon className="-ml-0.5 mr-2 h-4 w-4" aria-hidden="true" />
                        Add Report
                    </button>
                </div>
                <ul role="list" className="divide-y divide-gray-200">
                    {trainer.reports.map((report) => (
                        <li key={report.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-indigo-600 truncate">{report.title}</p>
                                <div className="ml-2 shrink-0 flex">
                                    <p className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${report.status === 'Approved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                        {report.status}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-2 sm:flex sm:justify-between">
                                <div className="sm:flex">
                                    <p className="flex items-center text-sm text-gray-500">
                                        Submitted on {report.date}
                                    </p>
                                    <p className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0 sm:ml-6">
                                        {report.company}
                                    </p>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        ),
        'Activity': (
            <div className="bg-white shadow ring-1 ring-black ring-opacity-5 md:rounded-lg p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-200 pb-4 gap-4">
                    <div className="flex items-center">
                        <h2 className="text-lg font-semibold text-gray-900 mr-4">
                            {selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </h2>
                        <div className="flex items-center">
                            <button
                                type="button"
                                onClick={() => {
                                    const newDate = new Date(selectedMonth);
                                    newDate.setMonth(newDate.getMonth() - 1);
                                    setSelectedMonth(newDate);
                                }}
                                className="-m-1.5 flex flex-none items-center justify-center p-1.5 text-gray-400 hover:text-gray-500"
                            >
                                <span className="sr-only">Previous month</span>
                                <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const newDate = new Date(selectedMonth);
                                    newDate.setMonth(newDate.getMonth() + 1);
                                    setSelectedMonth(newDate);
                                }}
                                className="-m-1.5 flex flex-none items-center justify-center p-1.5 text-gray-400 hover:text-gray-500 ml-4"
                            >
                                <span className="sr-only">Next month</span>
                                <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative rounded-md shadow-sm">
                            <input
                                type="text"
                                name="activity-search"
                                id="activity-search"
                                className="block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                placeholder="Search Trainer Name"
                                value={activitySearch}
                                onChange={(e) => setActivitySearch(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setIsActivityModalOpen(true)}
                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            <PlusIcon className="-ml-0.5 mr-2 h-4 w-4" aria-hidden="true" />
                            Add Activity
                        </button>
                    </div>
                </div>

                <div className="flex space-x-4 mt-4 text-xs justify-end">
                    <div className="flex items-center"><span className="w-3 h-3 bg-green-100 border border-green-600 rounded-full mr-1"></span> Present</div>
                    <div className="flex items-center"><span className="w-3 h-3 bg-red-100 border border-red-600 rounded-full mr-1"></span> Absent</div>
                </div>

                <div className="mt-4 grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 text-center text-xs font-semibold leading-6 text-gray-700 lg:flex-none">
                    <div className="bg-white py-2">M</div>
                    <div className="bg-white py-2">T</div>
                    <div className="bg-white py-2">W</div>
                    <div className="bg-white py-2">T</div>
                    <div className="bg-white py-2">F</div>
                    <div className="bg-white py-2">S</div>
                    <div className="bg-white py-2">S</div>
                </div>
                <div className="flex bg-gray-200 text-xs leading-6 text-gray-700 lg:flex-auto">
                    <div className="hidden w-full lg:grid lg:grid-cols-7 lg:gap-px">
                        {trainer.schedule.map((day) => {
                            // Filter events based on search
                            const filteredEvents = day.events ? day.events.filter(event =>
                                event.trainer.toLowerCase().includes(activitySearch.toLowerCase())
                            ) : [];

                            return (
                                <div key={day.date} className={`relative min-h-[100px] bg-white px-3 py-2 ${!day.isCurrentMonth ? 'bg-gray-50 text-gray-500' : ''}`}>
                                    <time dateTime={day.date}>{day.date.split('-')[2]}</time>
                                    {filteredEvents.length > 0 && (
                                        <ol className="mt-2">
                                            {filteredEvents.map((event) => (
                                                <li key={event.id} className="mb-1">
                                                    <a href="#" className={`group flex flex-col border-l-2 p-1 text-xs hover:bg-opacity-75 ${event.status === 'Present' ? 'border-green-600 bg-green-50' : event.status === 'Absent' ? 'border-red-600 bg-red-50' : 'border-indigo-600 bg-indigo-50'}`}>
                                                        <p className={`font-semibold truncate ${event.status === 'Present' ? 'text-green-700' : event.status === 'Absent' ? 'text-red-700' : 'text-indigo-700'}`}>{event.name}</p>
                                                        <p className="text-gray-600 truncate">{event.college}</p>
                                                        <p className="text-gray-500 truncate font-medium">{event.trainer}</p>
                                                    </a>
                                                </li>
                                            ))}
                                        </ol>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        ),
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <header className="bg-white shadow">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            {trainer.profilePicture ? (
                                <img
                                    src={getProfilePictureUrl(trainer.profilePicture)}
                                    alt={trainer.name}
                                    className="h-12 w-12 rounded-full object-cover border-2 border-gray-200"
                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                                />
                            ) : (
                                <UserCircleIcon className="h-12 w-12 text-gray-400" aria-hidden="true" />
                            )}
                            <UserCircleIcon className="h-12 w-12 text-gray-400 hidden" aria-hidden="true" />
                            <div className="ml-4">
                                <h1 className="text-2xl font-bold text-gray-900">{trainer.name}</h1>
                                <p className="text-sm text-gray-500">{trainer.college} • {trainer.status}</p>
                            </div>
                        </div>
                        <div className="flex space-x-3">
                            <button className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                                Edit Profile
                            </button>
                            <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                                Download Report
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="py-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <Tab.Group onChange={setActiveTabIndex}>
                        <Tab.List className="flex space-x-1 rounded-xl bg-blue-900/20 p-1">
                            {Object.keys(categories).map((category) => (
                                <Tab
                                    key={category}
                                    className={({ selected }) =>
                                        classNames(
                                            'w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-700',
                                            'ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2',
                                            selected
                                                ? 'bg-white shadow'
                                                : 'text-blue-100 hover:bg-white/12 hover:text-white'
                                        )
                                    }
                                >
                                    {category}
                                </Tab>
                            ))}
                        </Tab.List>
                        <Tab.Panels className="mt-6">
                            {Object.keys(categories).map((category) => (
                                <Tab.Panel
                                    key={category}
                                    className={classNames(
                                        'rounded-xl bg-white p-3',
                                        'ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2'
                                    )}
                                >
                                    {categories[category]}
                                </Tab.Panel>
                            ))}
                        </Tab.Panels>
                    </Tab.Group>
                </div>
            </main>

            {/* Add Report Modal */}
            <Transition.Root show={isReportModalOpen} as={Fragment}>
                <Dialog as="div" className="relative z-10" onClose={setIsReportModalOpen}>
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
                    </Transition.Child>

                    <div className="dashboard-modal-scrollport fixed inset-0 z-10 overflow-y-auto">
                        <div className="dashboard-modal-center flex min-h-full items-center justify-center p-4 text-center sm:p-6">
                            <Transition.Child
                                as={Fragment}
                                enter="ease-out duration-300"
                                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                                enterTo="opacity-100 translate-y-0 sm:scale-100"
                                leave="ease-in duration-200"
                                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            >
                                <Dialog.Panel className="dashboard-modal-panel relative transform rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                                    <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                                        <button
                                            type="button"
                                            className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                            onClick={() => setIsReportModalOpen(false)}
                                        >
                                            <span className="sr-only">Close</span>
                                            <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                                        </button>
                                    </div>
                                    <div className="sm:flex sm:items-start">
                                        <div className="mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 sm:mx-0 sm:h-10 sm:w-10">
                                            <DocumentChartBarIcon className="h-6 w-6 text-indigo-600" aria-hidden="true" />
                                        </div>
                                        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                                            <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
                                                Add New Report
                                            </Dialog.Title>
                                            <div className="mt-2">
                                                <form onSubmit={handleAddReport} className="space-y-4">
                                                    <div>
                                                        <label htmlFor="title" className="block text-sm font-medium text-gray-700">Report Title</label>
                                                        <input
                                                            type="text"
                                                            name="title"
                                                            id="title"
                                                            required
                                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                            value={newReport.title}
                                                            onChange={(e) => setNewReport({ ...newReport, title: e.target.value })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label htmlFor="date" className="block text-sm font-medium text-gray-700">Date</label>
                                                        <input
                                                            type="date"
                                                            name="date"
                                                            id="date"
                                                            required
                                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                            value={newReport.date}
                                                            onChange={(e) => setNewReport({ ...newReport, date: e.target.value })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label htmlFor="company" className="block text-sm font-medium text-gray-700">Company / College</label>
                                                        <input
                                                            type="text"
                                                            name="company"
                                                            id="company"
                                                            required
                                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                            value={newReport.company}
                                                            onChange={(e) => setNewReport({ ...newReport, company: e.target.value })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
                                                        <textarea
                                                            name="description"
                                                            id="description"
                                                            rows={3}
                                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                            value={newReport.description}
                                                            onChange={(e) => setNewReport({ ...newReport, description: e.target.value })}
                                                        />
                                                    </div>
                                                    <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                                                        <button
                                                            type="submit"
                                                            className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:ml-3 sm:w-auto"
                                                        >
                                                            Add Report
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                                                            onClick={() => setIsReportModalOpen(false)}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </form>
                                            </div>
                                        </div>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition.Root>

            {/* Add Activity Modal */}
            <Transition.Root show={isActivityModalOpen} as={Fragment}>
                <Dialog as="div" className="relative z-10" onClose={setIsActivityModalOpen}>
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
                    </Transition.Child>

                    <div className="dashboard-modal-scrollport fixed inset-0 z-10 overflow-y-auto">
                        <div className="dashboard-modal-center flex min-h-full items-center justify-center p-4 text-center sm:p-6">
                            <Transition.Child
                                as={Fragment}
                                enter="ease-out duration-300"
                                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                                enterTo="opacity-100 translate-y-0 sm:scale-100"
                                leave="ease-in duration-200"
                                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            >
                                <Dialog.Panel className="dashboard-modal-panel relative transform rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                                    <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                                        <button
                                            type="button"
                                            className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                            onClick={() => setIsActivityModalOpen(false)}
                                        >
                                            <span className="sr-only">Close</span>
                                            <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                                        </button>
                                    </div>
                                    <div className="sm:flex sm:items-start">
                                        <div className="mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 sm:mx-0 sm:h-10 sm:w-10">
                                            <CreditCardIcon className="h-6 w-6 text-indigo-600" aria-hidden="true" />
                                        </div>
                                        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                                            <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
                                                Add New Activity
                                            </Dialog.Title>
                                            <div className="mt-2">
                                                <form onSubmit={handleAddActivity} className="space-y-4">
                                                    <div>
                                                        <label htmlFor="activity-subject" className="block text-sm font-medium text-gray-700">Subject / Activity Name</label>
                                                        <input
                                                            type="text"
                                                            name="activity-subject"
                                                            id="activity-subject"
                                                            required
                                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                            value={newActivity.subject}
                                                            onChange={(e) => setNewActivity({ ...newActivity, subject: e.target.value })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label htmlFor="activity-company" className="block text-sm font-medium text-gray-700">Company</label>
                                                        <select
                                                            id="activity-company"
                                                            name="activity-company"
                                                            required
                                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                            value={newActivity.company}
                                                            onChange={(e) => setNewActivity({ ...newActivity, company: e.target.value })}
                                                        >
                                                            <option value="">Select Company</option>
                                                            {associations.companies.map((c, i) => (
                                                                <option key={`${c.id}-${i}`} value={c.id}>{c.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label htmlFor="activity-course" className="block text-sm font-medium text-gray-700">Course</label>
                                                        <select
                                                            id="activity-course"
                                                            name="activity-course"
                                                            required
                                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                            value={newActivity.course}
                                                            onChange={(e) => setNewActivity({ ...newActivity, course: e.target.value })}
                                                        >
                                                            <option value="">Select Course</option>
                                                            {associations.courses
                                                                .filter(c => !newActivity.company || c.companyId === newActivity.company)
                                                                .map((c, i) => (
                                                                    <option key={`${c.id}-${i}`} value={c.id}>{c.name}</option>
                                                                ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label htmlFor="activity-college" className="block text-sm font-medium text-gray-700">College</label>
                                                        <select
                                                            id="activity-college"
                                                            name="activity-college"
                                                            required
                                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                            value={newActivity.college}
                                                            onChange={(e) => setNewActivity({ ...newActivity, college: e.target.value })}
                                                        >
                                                            <option value="">Select College</option>
                                                            {associations.colleges.map((c, i) => (
                                                                <option key={`${c.id}-${i}`} value={c.id}>{c.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label htmlFor="activity-date" className="block text-sm font-medium text-gray-700">Date</label>
                                                            <input
                                                                type="date"
                                                                name="activity-date"
                                                                id="activity-date"
                                                                required
                                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                                value={newActivity.date}
                                                                onChange={(e) => setNewActivity({ ...newActivity, date: e.target.value })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label htmlFor="activity-day" className="block text-sm font-medium text-gray-700">Day Number</label>
                                                            <input
                                                                type="number"
                                                                name="activity-day"
                                                                id="activity-day"
                                                                min="1"
                                                                max="12"
                                                                required
                                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                                value={newActivity.dayNumber}
                                                                onChange={(e) => setNewActivity({ ...newActivity, dayNumber: e.target.value })}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label htmlFor="activity-start-time" className="block text-sm font-medium text-gray-700">Start Time</label>
                                                            <input
                                                                type="time"
                                                                name="activity-start-time"
                                                                id="activity-start-time"
                                                                required
                                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                                value={newActivity.startTime}
                                                                onChange={(e) => setNewActivity({ ...newActivity, startTime: e.target.value })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label htmlFor="activity-end-time" className="block text-sm font-medium text-gray-700">End Time</label>
                                                            <input
                                                                type="time"
                                                                name="activity-end-time"
                                                                id="activity-end-time"
                                                                required
                                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                                value={newActivity.endTime}
                                                                onChange={(e) => setNewActivity({ ...newActivity, endTime: e.target.value })}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                                                        <button
                                                            type="submit"
                                                            className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:ml-3 sm:w-auto"
                                                        >
                                                            Add Activity
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                                                            onClick={() => setIsActivityModalOpen(false)}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </form>
                                            </div>
                                        </div>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition.Root>
        </div>
    );
};

export default TrainerProfile;
