"use client";

import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ArrowLeftIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowPathIcon,
  BuildingOfficeIcon,
  MapPinIcon,
  AcademicCapIcon,
  MagnifyingGlassIcon,
  PhoneIcon,
  DocumentArrowDownIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { api, FILE_BASE_URL } from '@/services/api';
import { notify } from '@/lib/toast';
import HierarchyBreadcrumb from '@/components/common/HierarchyBreadcrumb';
import CollegeModal from '@/components/modals/CollegeModal';
import CourseModal from '@/components/modals/CourseModal';
import PasswordConfirmationModal from '@/components/modals/PasswordConfirmationModal';
import useDebouncedValue from '@/hooks/useDebouncedValue';

const getDepartmentCount = (departmentValue) => {
  if (!departmentValue || typeof departmentValue !== 'string') return 1;
  const parts = departmentValue
    .split(/[|,/]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length || 1;
};

const CollegeStats = ({ courseId, collegeId }) => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'college-stats', courseId, collegeId],
    enabled: Boolean(courseId && collegeId),
    queryFn: () => api.get(`/batches/stats?courseId=${courseId}&collegeId=${collegeId}`),
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="h-4 w-32 bg-slate-100 rounded animate-pulse mt-1.5"></div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs font-semibold text-slate-500 bg-slate-50/50 border border-slate-100 rounded-lg px-2 py-1 max-w-max">
      <span className="flex items-center gap-1">📚 {stats?.totalBatches || 0} {stats?.totalBatches === 1 ? 'Batch' : 'Batches'}</span>
      <span className="text-slate-200">|</span>
      <span className="flex items-center gap-1">👤 {stats?.totalTrainers || 0} {stats?.totalTrainers === 1 ? 'Trainer' : 'Trainers'}</span>
      <span className="text-slate-200">|</span>
      <span className="flex items-center gap-1">🎓 {stats?.totalStudents || 0} {stats?.totalStudents === 1 ? 'Student' : 'Students'}</span>
    </div>
  );
};

const CollegeCard = memo(function CollegeCard({
  college,
  isExpanded,
  depts,
  isLoadingDepts,
  accessToken,
  onToggle,
  onEditCollege,
  onDeleteCollege,
  onAddDepartment,
  onEditDepartment,
  onDeleteDept,
  router,
  courseId,
  companyId,
}) {
  const [isAddingDept, setIsAddingDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [savingDept, setSavingDept] = useState(false);

  const [editingDeptId, setEditingDeptId] = useState(null);
  const [editDeptName, setEditDeptName] = useState('');

  const cId = college._id || college.id;
  const deptCount = getDepartmentCount(college.department);
  const crsId = college.courseId?._id || college.courseId || courseId;

  const handleAddDept = async () => {
    if (!newDeptName.trim()) return;
    try {
      setSavingDept(true);
      await onAddDepartment(cId, newDeptName.trim());
      setNewDeptName('');
      setIsAddingDept(false);
    } catch {
      // Error is handled by parent via notify
    } finally {
      setSavingDept(false);
    }
  };

  const handleSaveDeptEdit = async (deptId) => {
    if (!editDeptName.trim()) return;
    try {
      setSavingDept(true);
      await onEditDepartment(cId, deptId, editDeptName.trim());
      setEditingDeptId(null);
      setEditDeptName('');
    } catch {
      // Error is notify handled by parent
    } finally {
      setSavingDept(false);
    }
  };

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border transition-all duration-300 overflow-hidden ${
        isExpanded
          ? 'border-indigo-200 shadow-[0_8px_24px_rgba(79,70,229,0.12)]'
          : 'border-gray-100 hover:shadow-md'
      }`}
    >
      {/* College Header */}
      <div
        className="p-5 cursor-pointer"
        onClick={() => onToggle(cId)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center min-w-0 flex-1">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-4 shrink-0 transition-colors ${
              isExpanded ? 'bg-indigo-100' : 'bg-gray-100'
            }`}>
              <BuildingOfficeIcon className={`w-5 h-5 ${isExpanded ? 'text-indigo-600' : 'text-gray-500'}`} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className={`text-lg font-semibold truncate transition-colors ${
                isExpanded ? 'text-indigo-700' : 'text-gray-800'
              }`}>
                {college.name}
              </h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                {college.city && (
                  <span className="flex items-center">
                    <MapPinIcon className="h-3.5 w-3.5 mr-1 text-gray-400" />
                    {college.city}
                  </span>
                )}
                {(college.spocPhone || college.phone) && (
                  <span className="flex items-center">
                    <PhoneIcon className="h-3.5 w-3.5 mr-1 text-gray-400" />
                    {college.spocPhone || college.phone}
                  </span>
                )}
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                  {deptCount} {deptCount === 1 ? 'Dept' : 'Depts'}
                </span>
                {college.department && college.department !== 'General' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 max-w-[180px] truncate">
                    {college.department}
                  </span>
                )}
              </div>
              {crsId && (
                <CollegeStats courseId={crsId} collegeId={cId} />
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-4 shrink-0 font-medium">
            {crsId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/dashboard/companies/college/${cId}`);
                }}
                className="inline-flex items-center rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-bold text-white transition-colors shadow-sm"
              >
                Open College
              </button>
            )}
            {college.studentAttendanceExcelUrl && (
              <a
                href={`${FILE_BASE_URL}/uploads/trainer-documents/${college.studentAttendanceExcelUrl.split(/[\\/]/).pop()}?token=${accessToken}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center rounded-lg border border-green-200 bg-white px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 transition-colors"
                title="Download Attendance Excel"
              >
                <DocumentArrowDownIcon className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onEditCollege(college); }}
              className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              title="Edit College"
            >
              <PencilSquareIcon className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteCollege(college); }}
              className="inline-flex items-center rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              title="Delete College"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>

            <div className={`p-1 rounded-lg transition-colors ${isExpanded ? 'text-indigo-600' : 'text-gray-400'}`}>
              {isExpanded ? (
                <ChevronUpIcon className="h-5 w-5" />
              ) : (
                <ChevronDownIcon className="h-5 w-5" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Departments Section (expanded) */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-gradient-to-b from-gray-50 to-white px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center">
              <AcademicCapIcon className="h-4 w-4 mr-1.5 text-indigo-500" />
              Departments
            </h4>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsAddingDept(prev => !prev);
                setNewDeptName('');
              }}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              <PlusIcon className="h-3.5 w-3.5 mr-1" />
              Add Department
            </button>
          </div>

          {/* Add Department Inline Form */}
          {isAddingDept && (
            <div className="mb-4 flex items-center gap-2 bg-white p-3 rounded-lg border border-indigo-200 shadow-sm animate-in fade-in duration-200">
              <input
                type="text"
                placeholder="Department name (e.g. CSE, ECE, Mech)"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddDept();
                  }
                }}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                autoFocus
              />
              <button
                type="button"
                onClick={handleAddDept}
                disabled={!newDeptName.trim() || savingDept}
                className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingDept ? 'Adding...' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingDept(false);
                  setNewDeptName('');
                }}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {isLoadingDepts ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mr-2"></div>
              <span className="text-sm text-gray-500">Loading departments...</span>
            </div>
          ) : depts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {depts.map((dept) => (
                <div
                  key={dept._id}
                  onClick={() => {
                    if (editingDeptId !== dept._id) {
                      router.push(
                        `/dashboard/companies/college/${cId}/department/${encodeURIComponent(dept.name)}`
                      );
                    }
                  }}
                  className="bg-white p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
                >
                  {editingDeptId === dept._id ? (
                    /* Inline Edit Form */
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editDeptName}
                        onChange={(e) => setEditDeptName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveDeptEdit(dept._id);
                          }
                          if (e.key === 'Escape') {
                            setEditingDeptId(null);
                            setEditDeptName('');
                          }
                        }}
                        className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveDeptEdit(dept._id)}
                        disabled={!editDeptName.trim() || savingDept}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {savingDept ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setEditingDeptId(null); setEditDeptName(''); }}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    /* Normal Display */
                    <>
                      <div className="flex items-center justify-between">
                        <h5 className="font-semibold text-gray-800 group-hover:text-indigo-600 transition-colors truncate">
                          {dept.name}
                        </h5>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {dept.isAssigned && (
                            <span className="bg-green-100 text-green-600 text-[10px] px-1.5 py-0.5 rounded font-medium">
                              Assigned
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDeptId(dept._id);
                              setEditDeptName(dept.name);
                            }}
                            className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Edit Department"
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => onDeleteDept(dept, cId, e)}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete Department"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-gray-400">Click to view details</span>
                        <span className="text-xs text-indigo-500 font-medium group-hover:text-indigo-700 transition-colors">
                          Open →
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
              No departments found for this college.
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const CourseColleges = () => {
  const router = useRouter();
  const params = useParams();
  const companyId = params?.companyId || params?.id;
  const courseId = params?.courseId;
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  // Expanded college & its departments
  const [expandedCollegeId, setExpandedCollegeId] = useState(null);
  const [departmentsMap, setDepartmentsMap] = useState({}); // { collegeId: departments[] }
  const [loadingDepartments, setLoadingDepartments] = useState(null);
  const [accessToken, setAccessToken] = useState('');

  // College Modal state
  const [isCollegeModalOpen, setIsCollegeModalOpen] = useState(false);
  const [editingCollege, setEditingCollege] = useState(null);

  // Course Modal state
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);

  // Delete Modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);

  const isCourseFiltered = Boolean(companyId && courseId);

  const courseCollegesQuery = useQuery({
    queryKey: ['admin', 'course-colleges', companyId, courseId],
    queryFn: async () => {
      if (isCourseFiltered) {
        const [companyRes, coursesRes, collegesRes] = await Promise.all([
          api.get(`/companies/${companyId}`),
          api.get(`/courses?companyId=${companyId}`),
          api.get(`/colleges?courseId=${courseId}`),
        ]);

        const normalizedCourses = Array.isArray(coursesRes)
          ? coursesRes
          : coursesRes?.data || [];
        const normalizedColleges = Array.isArray(collegesRes)
          ? collegesRes
          : collegesRes?.data || [];

        return {
          company: companyRes || null,
          course:
            normalizedCourses.find(
              (item) => String(item._id || item.id) === String(courseId),
            ) || null,
          colleges: normalizedColleges,
        };
      } else {
        const [companiesRes, coursesRes, collegesRes] = await Promise.all([
          api.get('/companies'),
          api.get('/courses'),
          api.get('/colleges'),
        ]);

        const normalizedColleges = Array.isArray(collegesRes)
          ? collegesRes
          : collegesRes?.data || [];

        return {
          company: null,
          course: null,
          colleges: normalizedColleges,
          companies: Array.isArray(companiesRes) ? companiesRes : companiesRes?.data || [],
          courses: Array.isArray(coursesRes) ? coursesRes : coursesRes?.data || [],
        };
      }
    },
    placeholderData: (previousData) => previousData,
  });

  const company = courseCollegesQuery.data?.company || null;
  const course = courseCollegesQuery.data?.course || null;
  // Memoize to prevent stale closure issues in hooks that depend on `colleges`
  const colleges = useMemo(
    () => courseCollegesQuery.data?.colleges || [],
    [courseCollegesQuery.data]
  );

  const refetchCourseColleges = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ['admin', 'course-colleges', companyId, courseId],
    });
  }, [companyId, courseId, queryClient]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setAccessToken(localStorage.getItem('accessToken') || '');
  }, []);

  // Fetch departments for a college
  const fetchDepartments = useCallback(async (collegeId, force = false) => {
    if (!force && departmentsMap[collegeId]) return; // Already loaded
    try {
      setLoadingDepartments(collegeId);
      const res = await api.get(`/departments/my?collegeId=${collegeId}`);
      const depts = Array.isArray(res?.departments) ? res.departments : [];
      setDepartmentsMap((prev) => ({ ...prev, [collegeId]: depts }));
    } catch (err) {
      console.error('Failed to load departments:', err);
      setDepartmentsMap((prev) => ({ ...prev, [collegeId]: [] }));
    } finally {
      setLoadingDepartments(null);
    }
  }, [departmentsMap]);

  // Add Department handler
  const handleAddDepartment = useCallback(async (collegeId, deptName) => {
    try {
      const college = colleges.find((c) => (c._id || c.id) === collegeId);
      await api.post('/departments', {
        name: deptName,
        collegeId,
        companyId: college?.companyId || companyId,
        courseId: college?.courseId || courseId,
      });
      // Refresh departments for this college
      await fetchDepartments(collegeId, true);
      // Refresh colleges to update dept count
      await refetchCourseColleges();
    } catch (error) {
      console.error('Error adding department:', error);
      notify.error(error.response?.data?.message || error.message || 'Failed to add department');
      throw error;
    }
  }, [colleges, companyId, courseId, fetchDepartments, refetchCourseColleges]);

  // Edit Department handler
  const handleEditDepartment = useCallback(async (collegeId, deptId, deptName) => {
    try {
      await api.put(`/departments/${deptId}`, { name: deptName });
      await fetchDepartments(collegeId, true);
      await refetchCourseColleges();
    } catch (error) {
      console.error('Error renaming department:', error);
      notify.error(error.response?.data?.message || error.message || 'Failed to rename department');
      throw error;
    }
  }, [fetchDepartments, refetchCourseColleges]);

  const handleDeleteDept = useCallback((dept, collegeId, e) => {
    e.stopPropagation();
    setDeleteItem({
      type: 'department',
      id: dept._id,
      name: dept.name,
      collegeId,
    });
    setIsDeleteModalOpen(true);
  }, []);

  // Toggle college expand/collapse
  const toggleCollege = useCallback((collegeId) => {
    if (expandedCollegeId === collegeId) {
      setExpandedCollegeId(null);
    } else {
      setExpandedCollegeId(collegeId);
      fetchDepartments(collegeId);
    }
  }, [expandedCollegeId, fetchDepartments]);

  // Filtered colleges based on search
  const filteredColleges = useMemo(() => {
    if (!debouncedSearchTerm) return colleges;
    const lower = debouncedSearchTerm.toLowerCase();
    return colleges.filter(
      (c) =>
        c.name?.toLowerCase().includes(lower) ||
        c.city?.toLowerCase().includes(lower) ||
        c.department?.toLowerCase().includes(lower) ||
        c.spocName?.toLowerCase().includes(lower)
    );
  }, [colleges, debouncedSearchTerm]);

  const breadcrumbItems = useMemo(() => {
    if (isCourseFiltered) {
      return [
        { label: 'Companies', value: 'Companies', to: '/dashboard/companies' },
        {
          label: company?.name || 'Company',
          value: company?.name || 'Company',
          to: `/dashboard/companies/${companyId}`,
        },
        {
          label: course?.title || 'Course',
          value: `${colleges.length} Colleges`,
        },
      ];
    }
    return [
      { label: 'Colleges', value: `${colleges.length} Colleges` }
    ];
  }, [isCourseFiltered, company?.name, course?.title, companyId, colleges.length]);

  // Course Handlers
  const handleSaveCourse = async (data) => {
    try {
      await api.put(`/courses/${courseId}`, { ...data, companyId });
      await refetchCourseColleges();
      setIsCourseModalOpen(false);
      notify.success('Course updated successfully!');
    } catch (error) {
      console.error('Error saving course:', error);
      notify.error(`Failed to save course: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleAddCollege = () => {
    setEditingCollege(null);
    setIsCollegeModalOpen(true);
  };

  const handleDeleteCourse = () => {
    setDeleteItem({
      type: 'course',
      id: courseId,
      name: course?.title || 'this course',
    });
    setIsDeleteModalOpen(true);
  };

  const handleEditCollege = useCallback((college) => {
    setEditingCollege(college);
    setIsCollegeModalOpen(true);
  }, []);

  const handleSaveCollege = async (data) => {
    try {
      const { studentAttendanceExcel, ...collegeData } = data;

      if (editingCollege) {
        await api.put(`/colleges/${editingCollege._id}`, collegeData);
      } else {
        const payload = { ...collegeData, companyId, courseId };
        const savedCollege = await api.post('/colleges', payload);

        if (studentAttendanceExcel) {
          const collegeId = savedCollege._id || savedCollege.id;
          const formData = new FormData();
          formData.append('file', studentAttendanceExcel);
          await api.post(`/colleges/${collegeId}/upload-attendance`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
      }

      await refetchCourseColleges();
      setIsCollegeModalOpen(false);
      notify.success('College saved successfully!');
    } catch (error) {
      console.error('Error saving college:', error);
      notify.error(`Failed to save college: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleDeleteCollege = useCallback((college) => {
    setDeleteItem({
      type: 'college',
      id: college._id || college.id,
      name: college.name || 'this college',
    });
    setIsDeleteModalOpen(true);
  }, []);

  const handleConfirmDelete = async (password) => {
    if (!deleteItem) return;
    try {
      const verifyRes = await api.post('/users/verify-password', { password });
      if (!verifyRes.success) {
        throw new Error(verifyRes.message || 'Incorrect password');
      }

      if (deleteItem.type === 'course') {
        await api.delete(`/courses/${deleteItem.id}`);
        notify.success('Course deleted successfully!');
        setIsDeleteModalOpen(false);
        setDeleteItem(null);
        router.push(`/dashboard/companies/${companyId}`);
        return;
      }

      if (deleteItem.type === 'department') {
        await api.delete(`/departments/${deleteItem.id}`);
        notify.success('Department deleted successfully!');
        setIsDeleteModalOpen(false);
        const deptCollegeId = deleteItem.collegeId;
        setDeleteItem(null);
        await fetchDepartments(deptCollegeId, true);
        await refetchCourseColleges();
        return;
      }

      await api.delete(`/colleges/${deleteItem.id}`);
      if (expandedCollegeId === deleteItem.id) setExpandedCollegeId(null);
      await refetchCourseColleges();
      notify.success('College deleted successfully!');
      setIsDeleteModalOpen(false);
      setDeleteItem(null);
    } catch (error) {
      console.error('Error deleting:', error);
      notify.error(error.response?.data?.message || error.message || 'Failed to delete');
      if (error.message.includes('password')) throw error;
    }
  };

  if (courseCollegesQuery.isPending)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Loading colleges...</p>
        </div>
      </div>
    );

  if (courseCollegesQuery.error)
    return (
      <div className="p-8 text-center text-red-600">
        {courseCollegesQuery.error.message || 'Failed to load colleges'}
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <button
              onClick={() => router.push(companyId ? `/dashboard/companies/${companyId}` : '/dashboard')}
              className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeftIcon className="h-5 w-5 mr-2" />
              {companyId ? 'Back to Company' : 'Back to Dashboard'}
            </button>
            <button
              onClick={() => courseCollegesQuery.refetch()}
              className="flex items-center text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <ArrowPathIcon className="h-5 w-5 mr-2" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <HierarchyBreadcrumb items={breadcrumbItems} />

        {/* Course Info Card */}
        {course && (
          <div className="mb-6 mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mr-4">
                  <AcademicCapIcon className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {course.title || 'Course'}
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    {colleges.length} {colleges.length === 1 ? 'College' : 'Colleges'} in this course
                    {course.courseHead && ` • Course Head: ${course.courseHead}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCourseModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
              >
                <PencilSquareIcon className="h-4 w-4" />
                Edit Course
              </button>
              <button
                onClick={handleDeleteCourse}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors shadow-sm"
              >
                <TrashIcon className="h-4 w-4" />
                Delete Course
              </button>
            </div>
          </div>
        )}

        {/* All Colleges Summary Card */}
        {!course && (
          <div className="mb-6 mt-4 rounded-2xl border border-slate-100 bg-gradient-to-br from-indigo-50/50 via-white to-sky-50/30 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mr-4">
                  <AcademicCapIcon className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">
                    Colleges Directory
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Overview of all colleges, departments, and course affiliations.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-slate-100 text-center shadow-xs">
                  <span className="block text-xl font-bold text-slate-800">{colleges.length}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Colleges</span>
                </div>
                <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-slate-100 text-center shadow-xs">
                  <span className="block text-xl font-bold text-slate-800">
                    {[...new Set(colleges.map(c => c.city).filter(Boolean))].length}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Cities</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search and Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-xl font-semibold text-gray-900">College List</h2>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search colleges..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            {isCourseFiltered && (
              <button
                type="button"
                onClick={handleAddCollege}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm w-full sm:w-auto"
              >
                <PlusIcon className="h-5 w-5 mr-2" />
                Add College
              </button>
            )}
          </div>
        </div>

        {/* Colleges List */}
        {filteredColleges.length > 0 ? (
          <div className="space-y-4">
            {filteredColleges.map((college) => {
              const cId = college._id || college.id;
              return (
                <CollegeCard
                  key={cId}
                  college={college}
                  isExpanded={expandedCollegeId === cId}
                  depts={departmentsMap[cId] || []}
                  isLoadingDepts={loadingDepartments === cId}
                  accessToken={accessToken}
                  onToggle={toggleCollege}
                  onEditCollege={handleEditCollege}
                  onDeleteCollege={handleDeleteCollege}
                  onAddDepartment={handleAddDepartment}
                  onEditDepartment={handleEditDepartment}
                  onDeleteDept={handleDeleteDept}
                  router={router}
                  courseId={courseId}
                  companyId={companyId}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-sm">
            <BuildingOfficeIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-lg font-medium text-gray-600 mb-1">
              {searchTerm ? 'No matching colleges found' : 'No colleges yet'}
            </p>
            <p className="text-sm text-gray-400 mb-4">
              {searchTerm
                ? 'Try adjusting your search term'
                : 'Add your first college to this course'}
            </p>
            {!searchTerm && isCourseFiltered && (
              <button
                onClick={handleAddCollege}
                className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add First College
              </button>
            )}
          </div>
        )}
      </div>

      {/* College Modal */}
      <CollegeModal
        open={isCollegeModalOpen}
        onClose={() => setIsCollegeModalOpen(false)}
        onSave={handleSaveCollege}
        initialData={editingCollege}
        courses={course ? [course] : []}
        defaultCourseId={courseId}
      />

      {/* Course Modal */}
      <CourseModal
        open={isCourseModalOpen}
        onClose={() => setIsCourseModalOpen(false)}
        onSave={handleSaveCourse}
        initialData={course}
      />

      {/* Delete Confirmation Modal */}
      <PasswordConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteItem(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Item"
        message={`Are you sure you want to delete "${deleteItem?.name}"? This action cannot be undone.`}
      />
    </div>
  );
};

export default CourseColleges;
