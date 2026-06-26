"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  ChatBubbleLeftEllipsisIcon,
  ClockIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  PowerIcon,
  TrashIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/context/AuthContext";
import TrainerListVirtualizedTable from "@/portals/admin/TrainerListVirtualizedTable";
import {
  deleteTrainer,
  fetchTrainersPage,
  getTrainer,
} from "@/services/trainerService";
import { approveUser, toggleUserStatus } from "@/services/userService";
import {
  canApproveAdmission,
  canRejectAdmission,
} from "@/utils/admissionPermissions";
import { api } from "@/services/api";
import { getDocumentImagePreviewCandidates } from "@/utils/imageUtils";
import { AUTH_ROLES, normalizeAuthRole } from "@/utils/authRoles";
import {
  DOCUMENT_STATUS_META,
  REQUIRED_TRAINER_DOCUMENTS,
  getDocumentStatusMeta,
} from "@/utils/trainerDocumentWorkflow";
import useDebouncedValue from "@/hooks/useDebouncedValue";
import notify from "@/lib/toast";
import getErrorMessage from "@/lib/getErrorMessage";
import RenderProfiler from "@/shared/perf/RenderProfiler";
import { useScheduleAssociationsQuery } from "@/modules/schedules";
import scheduleService from "@/services/scheduleService";
import SearchableDropdown from "@/components/SearchableDropdown";
import {
  ADMIN_PENDING_USERS_KEY,
  ADMIN_TRAINERS_KEY,
} from "@/shared/config/adminQueryKeys";
import { safeRouterPrefetch } from "@/utils/safeRouterNavigation";

const TrainerProfileModal = dynamic(() => import("@/components/modals/TrainerProfileModal"), {
  loading: () => null,
  ssr: false,
});

const PasswordConfirmationModal = dynamic(
  () => import("@/components/modals/PasswordConfirmationModal"),
  {
    loading: () => null,
    ssr: false,
  },
);

const VIEW_META = {
  approved: {
    label: "Approved",
    activeClass: "border-indigo-600 text-indigo-600",
    emptyTitle: "No Approved Trainers",
    emptyText: "Approved and active trainers will appear here.",
  },
  pending: {
    label: "Pending Docs",
    activeClass: "border-amber-500 text-amber-600",
    emptyTitle: "No Pending Documents",
    emptyText:
      "Trainers with missing or rejected documents will appear here for follow-up.",
  },
  review: {
    label: "Review Docs",
    activeClass: "border-sky-500 text-sky-600",
    emptyTitle: "Review Queue Is Empty",
    emptyText:
      "Trainers with all required documents uploaded will appear here for verification.",
  },
  deactivated: {
    label: "Deactivated",
    activeClass: "border-slate-700 text-slate-700",
    emptyTitle: "No Deactivated Trainers",
    emptyText: "Deactivated trainer accounts will appear here.",
  },
};

const TRAINERS_PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 300;
const TRAINERS_QUERY_KEY = ADMIN_TRAINERS_KEY;
const PENDING_USERS_QUERY_KEY = ADMIN_PENDING_USERS_KEY;

const runWhenIdle = (task) =>
  new Promise((resolve, reject) => {
    const execute = () => {
      Promise.resolve()
        .then(task)
        .then(resolve)
        .catch(reject);
    };

    if (
      typeof window === "undefined" ||
      typeof window.requestIdleCallback !== "function"
    ) {
      execute();
      return;
    }

    window.requestIdleCallback(execute, { timeout: 1800 });
  });

const isActualDocumentStatus = (status) =>
  Object.prototype.hasOwnProperty.call(DOCUMENT_STATUS_META, status);

const getVerificationEntry = (trainer = {}, key) => {
  const verificationMap = trainer?.documents?.verification;
  if (!verificationMap) {
    return null;
  }

  if (typeof verificationMap.get === "function") {
    return verificationMap.get(key) || null;
  }

  return verificationMap[key] || null;
};

const buildWorkflowSummary = (trainer = {}) => {
  const docs = trainer.documents || {};
  const fallbackMissingDocuments = REQUIRED_TRAINER_DOCUMENTS.filter(
    ({ key }) => !docs[key],
  );
  const fallbackRejectedDocuments = REQUIRED_TRAINER_DOCUMENTS.filter(
    ({ key }) => Boolean(getVerificationEntry(trainer, key)?.reason),
  );
  const missingDocuments = Array.isArray(trainer.missingDocuments)
    ? trainer.missingDocuments
    : fallbackMissingDocuments;
  const rejectedDocuments = Array.isArray(trainer.rejectedDocuments)
    ? trainer.rejectedDocuments
    : fallbackRejectedDocuments;
  const uploadedCount =
    trainer.documentSummary?.uploadedCount ??
    REQUIRED_TRAINER_DOCUMENTS.filter(({ key }) => Boolean(docs[key])).length;
  const requiredCount =
    trainer.documentSummary?.requiredCount ?? REQUIRED_TRAINER_DOCUMENTS.length;
  const hasAllRequiredDocuments =
    typeof trainer.hasAllRequiredDocuments === "boolean"
      ? trainer.hasAllRequiredDocuments
      : missingDocuments.length === 0;

  let documentStatus = String(trainer.documentStatus || "")
    .trim()
    .toLowerCase();
  const verificationStatus = String(
    trainer.verificationStatus || trainer.status || "",
  )
    .trim()
    .toUpperCase();

  if (!isActualDocumentStatus(documentStatus)) {
    if (verificationStatus === "APPROVED" || verificationStatus === "VERIFIED") {
      documentStatus = "approved";
    } else if (rejectedDocuments.length > 0 || verificationStatus === "REJECTED") {
      documentStatus = "rejected";
    } else if (verificationStatus === "PENDING" && hasAllRequiredDocuments) {
      documentStatus = "under_review";
    } else if (hasAllRequiredDocuments) {
      documentStatus = "under_review";
    } else {
      documentStatus = "pending";
    }
  }

  if (documentStatus === "uploaded") {
    documentStatus = "under_review";
  }

  return {
    documentStatus,
    uploadedCount,
    requiredCount,
    missingDocuments,
    rejectedDocuments,
    hasAllRequiredDocuments,
  };
};

const getTrainerPreviewImageCandidates = (trainer = {}) => {
  const sources = [
    trainer.documentProgress?.selfiePhoto || null,
    trainer.documents?.selfiePhoto || null,
    trainer.documentProgress?.passportPhoto || null,
    trainer.documents?.passportPhoto || null,
    trainer.profilePicture || null,
    trainer.userId?.profilePicture || null,
  ].filter(Boolean);

  return Array.from(
    new Set(
      sources.flatMap((source) => getDocumentImagePreviewCandidates(source)),
    ),
  );
};

const INITIAL_SCHEDULE_FORM = {
  trainerId: "",
  collegeId: "",
  courseId: "",
  scheduledDate: "",
  startTime: "",
  endTime: "",
  dayNumber: 1,
  subject: "",
};

const normalizeTrainerRow = (trainer = {}) => {
  const workflow = buildWorkflowSummary(trainer);
  const previewImageCandidates = getTrainerPreviewImageCandidates(trainer);

  return {
    ...trainer,
    id: trainer.id || trainer._id,
    sourceType: "trainer",
    displayName: getTrainerPersonalName(trainer),
    displayEmail: trainer.userId?.email || trainer.email || "N/A",
    displayRole: trainer.userId?.role || trainer.role || "Trainer",
    displayCity: trainer.city || trainer.userId?.city || "N/A",
    displayReference: trainer.trainerId || trainer.trainerCode || "Pending ID",
    displayPhone:
      trainer.mobile || trainer.phone || trainer.userId?.phoneNumber || "N/A",
    completedDaysCount: Number(trainer.completedDaysCount || 0),
    pendingDaysCount: Number(trainer.pendingDaysCount || 0),
    previewImageCandidates,
    workflow,
  };
};

const normalizePendingSignupRow = (user = {}) => ({
  id: `pending-user-${user._id}`,
  rawUserId: user._id,
  sourceType: "pendingUser",
  displayName: user.name || "New Trainer",
  displayEmail: user.email || "N/A",
  displayRole: user.role || "Trainer",
  displayCity: "New Signup",
  displayReference: "Registration Pending",
  createdAt: user.createdAt,
  workflow: {
    documentStatus: "pending",
    uploadedCount: 0,
    requiredCount: REQUIRED_TRAINER_DOCUMENTS.length,
    missingDocuments: REQUIRED_TRAINER_DOCUMENTS,
    rejectedDocuments: [],
    hasAllRequiredDocuments: false,
  },
});

const getTrainerPersonalName = (trainer = {}) => {
  const firstName = String(
    trainer.firstName || trainer.userId?.firstName || "",
  ).trim();
  const lastName = String(
    trainer.lastName || trainer.userId?.lastName || "",
  ).trim();

  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(" ").trim();
  }

  return trainer.userId?.name || trainer.name || "Unnamed Trainer";
};

const isTrainerFinallyApproved = (trainer = {}) => {
  const status = String(trainer.status || "").trim().toUpperCase();
  const verificationStatus = String(trainer.verificationStatus || "").trim().toUpperCase();
  const registrationStatus = String(trainer.registrationStatus || "")
    .trim()
    .toLowerCase();

  return (
    status === "APPROVED" ||
    verificationStatus === "VERIFIED" ||
    registrationStatus === "approved"
  );
};

const buildQueueSearchIndex = (row = {}) => {
  const statusLabel = getDocumentStatusMeta(row.workflow?.documentStatus).label;
  const accountLabel = row.userId?.isActive === false ? "deactivated" : "active";

  return [
    row.displayName,
    row.displayEmail,
    row.displayReference,
    row.displayRole,
    row.displayCity,
    statusLabel,
    accountLabel,
    row.displayPhone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

const unwrapPendingUsersCollection = (response) => {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.users)) {
    return response.users;
  }

  if (Array.isArray(response?.data?.users)) {
    return response.data.users;
  }

  return [];
};

const TrainerList = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();

  const normalizedRole = useMemo(
    () => normalizeAuthRole(currentUser?.role, currentUser?.email),
    [currentUser?.email, currentUser?.role],
  );
  const isSuperAdminView = normalizedRole === AUTH_ROLES.SUPER_ADMIN;
  const canApproveTrainerAdmission = canApproveAdmission(currentUser);
  const canRejectTrainerAdmission = canRejectAdmission(currentUser);

  const [viewMode, setViewMode] = useState("approved");
  const [, startViewTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTrainer, setSelectedTrainer] = useState(null);
  const [imageLoadError, setImageLoadError] = useState({});
  const [actionLoadingKey, setActionLoadingKey] = useState("");
  const [exportingType, setExportingType] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(INITIAL_SCHEDULE_FORM);
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleSuccess, setScheduleSuccess] = useState("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [trainerToDelete, setTrainerToDelete] = useState(null);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);

  const associationsQuery = useScheduleAssociationsQuery({ enabled: isScheduleModalOpen });
  const scheduleAssociations = associationsQuery.data || { companies: [], courses: [], colleges: [], departments: [] };
  const normalizedSearchNeedle = useMemo(
    () => String(debouncedSearchTerm || "").trim().toLowerCase(),
    [debouncedSearchTerm],
  );

  const trainersQuery = useInfiniteQuery({
    queryKey: [...TRAINERS_QUERY_KEY, normalizedSearchNeedle],
    initialPageParam: 1,
    enabled: isSuperAdminView,
    staleTime: normalizedSearchNeedle ? 25_000 : 60_000,
    gcTime: 12 * 60_000,
    maxPages: 10,
    refetchOnWindowFocus: false,
    queryFn: ({ pageParam }) =>
      fetchTrainersPage({
        page: pageParam,
        limit: TRAINERS_PAGE_SIZE,
        search: normalizedSearchNeedle,
      }),
    getNextPageParam: (lastPage) =>
      lastPage?.hasNextPage ? Number(lastPage.page || 1) + 1 : undefined,
  });

  const pendingUsersQuery = useQuery({
    queryKey: PENDING_USERS_QUERY_KEY,
    enabled: isSuperAdminView,
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await api.get("/users/pending");
      return response?.users || [];
    },
  });

  const trainers = useMemo(
    () =>
      (trainersQuery.data?.pages || []).flatMap((page) =>
        Array.isArray(page?.data) ? page.data : [],
      ),
    [trainersQuery.data?.pages],
  );

  const pendingUsers = useMemo(
    () => unwrapPendingUsersCollection(pendingUsersQuery.data),
    [pendingUsersQuery.data],
  );

  const totalTrainerRecords = Number(
    trainersQuery.data?.pages?.[0]?.total || trainers.length || 0,
  );

  const removePendingUserFromCache = useCallback(
    (userId) => {
      queryClient.setQueryData(PENDING_USERS_QUERY_KEY, (current) => {
        const users = unwrapPendingUsersCollection(current).filter(
          (user) => String(user._id || user.id) !== String(userId),
        );

        if (Array.isArray(current)) {
          return users;
        }

        if (current && typeof current === "object") {
          return { ...current, users };
        }

        return users;
      });
    },
    [queryClient],
  );

  const refreshQueues = useCallback(
    async ({ includePending = true } = {}) => {
      try {
        const tasks = [
          queryClient.invalidateQueries({ queryKey: TRAINERS_QUERY_KEY }),
        ];
        if (includePending) {
          tasks.push(
            queryClient.invalidateQueries({ queryKey: PENDING_USERS_QUERY_KEY }),
          );
        }
        await Promise.all(tasks);
      } catch (error) {
        console.error("Failed to refresh trainer queues", error);
      }
    },
    [queryClient],
  );

  const loadMoreTrainers = useCallback(() => {
    if (!trainersQuery.hasNextPage || trainersQuery.isFetchingNextPage) {
      return;
    }
    void trainersQuery.fetchNextPage();
  }, [
    trainersQuery.fetchNextPage,
    trainersQuery.hasNextPage,
    trainersQuery.isFetchingNextPage,
  ]);

  useEffect(() => {
    if (!isSuperAdminView) {
      return;
    }
    safeRouterPrefetch(router, "/dashboard/documents");
    safeRouterPrefetch(router, "/dashboard/trainers");
  }, [isSuperAdminView, router]);

  useEffect(() => {
    setImageLoadError({});
  }, [trainers, viewMode, normalizedSearchNeedle]);

  const trainerRows = useMemo(
    () => trainers.map((trainer) => normalizeTrainerRow(trainer)),
    [trainers],
  );

  const pendingSignupRows = useMemo(() => {
    const existingTrainerUserIds = new Set(
      trainerRows
        .map((trainer) => String(trainer.userId?._id || trainer.userId || ""))
        .filter(Boolean),
    );
    const existingTrainerEmails = new Set(
      trainerRows
        .map((trainer) => trainer.displayEmail.toLowerCase())
        .filter(Boolean),
    );

    return pendingUsers
      .filter((user) => {
        const email = String(user.email || "").toLowerCase();
        return (
          !existingTrainerUserIds.has(String(user._id)) &&
          !existingTrainerEmails.has(email)
        );
      })
      .map((user) => normalizePendingSignupRow(user));
  }, [pendingUsers, trainerRows]);

  const queues = useMemo(() => {
    const activeTrainers = trainerRows.filter((trainer) => trainer.userId?.isActive !== false);
    const deactivated = trainerRows.filter(
      (trainer) => trainer.userId?.isActive === false,
    );

    return {
      pending: [
        ...activeTrainers.filter((trainer) =>
          ["pending", "rejected"].includes(trainer.workflow.documentStatus),
        ),
        ...pendingSignupRows,
      ],
      review: activeTrainers.filter(
        (trainer) =>
          !isTrainerFinallyApproved(trainer) &&
          (['under_review', 'uploaded'].includes(trainer.workflow.documentStatus) ||
            trainer.workflow.documentStatus === 'approved'),
      ),
      approved: activeTrainers.filter((trainer) =>
        isTrainerFinallyApproved(trainer),
      ),
      deactivated,
    };
  }, [pendingSignupRows, trainerRows]);

  const displayData = useMemo(() => {
    const queueRows = queues[viewMode] || [];
    if (!normalizedSearchNeedle) {
      return queueRows;
    }
    return queueRows.filter((row) =>
      buildQueueSearchIndex(row).includes(normalizedSearchNeedle),
    );
  }, [normalizedSearchNeedle, queues, viewMode]);

  const trainerDashboardStats = useMemo(() => {
    const total = totalTrainerRecords;
    const pending = trainerRows.reduce(
      (sum, trainer) => sum + Number(trainer.pendingDaysCount || 0),
      0,
    );
    const deactivated = queues.deactivated?.length || 0;

    return [
      {
        key: "total",
        label: "Total Trainers",
        value: total,
        subLabel: "all trainer accounts",
        tone: "from-slate-700 to-slate-900",
        icon: UserGroupIcon,
      },
      {
        key: "pending",
        label: "Pending Days",
        value: pending,
        subLabel: "attendance awaiting closure",
        tone: "from-amber-500 to-orange-600",
        icon: ClockIcon,
      },
      {
        key: "deactivated",
        label: "Deactivated",
        value: deactivated,
        subLabel: "inactive accounts",
        tone: "from-rose-500 to-rose-700",
        icon: PowerIcon,
      },
    ];
  }, [queues, totalTrainerRecords, trainerRows]);

  const prefetchTrainerDetails = useCallback(
    (trainer) => {
      if (!trainer?.id || trainer.sourceType !== "trainer") {
        return;
      }

      void queryClient.prefetchQuery({
        queryKey: ["admin", "trainer-details", String(trainer.id)],
        staleTime: 5 * 60_000,
        gcTime: 15 * 60_000,
        queryFn: () => getTrainer(trainer.id),
      });
    },
    [queryClient],
  );

  const handleTrainerClick = async (trainer) => {
    if (trainer.sourceType !== "trainer") {
      return;
    }

    try {
      const response = await queryClient.fetchQuery({
        queryKey: ["admin", "trainer-details", String(trainer.id)],
        staleTime: 5 * 60_000,
        gcTime: 15 * 60_000,
        queryFn: () => getTrainer(trainer.id),
      });
      const trainerDetails = response.data.data || response.data || {};
      setSelectedTrainer({
        ...trainerDetails,
        attendanceTrainerId: String(trainer.id || trainer._id || ""),
        completedDaysCount: Number(trainer.completedDaysCount || 0),
        pendingDaysCount: Number(trainer.pendingDaysCount || 0),
      });
      setIsModalOpen(true);
    } catch (error) {
      console.error("Error fetching trainer details:", error);
      notify.error(getErrorMessage(error, "Failed to load trainer details"));
    }
  };

  const handleDeleteClick = (trainer, event) => {
    event.stopPropagation();
    setTrainerToDelete(trainer);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async (password) => {
    if (!trainerToDelete) {
      return;
    }

    try {
      const verifyResponse = await api.post("/users/verify-password", { password });
      if (!verifyResponse.success) {
        throw new Error(verifyResponse.message || "Incorrect password");
      }

      await deleteTrainer(trainerToDelete.id);
      notify.success("Trainer deleted successfully");
      setIsDeleteModalOpen(false);
      setTrainerToDelete(null);
      await refreshQueues();
    } catch (error) {
      console.error("Error deleting trainer:", error);
      notify.error(getErrorMessage(error, "Failed to delete trainer"));
      if (error.message?.toLowerCase().includes("password")) {
        throw error;
      }
    }
  };

  const handleToggleAccountStatus = async (trainer) => {
    if (trainer.sourceType !== "trainer") {
      return;
    }

    const userId = trainer.userId?._id || trainer.userId;
    if (!userId) {
      notify.error("User ID not found for this trainer");
      return;
    }

    const currentStatus = trainer.userId?.isActive;
    const confirmMessage = `Are you sure you want to ${
      currentStatus ? "DEACTIVATE" : "ACTIVATE"
    } this trainer account?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const response = await toggleUserStatus(userId);
      if (response.success) {
        notify.success(response.message || "Trainer account status updated");
        await refreshQueues();
        setViewMode(currentStatus ? "deactivated" : "approved");
      }
    } catch (error) {
      console.error("Error toggling trainer account status:", error);
      notify.error(getErrorMessage(error, "Failed to update trainer status"));
    }
  };

  const handleApproveUser = async (userId) => {
    if (!window.confirm("Approve this trainer registration request?")) {
      return;
    }

    try {
      const response = await approveUser(userId);
      if (response.success) {
        removePendingUserFromCache(userId);
        notify.success("Trainer registration approved");
        void refreshQueues({ includePending: false });
      }
    } catch (error) {
      console.error("Error approving trainer signup:", error);
      notify.error(getErrorMessage(error, "Failed to approve trainer signup"));
    }
  };

  const handleRejectUser = async (userId) => {
    if (!window.confirm("Reject this trainer registration request?")) {
      return;
    }

    try {
      const response = await api.put(`/users/${userId}/reject`);
      if (response.success) {
        removePendingUserFromCache(userId);
        notify.success("Trainer registration rejected");
        void refreshQueues({ includePending: false });
      }
    } catch (error) {
      console.error("Error rejecting trainer signup:", error);
      notify.error(getErrorMessage(error, "Failed to reject trainer signup"));
    }
  };

  const runQueueAction = async (row, actionKey, actionLabel, callback) => {
    if (actionLoadingKey) {
      return;
    }

    try {
      setActionLoadingKey(actionKey);
      await callback();
      notify.success(actionLabel);
      await refreshQueues();
    } catch (error) {
      console.error(`Failed to ${actionKey}`, error);
      notify.error(getErrorMessage(error, `Failed to ${actionKey}`));
    } finally {
      setActionLoadingKey("");
    }
  };

  const handleApproachTrainer = async (row) => {
    const confirmationText =
      row.workflow.documentStatus === "rejected"
        ? "Send a reminder for rejected documents?"
        : "Send a missing-document reminder to this trainer?";

    if (!window.confirm(confirmationText)) {
      return;
    }

    await runQueueAction(row, `approach-${row.id}`, "Reminder sent successfully", async () => {
      if (row.sourceType === "pendingUser") {
        const response = await api.post(`/users/${row.rawUserId}/document-reminder`);
        if (!response.success) {
          throw new Error(response.message || "Failed to send reminder");
        }
        return;
      }

      const response = await api.post(
        `/trainer-documents/trainer/${row.id}/approach`,
      );
      if (!response.success) {
        throw new Error(response.message || "Failed to send reminder");
      }
    });
  };

  const handleOpenVerificationQueue = (row) => {
    if (row.sourceType !== "trainer") {
      return;
    }

    sessionStorage.setItem("trainerVerificationSelection", row.id);
    router.push(`/dashboard/documents?trainerId=${encodeURIComponent(row.id)}`);
  };

  const handleOpenTrainerRow = (row) => {
    if (row.sourceType !== "trainer") {
      return;
    }

    if (viewMode === "review" && ["under_review", "uploaded"].includes(row.workflow.documentStatus)) {
      handleOpenVerificationQueue(row);
      return;
    }

    handleTrainerClick(row);
  };

  const handleExportExcel = useCallback(async () => {
    try {
      setExportingType("excel");
      await runWhenIdle(async () => {
        const XLSX = await import("xlsx");
        const exportRows = displayData.map((item) => ({
          Name: item.displayName,
          Email: item.displayEmail,
          City: item.displayCity,
          Reference: item.displayReference,
          Status: getDocumentStatusMeta(item.workflow.documentStatus).label,
          Progress: `${item.workflow.uploadedCount}/${item.workflow.requiredCount}`,
          Missing:
            item.workflow.missingDocuments.length > 0
              ? item.workflow.missingDocuments.map((doc) => doc.label).join(", ")
              : "-",
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Trainer Hub");
        XLSX.writeFile(
          workbook,
          `TrainerHub_${viewMode}_${new Date().toISOString().split("T")[0]}.xlsx`,
        );
      });
    } finally {
      setExportingType("");
    }
  }, [displayData, viewMode]);

  const handleExportPDF = useCallback(async () => {
    try {
      setExportingType("pdf");
      await runWhenIdle(async () => {
        const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
          import("jspdf"),
          import("jspdf-autotable"),
        ]);
        const doc = new jsPDF("l", "mm", "a4");
        doc.text(`Trainer Hub - ${VIEW_META[viewMode].label}`, 14, 15);

        const tableRows = displayData.map((item) => [
          item.displayName,
          item.displayEmail,
          item.displayCity,
          item.displayReference,
          `${item.workflow.uploadedCount}/${item.workflow.requiredCount}`,
          getDocumentStatusMeta(item.workflow.documentStatus).label,
          item.workflow.missingDocuments.length > 0
            ? item.workflow.missingDocuments.map((docItem) => docItem.label).join(", ")
            : "-",
        ]);

        autoTable(doc, {
          head: [[
            "Trainer",
            "Email",
            "City",
            "Reference",
            "Progress",
            "Status",
            "Missing Documents",
          ]],
          body: tableRows,
          startY: 20,
          theme: "grid",
          headStyles: { fillColor: [79, 70, 229] },
          styles: { fontSize: 8 },
        });

        doc.save(
          `TrainerHub_${viewMode}_${new Date().toISOString().split("T")[0]}.pdf`,
        );
      });
    } finally {
      setExportingType("");
    }
  }, [displayData, viewMode]);

  const renderPrimaryAction = useCallback((row) => {
    const isLoading = actionLoadingKey.includes(row.id);

    if (row.sourceType === "pendingUser") {
      return (
        <>
          <button
            type="button"
            onClick={() => handleApproachTrainer(row)}
            disabled={Boolean(actionLoadingKey)}
            className="inline-flex items-center rounded-xl bg-amber-500 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PaperAirplaneIcon className="mr-1.5 h-4 w-4" />
            {isLoading ? "Sending..." : "Approach"}
          </button>
          {canApproveTrainerAdmission && (
            <button
              type="button"
              onClick={() => handleApproveUser(row.rawUserId)}
              className="inline-flex items-center rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white transition hover:bg-emerald-700"
            >
              Approve
            </button>
          )}
          {canRejectTrainerAdmission && (
            <button
              type="button"
              onClick={() => handleRejectUser(row.rawUserId)}
              className="inline-flex items-center rounded-xl border border-rose-200 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-rose-600 transition hover:bg-rose-50"
            >
              Reject
            </button>
          )}
        </>
      );
    }

    if (["under_review", "uploaded"].includes(row.workflow.documentStatus)) {
      return (
        <button
          type="button"
          onClick={() => handleOpenVerificationQueue(row)}
          className="inline-flex items-center rounded-xl bg-sky-600 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white transition hover:bg-sky-700"
        >
          <EyeIcon className="mr-1.5 h-4 w-4" />
          Verify
        </button>
      );
    }

    if (["pending", "rejected"].includes(row.workflow.documentStatus)) {
      return (
        <button
          type="button"
          onClick={() => handleApproachTrainer(row)}
          disabled={Boolean(actionLoadingKey)}
          className={`inline-flex items-center rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
            row.workflow.documentStatus === "rejected"
              ? "bg-rose-600 hover:bg-rose-700"
              : "bg-amber-500 hover:bg-amber-600"
          }`}
        >
          <ChatBubbleLeftEllipsisIcon className="mr-1.5 h-4 w-4" />
          {isLoading ? "Sending..." : "Approach"}
        </button>
      );
    }

    return null;
  }, [
    actionLoadingKey,
    canApproveTrainerAdmission,
    canRejectTrainerAdmission,
    handleApproveUser,
    handleApproachTrainer,
    handleOpenVerificationQueue,
    handleRejectUser,
  ]);

  const renderManagementButtons = useCallback((row) => {
    if (row.sourceType !== "trainer") {
      return null;
    }

    const isApprovedView = ["approved", "deactivated"].includes(viewMode);

    return (
      <>
        <button
          type="button"
          onClick={() => handleTrainerClick(row)}
          className="rounded-xl border border-blue-100 bg-blue-50 p-2.5 text-blue-600 transition hover:scale-105"
          title="View Profile"
        >
          <EyeIcon className="h-4 w-4" />
        </button>
        {isApprovedView && (
          <button
            type="button"
            onClick={() => handleToggleAccountStatus(row)}
            className={`rounded-xl border p-2.5 transition hover:scale-105 ${
              row.userId?.isActive
                ? "border-rose-100 bg-rose-50 text-rose-600"
                : "border-emerald-100 bg-emerald-50 text-emerald-600"
            }`}
            title={row.userId?.isActive ? "Deactivate Account" : "Activate Account"}
          >
            <PowerIcon className="h-4 w-4" />
          </button>
        )}
        {viewMode === "approved" && (
          <button
            type="button"
            onClick={(event) => handleDeleteClick(row, event)}
            className="rounded-xl border border-rose-100 bg-rose-50 p-2.5 text-rose-600 transition hover:scale-105"
            title="Delete Trainer"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </>
    );
  }, [
    viewMode,
    handleDeleteClick,
    handleToggleAccountStatus,
    handleTrainerClick,
  ]);

  const getAccountStatusMeta = useCallback((row) => {
    if (row.sourceType !== "trainer") {
      return null;
    }

    if (row.userId?.isActive === false) {
      return {
        label: "Deactivated",
        className: "border-rose-200 bg-rose-50 text-rose-600",
      };
    }

    if (!isTrainerFinallyApproved(row)) {
      return {
        label: "Awaiting Approval",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    }

    return {
      label: "Account Active",
      className: "border-emerald-200 bg-emerald-50 text-emerald-600",
    };
  }, []);

  const handleRowImageError = useCallback((rowId, nextIndex) => {
    setImageLoadError((previous) => ({
      ...previous,
      [rowId]: nextIndex,
    }));
  }, []);

  const currentViewMeta = VIEW_META[viewMode];
  const showReviewQueueStatusColumns = viewMode !== "review";
  // Only block the table on the PRIMARY trainer list query. The pending-signups
  // query is a secondary augmentation of the "pending" queue; if it is slow (or
  // hanging) it must NOT keep the whole list hidden behind the spinner after the
  // trainers themselves have already loaded.
  const loading = isSuperAdminView && trainersQuery.isLoading;

  if (!isSuperAdminView) {
    return (
      <div className="w-full px-4 py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5">
          <h2 className="font-calibri text-lg font-bold text-amber-900">
            Trainer Hub Access Is Restricted
          </h2>
          <p className="mt-1 font-calibri text-sm text-amber-700">
            This section is available only for Super Admin accounts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <RenderProfiler id="AdminTrainerList">
    <div className="w-full px-4">
      <TrainerProfileModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        trainer={selectedTrainer}
        onUpdate={refreshQueues}
      />

      <PasswordConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setTrainerToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Trainer"
        message={`Are you sure you want to delete trainer "${
          trainerToDelete?.displayName || trainerToDelete?.name || "this trainer"
        }"? This action cannot be undone.`}
      />

      <div className="flex flex-col justify-between gap-4 border-b border-gray-200 py-4 md:flex-row md:items-center">
        <div>
          <h1 className="font-calibri text-xl font-bold uppercase tracking-wider text-gray-800">
            Trainer Hub
          </h1>
          <p className="mt-1 font-calibri text-sm text-gray-500">
            Track missing documents, verify completed submissions, and activate accounts after approval.
          </p>
          <p className="mt-1 font-calibri text-[11px] font-bold uppercase tracking-widest text-gray-400">
            Loaded {trainers.length} / {Math.max(totalTrainerRecords, trainers.length)} trainer records
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border-r border-gray-200 pr-2">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={Boolean(exportingType)}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 font-calibri text-xs font-bold text-gray-700 transition hover:bg-gray-50"
            >
              {exportingType === "excel" ? "Exporting..." : "Excel"}
            </button>
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={Boolean(exportingType)}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 font-calibri text-xs font-bold text-red-600 transition hover:bg-red-50"
            >
              {exportingType === "pdf" ? "Exporting..." : "PDF"}
            </button>
            <button
              type="button"
              onClick={() => {
                setScheduleError("");
                setScheduleSuccess("");
                setScheduleForm((prev) => ({
                  ...INITIAL_SCHEDULE_FORM,
                  trainerId:
                    selectedTrainer?.id || selectedTrainer?._id || prev.trainerId || "",
                }));
                setIsScheduleModalOpen(true);
              }}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 font-calibri text-xs font-bold text-slate-700 transition hover:bg-gray-50"
            >
              Schedule
            </button>
          </div>

          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              autoComplete="off"
              className="block w-72 rounded-lg border border-gray-300 bg-white py-1.5 pl-9 pr-3 font-calibri text-sm outline-none transition focus:border-indigo-500"
              placeholder="Search trainers, email, city or status..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

        </div>
      </div>

      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsScheduleModalOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Create Trainer Schedule</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create a new schedule entry for one of your trainers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setScheduleError("");
                setScheduleSuccess("");

                if (!scheduleForm.trainerId || !scheduleForm.collegeId || !scheduleForm.scheduledDate || !scheduleForm.startTime || !scheduleForm.endTime) {
                  setScheduleError("Please select a trainer, college, date, and specify both start and end times.");
                  return;
                }

                try {
                  setScheduleSubmitting(true);
                  const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
                  const user = userStr ? JSON.parse(userStr) : null;

                  await scheduleService.createSchedule({
                    trainerId: scheduleForm.trainerId,
                    collegeId: scheduleForm.collegeId,
                    courseId: scheduleForm.courseId || undefined,
                    scheduledDate: scheduleForm.scheduledDate,
                    startTime: scheduleForm.startTime || undefined,
                    endTime: scheduleForm.endTime || undefined,
                    dayNumber: parseInt(scheduleForm.dayNumber, 10) || 1,
                    subject: scheduleForm.subject || undefined,
                    createdBy: user?.id,
                  });

                  setScheduleSuccess("Schedule created successfully!");
                  setScheduleForm(INITIAL_SCHEDULE_FORM);
                  notify.success("Schedule created successfully!");
                } catch (error) {
                  console.error("Error creating schedule:", error);
                  setScheduleError(
                    getErrorMessage(error, "Failed to create schedule. Please try again."),
                  );
                } finally {
                  setScheduleSubmitting(false);
                }
              }}
              className="space-y-4 px-6 pb-6 pt-4"
            >
              {scheduleError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {scheduleError}
                </div>
              ) : null}
              {scheduleSuccess ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {scheduleSuccess}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <SearchableDropdown
                  label="Trainer"
                  id="schedule-trainer"
                  options={trainerRows}
                  value={scheduleForm.trainerId}
                  onChange={(trainer) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      trainerId: trainer?.id || trainer?._id || "",
                    }))
                  }
                  getOptionLabel={(trainer) => trainer.displayName || "Unnamed Trainer"}
                  getOptionValue={(trainer) => trainer.id || trainer._id}
                  searchFields={["displayName", "displayEmail", "displayCity", "displayReference"]}
                  showSearch={true}
                  error={scheduleError && !scheduleForm.trainerId ? "Trainer is required" : ""}
                />
                <div>
                  <label htmlFor="schedule-college" className="block text-sm font-semibold text-slate-700">
                    College
                  </label>
                  <select
                    id="schedule-college"
                    name="collegeId"
                    value={scheduleForm.collegeId}
                    onChange={(event) =>
                      setScheduleForm((prev) => ({ ...prev, collegeId: event.target.value }))
                    }
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Select college</option>
                    {scheduleAssociations.colleges.map((college) => (
                      <option key={college.id || college._id || college.name} value={college.id || college._id}>
                        {college.name || college.title || "College"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="schedule-course" className="block text-sm font-semibold text-slate-700">
                    Course
                  </label>
                  <select
                    id="schedule-course"
                    name="courseId"
                    value={scheduleForm.courseId}
                    onChange={(event) =>
                      setScheduleForm((prev) => ({ ...prev, courseId: event.target.value }))
                    }
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Select course (optional)</option>
                    {scheduleAssociations.courses.map((course) => (
                      <option key={course.id || course._id || course.name} value={course.id || course._id}>
                        {course.name || course.title || "Course"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="schedule-date" className="block text-sm font-semibold text-slate-700">
                    Scheduled Date
                  </label>
                  <input
                    id="schedule-date"
                    name="scheduledDate"
                    type="date"
                    value={scheduleForm.scheduledDate}
                    onChange={(event) =>
                      setScheduleForm((prev) => ({ ...prev, scheduledDate: event.target.value }))
                    }
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="schedule-start" className="block text-sm font-semibold text-slate-700">
                    Start Time
                  </label>
                  <input
                    id="schedule-start"
                    name="startTime"
                    type="time"
                    required
                    value={scheduleForm.startTime}
                    onChange={(event) =>
                      setScheduleForm((prev) => ({ ...prev, startTime: event.target.value }))
                    }
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label htmlFor="schedule-end" className="block text-sm font-semibold text-slate-700">
                    End Time
                  </label>
                  <input
                    id="schedule-end"
                    name="endTime"
                    type="time"
                    required
                    value={scheduleForm.endTime}
                    onChange={(event) =>
                      setScheduleForm((prev) => ({ ...prev, endTime: event.target.value }))
                    }
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label htmlFor="schedule-day" className="block text-sm font-semibold text-slate-700">
                    Day Number
                  </label>
                  <input
                    id="schedule-day"
                    name="dayNumber"
                    type="number"
                    min="1"
                    value={scheduleForm.dayNumber}
                    onChange={(event) =>
                      setScheduleForm((prev) => ({ ...prev, dayNumber: event.target.value }))
                    }
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="schedule-subject" className="block text-sm font-semibold text-slate-700">
                  Subject / Notes
                </label>
                <input
                  id="schedule-subject"
                  name="subject"
                  type="text"
                  value={scheduleForm.subject}
                  onChange={(event) =>
                    setScheduleForm((prev) => ({ ...prev, subject: event.target.value }))
                  }
                  className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Session subject / activity name"
                />
              </div>

              <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="inline-flex justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scheduleSubmitting}
                  className="inline-flex justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {scheduleSubmitting ? "Creating…" : "Create Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {trainerDashboardStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.key}
              className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${stat.tone} p-5 text-white shadow-lg shadow-slate-200/80`}
            >
              <div className="absolute -right-3 -top-3 h-14 w-14 rounded-full bg-white/15 blur-sm" />
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/85">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-3xl font-black leading-none">{stat.value}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-white/85">
                    {stat.subLabel}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/30 bg-white/20 p-2.5">
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 mb-6 flex items-center justify-between border-b border-gray-200">
        <div className="flex flex-wrap gap-8">
          {Object.entries(VIEW_META).map(([key, meta]) => {
            const count = queues[key]?.length || 0;
            const isActive = viewMode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => startViewTransition(() => setViewMode(key))}
                className={`border-b-2 px-1 pb-4 font-calibri text-sm font-bold transition-all ${
                  isActive
                    ? meta.activeClass
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                {meta.label}
                {count > 0 && (
                  <span
                    className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-black text-white ${
                      key === "pending"
                        ? "bg-amber-500"
                        : key === "review"
                            ? "bg-sky-500"
                            : key === "approved"
                              ? "bg-indigo-500"
                              : "bg-slate-500"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="hidden pb-4 font-calibri text-xs font-bold uppercase tracking-widest text-gray-400 md:block">
          {debouncedSearchTerm !== searchTerm
            ? "Searching..."
            : `${displayData.length} visible`}
        </p>
      </div>

      <div className="mt-4 flex flex-col">
        <div className="min-w-full overflow-x-auto">
          <div className="inline-block min-w-full align-middle">
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              {loading ? (
                <div className="flex flex-col items-center py-20 text-center">
                  <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
                  <p className="font-calibri text-sm font-bold text-gray-500">
                    Retrieving Records...
                  </p>
                </div>
              ) : displayData.length === 0 ? (
                <div className="bg-gray-50/50 py-20 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
                    <ChatBubbleLeftEllipsisIcon className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="font-calibri text-lg font-bold text-gray-900">
                    {currentViewMeta.emptyTitle}
                  </h3>
                  <p className="mx-auto mt-1 max-w-md font-calibri text-sm text-gray-500">
                    {currentViewMeta.emptyText}
                  </p>
                </div>
              ) : (
                <TrainerListVirtualizedTable
                  rows={displayData}
                  showStatusColumns={showReviewQueueStatusColumns}
                  imageLoadError={imageLoadError}
                  onImageError={handleRowImageError}
                  onRowClick={handleOpenTrainerRow}
                  onRowHover={prefetchTrainerDetails}
                  onLoadMore={loadMoreTrainers}
                  hasNextPage={Boolean(trainersQuery.hasNextPage)}
                  isFetchingNextPage={trainersQuery.isFetchingNextPage}
                  totalRowCount={totalTrainerRecords}
                  loadedRowCount={trainers.length}
                  renderPrimaryAction={renderPrimaryAction}
                  renderManagementButtons={renderManagementButtons}
                  getAccountStatusMeta={getAccountStatusMeta}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </RenderProfiler>
  );
};

export default memo(TrainerList);
