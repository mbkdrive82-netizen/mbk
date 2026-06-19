"use client";

import { memo, useCallback, useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Upload,
  Button,
  Tag,
  message,
  Row,
  Col,
  Typography,
  Divider,
  Space,
  Avatar,
  Modal,
  Alert,
  Form,
  Input,
  AutoComplete,
} from "antd";
import {
  UploadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  SafetyCertificateOutlined,
  FileTextOutlined,
  LockOutlined,
  EyeOutlined,
  BankOutlined,
  IdcardOutlined,
  ReadOutlined,
  EditOutlined,
} from "@ant-design/icons";
import {
  uploadDocument,
  getTrainerProfile,
  submitVerification,
  updateTrainerProfile,
} from "@/services/trainerService";
import { getCities } from "@/services/cityService";
import {
  getDocumentImagePreviewCandidates,
  getProfilePictureUrl,
} from "@/utils/imageUtils";
import {
  REQUIRED_TRAINER_DOCUMENTS,
  getDocumentStatusMeta,
} from "@/utils/trainerDocumentWorkflow";
import dynamic from "next/dynamic";
const IDCardModal = dynamic(() => import("@/components/modals/IDCardModal"), { ssr: false });
import MobileTrainerLayout from "@/app/layouts/MobileTrainerLayout";
import { useAuth } from "@/context/AuthContext";
import { canGenerateTrainerIdCard } from "@/utils/trainerIdCard";
import DocumentUploadLoadingState from "@/components/common/DocumentUploadLoadingState";
import ProfileIdentityHeaderCard from "./TrainerProfile/ProfileIdentityHeaderCard";
import OptimizedImage from "@/components/common/OptimizedImage";
import { normalizeAuthUser } from "@/utils/authRoles";
import { clearPortalDataBundle } from "@/utils/portalDataPrefetch";

const { Title, Text } = Typography;

const buildUserSyncSnapshot = (user) => {
  if (!user || typeof user !== "object") return "";
  const normalizedUser = normalizeAuthUser(user);
  const { accessToken, ...rest } = normalizedUser;
  return JSON.stringify({
    ...rest,
    accessToken: accessToken || null,
  });
};

const DOCUMENT_UPLOAD_CONFIG = [
  { key: "selfiePhoto", title: "Live Selfie", accept: ".jpg,.jpeg,.png" },
  { key: "passportPhoto", title: "Passport Photo", accept: ".jpg,.jpeg,.png" },
  { key: "aadharFront", title: "Aadhaar Front", accept: ".jpg,.jpeg,.png,.pdf" },
  { key: "aadharBack", title: "Aadhaar Back", accept: ".jpg,.jpeg,.png,.pdf" },
  { key: "pan", title: "PAN Card", accept: ".jpg,.jpeg,.png,.pdf" },
  { key: "passbook", title: "Bank Proof", accept: ".jpg,.jpeg,.png,.pdf" },
  { key: "degreePdf", title: "Degree Certificate", accept: ".jpg,.jpeg,.png,.pdf" },
  { key: "resumePdf", title: "Resume (PDF only)", accept: ".pdf" },
];

const DocumentCard = memo(function DocumentCard({
  documentKey,
  title,
  accept,
  status,
  onUploadDocument,
  uploading,
  rejectionReason,
  fileUrl,
}) {
  const isUploading = Boolean(uploading);
  const isApproved = status === "APPROVED";
  const isUploaded = status === "UPLOADED";
  const isRejected = status === "REJECTED";
  const isPending = status === "PENDING";
  const canPreview = isApproved || isUploaded || isPending;
  const handleBeforeUpload = useCallback(
    (file) => {
      onUploadDocument(documentKey, file);
      return false;
    },
    [documentKey, onUploadDocument],
  );
  const handlePreviewDocument = useCallback(() => {
    if (!fileUrl) return;
    window.open(fileUrl, "_blank");
  }, [fileUrl]);

  return (
    <Card className="h-full border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 rounded-2xl overflow-hidden group">
      <div className="flex flex-col h-full bg-white relative">
        {/* Status Header */}
        <div className="flex justify-end items-center p-4">
          <div>
            {isUploading && (
              <Tag className="m-0 rounded-full px-3 py-0.5 border-0 bg-sky-50 text-sky-600 font-bold text-[10px] uppercase tracking-wider">
                <UploadOutlined className="mr-1" /> Uploading
              </Tag>
            )}
            {!isUploading && isApproved && (
              <Tag className="m-0 rounded-full px-3 py-0.5 border-0 bg-emerald-50 text-emerald-600 font-bold text-[10px] uppercase tracking-wider">
                <CheckCircleOutlined className="mr-1" /> Approved
              </Tag>
            )}
            {!isUploading && isUploaded && (
              <Tag className="m-0 rounded-full px-3 py-0.5 border-0 bg-emerald-50 text-emerald-600 font-bold text-[10px] uppercase tracking-wider">
                <UploadOutlined className="mr-1" /> Uploaded
              </Tag>
            )}
            {!isUploading && isRejected && (
              <Tag className="m-0 rounded-full px-3 py-0.5 border-0 bg-rose-50 text-rose-600 font-bold text-[10px] uppercase tracking-wider">
                <CloseCircleOutlined className="mr-1" /> Rejected
              </Tag>
            )}
            {!isUploading && isPending && (
              <Tag className="m-0 rounded-full px-3 py-0.5 border-0 bg-sky-50 text-sky-600 font-bold text-[10px] uppercase tracking-wider">
                <ClockCircleOutlined className="mr-1" /> Under Review
              </Tag>
            )}
            {!isUploading &&
              !isApproved &&
              !isUploaded &&
              !isRejected &&
              !isPending && (
              <Tag className="m-0 rounded-full px-3 py-0.5 border-0 bg-slate-100 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                Required
              </Tag>
            )}
          </div>
        </div>

        {/* Main Content (Centered) */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6 text-center">
          {/* Icon Container */}
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-all duration-500 ${
              isApproved || isUploaded
                ? "bg-emerald-50 text-emerald-500"
                : isRejected
                  ? "bg-rose-50 text-rose-500"
                  : isPending
                    ? "bg-sky-50 text-sky-500"
                    : "bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500"
            }`}
          >
            <div className="text-3xl">
              {title.toLowerCase().includes("resume") ? (
                <FileTextOutlined />
              ) : title.toLowerCase().includes("bank") ? (
                <BankOutlined />
              ) : title.toLowerCase().includes("degree") ? (
                <ReadOutlined />
              ) : (
                <IdcardOutlined />
              )}
            </div>
          </div>

          <h4 className="text-slate-800 font-extrabold text-sm uppercase tracking-widest mb-4 leading-tight">
            {title}
          </h4>

          {/* Rejection Note */}
          {isRejected && rejectionReason && (
            <div className="w-full bg-rose-50/50 border border-rose-100 rounded-xl p-3 mb-4">
              <Text className="text-[11px] text-rose-600 block italic leading-snug">
                "{rejectionReason}"
              </Text>
            </div>
          )}

            {/* Action Section */}
            <div className="w-full mt-auto">
            {isUploading ? (
              <DocumentUploadLoadingState
                title={title}
                hint="Securing your file and attaching it to the trainer profile."
                steps={
                  title.toLowerCase().includes("selfie")
                    ? ["Preparing capture", "Securing upload", "Updating profile"]
                    : ["Scanning file", "Securing upload", "Updating profile"]
                }
              />
            ) : canPreview ? (
              <div className="flex flex-col gap-2">
                <div className="w-full relative h-[120px] rounded-xl overflow-hidden border border-emerald-200 group-hover:border-emerald-300 transition-all bg-slate-50">
                  {/* Image Preview or Generic Icon */}
                  {fileUrl &&
                  (accept.includes("image") ||
                    fileUrl.match(/\.(jpeg|jpg|png)$/i)) ? (
                    <OptimizedImage
                      src={fileUrl}
                      alt={title}
                      width={200}
                      height={120}
                      className="w-full h-full object-cover opacity-60"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-50">
                      <FileTextOutlined className="text-4xl text-slate-300" />
                    </div>
                  )}

                  {/* Secured Overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-50/40 backdrop-blur-[1px]">
                    <div className="bg-white/90 p-2 rounded-full shadow-sm mb-1">
                      <SafetyCertificateOutlined className="text-2xl text-emerald-500" />
                    </div>
                    <Text
                      strong
                      className={`text-[10px] uppercase tracking-widest bg-white/80 px-2 py-0.5 rounded-md shadow-xs ${
                        isPending ? "text-sky-700" : "text-emerald-700"
                      }`}
                    >
                      {isPending ? "Locked For Review" : "Document Secured"}
                    </Text>
                  </div>
                </div>
                <div className="flex gap-2">
                  {fileUrl && (
                    <Button
                      block
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={handlePreviewDocument}
                      className="h-8 rounded-lg font-bold text-[10px] uppercase tracking-widest border border-indigo-100 text-indigo-600 hover:bg-indigo-50 shadow-sm"
                    >
                      View
                    </Button>
                  )}
                  {!isApproved && !isPending && (
                    <Upload
                      accept={accept}
                      showUploadList={false}
                      beforeUpload={handleBeforeUpload}
                      disabled={isUploading}
                      className="w-full"
                    >
                      <Button
                        block
                        size="small"
                        icon={<UploadOutlined />}
                        loading={isUploading}
                        className="h-8 rounded-lg font-bold text-[10px] uppercase tracking-widest border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 bg-white"
                      >
                        Update
                      </Button>
                    </Upload>
                  )}
                </div>
              </div>
            ) : (
              <Upload
                accept={accept}
                showUploadList={false}
                beforeUpload={handleBeforeUpload}
                disabled={isUploading}
                className="w-full"
              >
                <Button
                  block
                  icon={<UploadOutlined />}
                  loading={isUploading}
                  className={`h-11 rounded-xl font-bold text-xs uppercase tracking-widest border-0 shadow-sm transition-all ${
                    isRejected
                      ? "bg-rose-600 text-white hover:bg-rose-700"
                      : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 text-shadow-sm"
                  }`}
                >
                  {isRejected ? "Re-Upload File" : "Upload Document"}
                </Button>
              </Upload>
            )}

            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="h-px w-4 bg-slate-100"></span>
              <Text
                type="secondary"
                className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter"
              >
                {accept === ".pdf" || accept === "application/pdf"
                  ? "PDF ONLY"
                  : "JPG / PNG / PDF"}
              </Text>
              <span className="h-px w-4 bg-slate-100"></span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
});

const TrainerProfile = () => {
  const { currentUser, setAuthUser } = useAuth();
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const [isIDCardOpen, setIsIDCardOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [profileImageIndex, setProfileImageIndex] = useState(0);
  const queryClient = useQueryClient();

  const {
    data: profile = null,
    isLoading: loading,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ["trainer-profile"],
    queryFn: async () => {
      const response = await getTrainerProfile(`?t=${Date.now()}`);
      return response?.data || null;
    },
  });

  const {
    data: cities = [],
  } = useQuery({
    queryKey: ["cities"],
    queryFn: async () => {
      const response = await getCities();
      return Array.isArray(response) ? response : [];
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (values) => updateTrainerProfile(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainer-profile"] });
    },
  });

  useEffect(() => {
    if (!profile || !setAuthUser || !currentUser) {
      return;
    }

    const token =
      currentUser.accessToken ||
      (typeof window !== "undefined" ? localStorage.getItem("accessToken") : null);
    const updatedUser = normalizeAuthUser({
      ...currentUser,
      ...profile,
      accessToken: token,
    });

    const currentSnapshot = buildUserSyncSnapshot({
      ...currentUser,
      accessToken: token,
    });
    const nextSnapshot = buildUserSyncSnapshot(updatedUser);
    if (currentSnapshot === nextSnapshot) {
      return;
    }

    setAuthUser(updatedUser);
  }, [currentUser, profile, setAuthUser]);

  const profileImageSources = useMemo(() => {
    const sources = [
      profile?.documentProgress?.selfiePhoto,
      profile?.documents?.selfiePhoto,
      profile?.photo,
      profile?.profilePicture,
      profile?.documentProgress?.passportPhoto,
      profile?.documents?.passportPhoto,
      currentUser?.profilePicture,
    ];

    return Array.from(
      new Set(
        sources.flatMap((source) => getDocumentImagePreviewCandidates(source)),
      ),
    );
  }, [
    profile?.documentProgress?.selfiePhoto,
    profile?.documentProgress?.passportPhoto,
    profile?.documents?.selfiePhoto,
    profile?.documents?.passportPhoto,
    profile?.photo,
    profile?.profilePicture,
    currentUser?.profilePicture,
  ]);

  useEffect(() => {
    setProfileImageIndex(0);
  }, [profileImageSources]);

  const profileImageSrc = profileImageSources[profileImageIndex];

  const handleProfileImageError = useCallback(() => {
    if (profileImageIndex < profileImageSources.length - 1) {
      setProfileImageIndex((currentIndex) => currentIndex + 1);
      return false;
    }

    return true;
  }, [profileImageIndex, profileImageSources.length]);

  const handleEditSave = async (values) => {
    try {
      const response = await updateProfileMutation.mutateAsync(values);
      if (response.success) {
        message.success("Profile updated successfully");
        setIsEditModalOpen(false);
        refetchProfile();
      } else {
        message.error(response.message || "Update failed");
      }
    } catch (error) {
      console.error("Update error:", error);
      message.error("Error updating profile");
    }
  };

  const uploadDoc = useCallback(async (type, file) => {
    const allowedTypes = {
      selfiePhoto: ["image/jpeg", "image/png"],
      passportPhoto: ["image/jpeg", "image/png"],
      aadharFront: ["image/jpeg", "image/png", "application/pdf"],
      aadharBack: ["image/jpeg", "image/png", "application/pdf"],
      pan: ["image/jpeg", "image/png", "application/pdf"],
      passbook: ["image/jpeg", "image/png", "application/pdf"],
      degreePdf: ["image/jpeg", "image/png", "application/pdf"],
      resumePdf: ["application/pdf"],
    };

    if (!allowedTypes[type] || !allowedTypes[type].includes(file.type)) {
      message.error("Invalid file for this document");
      return Upload.LIST_IGNORE;
    }

    const formData = new FormData();
    formData.append("document", file);
    formData.append("documentType", type);

    try {
      setUploadingDoc(type);
      const response = await uploadDocument(formData);
      if (response.success) {
        message.success(`${type} uploaded successfully`);
        clearPortalDataBundle();
        queryClient.invalidateQueries({ queryKey: ["trainer"] });
        refetchProfile();
      } else {
        message.error(response.message || "Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
      message.error("Error uploading document");
    } finally {
      setUploadingDoc(null);
    }
  }, [queryClient, refetchProfile]);

  const handleUploadDocument = useCallback((documentKey, file) => {
    void uploadDoc(documentKey, file);
  }, [uploadDoc]);

  const handleSelfieUploadBefore = useCallback((file) => {
    handleUploadDocument("selfiePhoto", file);
    return false;
  }, [handleUploadDocument]);

  const handleOpenIdCard = useCallback(() => {
    setIsIDCardOpen(true);
  }, []);

  const handleSubmitForVerification = async () => {
    try {
      const response = await submitVerification();
      if (response.success) {
        Modal.success({
          title: "Submitted!",
          content:
            "Your documents have been submitted for verification. An administrator will review them shortly.",
          onOk: refetchProfile,
        });
      } else {
        message.error(response.message || "Submission failed");
      }
    } catch (error) {
      console.error("Submit error:", error);
      message.error("Error submitting for verification");
    }
  };

  if (loading) {
    return (
      <MobileTrainerLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Title level={4}>Loading Profile...</Title>
          <Button type="link" loading>
            Verifying Credentials
          </Button>
        </div>
      </MobileTrainerLayout>
    );
  }

  const documentProgress = profile?.documentProgress || {};
  const latestDocumentEntries = Object.entries(documentProgress).filter(
    ([key, value]) => key !== "verification" && Boolean(value),
  );
  const docs = {
    ...(profile?.documents || {}),
    ...Object.fromEntries(latestDocumentEntries),
  };
  const verification = profile?.documents?.verification || {};
  const requiredKeys = REQUIRED_TRAINER_DOCUMENTS.map(({ key }) => key);
  const uploadedCount =
    profile?.documentSummary?.uploadedCount ??
    requiredKeys.filter((key) => docs[key]).length;
  const requiredCount =
    profile?.documentSummary?.requiredCount ?? REQUIRED_TRAINER_DOCUMENTS.length;
  const missingDocuments =
    profile?.missingDocuments?.length > 0
      ? profile.missingDocuments
      : REQUIRED_TRAINER_DOCUMENTS.filter(({ key }) => !docs[key]);
  const rejectedDocuments =
    profile?.rejectedDocuments?.length > 0
      ? profile.rejectedDocuments
      : REQUIRED_TRAINER_DOCUMENTS.filter(({ key }) => verification[key]?.reason);
  const allUploaded = requiredKeys.every((key) => docs[key]);
  const anyRejected = rejectedDocuments.length > 0;
  const workflowStatus = profile?.documentStatus || (allUploaded ? "uploaded" : "pending");
  const workflowMeta = getDocumentStatusMeta(workflowStatus);
  const canSubmit =
    allUploaded &&
    !anyRejected &&
    !["under_review", "approved"].includes(workflowStatus);
  const buildDocumentCardStatus = (key) => {
    if (verification[key]?.verified) {
      return "APPROVED";
    }
    if (verification[key]?.reason) {
      return "REJECTED";
    }
    if (docs[key] && workflowStatus === "under_review") {
      return "PENDING";
    }
    if (docs[key]) {
      return "UPLOADED";
    }
    return "MISSING";
  };

  return (
    <MobileTrainerLayout>
      <>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="mb-0">
            <ProfileIdentityHeaderCard
              profile={profile}
              workflowStatus={workflowStatus}
              workflowMeta={workflowMeta}
              uploadingDoc={uploadingDoc}
              profileImageSrc={profileImageSrc}
              onProfileImageError={handleProfileImageError}
              onSelfieUploadBefore={handleSelfieUploadBefore}
              onOpenIdCard={handleOpenIdCard}
            />
          </div>

          {/* Personal Information Section - Detailed Grid Layout */}
          <div className="mb-10">
            {["under_review", "approved"].includes(workflowStatus) && (
              <Alert
                title={<span className="font-bold">Profile Locked</span>}
                description={
                  workflowStatus === "approved"
                    ? "Your profile information has been verified and is now locked. Please contact support if you need to update these details."
                    : "Your profile is currently under review, so profile changes are temporarily locked."
                }
                type="info"
                showIcon
                icon={<LockOutlined />}
                className="mb-4 rounded-xl border-indigo-100 bg-indigo-50/50 text-indigo-800"
              />
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div>
                <Title
                  level={4}
                  className="m-0 text-gray-800 font-calibri uppercase tracking-wider border-l-4 border-indigo-600 pl-3"
                >
                  Personal Information
                </Title>
                <Text className="text-xs text-slate-500 block mt-2 max-w-2xl">
                  Keep your trainer profile contact and location details current. Editing is disabled while verification is in progress.
                </Text>
              </div>
              <Button
                type="primary"
                ghost
                icon={
                  ["under_review", "approved"].includes(workflowStatus) ? (
                    <LockOutlined />
                  ) : (
                    <EditOutlined />
                  )
                }
                size="small"
                disabled={["under_review", "approved"].includes(workflowStatus)}
                onClick={() => {
                  editForm.setFieldsValue({
                    name: profile?.name,
                    phoneNumber: profile?.phone,
                    specialization: profile?.specialization,
                    city: profile?.city,
                  });
                  setIsEditModalOpen(true);
                }}
                className="rounded-lg font-bold"
                title={
                  ["under_review", "approved"].includes(workflowStatus)
                    ? "Documents are locked while review is in progress."
                    : "Edit Profile"
                }
              >
                {[
                  "under_review",
                  "approved",
                ].includes(workflowStatus)
                  ? workflowStatus === "approved"
                    ? "Verified (Locked)"
                    : "Review In Progress"
                  : "Edit Info"}
              </Button>
            </div>
            {workflowStatus === "approved" && (
              <Text className="text-xs text-slate-500 mb-4 block">
                Your profile is verified and locked. Please contact support if you need to request a change.
              </Text>
            )}
            {workflowStatus === "under_review" && (
              <Text className="text-xs text-slate-500 mb-4 block">
                Your trainer profile is under review and edits are temporarily disabled.
              </Text>
            )}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <Row gutter={[24, 24]}>
                <Col xs={24} md={12}>
                  <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-100 hover:border-indigo-100 transition-colors">
                    <Text
                      type="secondary"
                      className="text-xs font-bold uppercase tracking-widest block mb-1"
                    >
                      Full Name
                    </Text>
                    <Text
                      strong
                      className="text-lg text-gray-800 font-calibri uppercase"
                    >
                      {profile?.name}
                    </Text>
                  </div>
                </Col>

                <Col xs={24} md={12}>
                  <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-100 hover:border-indigo-100 transition-colors">
                    <Text
                      type="secondary"
                      className="text-xs font-bold uppercase tracking-widest block mb-1"
                    >
                      Phone
                    </Text>
                    <Text
                      strong
                      className="text-lg text-gray-800 font-calibri tracking-wider"
                    >
                      {profile?.phone || "N/A"}
                    </Text>
                  </div>
                </Col>
                <Col xs={24} md={12}>
                  <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-100 hover:border-indigo-100 transition-colors">
                    <Text
                      type="secondary"
                      className="text-xs font-bold uppercase tracking-widest block mb-1"
                    >
                      Specialization
                    </Text>
                    <Text
                      strong
                      className="text-lg text-gray-800 font-calibri uppercase"
                    >
                      {profile?.specialization || "General Trainer"}
                    </Text>
                  </div>
                </Col>
                <Col xs={24} md={12}>
                  <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-100 hover:border-indigo-100 transition-colors">
                    <Text
                      type="secondary"
                      className="text-xs font-bold uppercase tracking-widest block mb-1"
                    >
                      City
                    </Text>
                    <Text
                      strong
                      className="text-lg text-gray-800 font-calibri uppercase"
                    >
                      {profile?.city || "N/A"}
                    </Text>
                  </div>
                </Col>
              </Row>

              <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    Account Status:
                  </span>
                  <Tag
                    color={profile?.isActive ? "green" : "red"}
                    className="rounded-md px-2 py-0.5 font-bold uppercase text-[10px] m-0 border-0"
                  >
                    {profile?.isActive ? "Active" : "Inactive"}
                  </Tag>
                </div>

                {canGenerateTrainerIdCard(profile) && (
                  <Button
                    type="text"
                    icon={<SafetyCertificateOutlined />}
                    onClick={handleOpenIdCard}
                    className="text-indigo-600 font-bold hover:bg-indigo-50"
                  >
                    View ID Card
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="mb-10 text-center">
            <Title
              level={3}
              className="mb-2 uppercase tracking-[0.2em] font-black text-slate-800"
            >
              Identity & Documents
            </Title>
            <Text
              type="secondary"
              className="text-xs uppercase tracking-widest font-bold text-slate-400"
            >
              Professional verification for secure scheduling
            </Text>
            <Divider className="my-6 border-slate-100" />

            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
              <Text className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">
                What to do next
              </Text>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  "Upload all required documents clearly.",
                  "Submit for verification once complete.",
                  "Wait for approval before accepting schedules.",
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-slate-100 bg-white px-3 py-2 text-[13px] text-slate-600">
                    {item}
                  </div>
                ))}
              </div>
            </div>

              type="info"
              showIcon={false}
              className="bg-indigo-50 border-indigo-100 rounded-2xl p-4 text-left"
            />
          </div>

          <div className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <Row gutter={[24, 24]} align="middle">
              <Col xs={24} lg={9}>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
                  <Text className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">
                    Registration Progress
                  </Text>
                  <div className="mt-3 flex items-end gap-3">
                    <Title level={2} className="mb-0! text-slate-900">
                      {uploadedCount}/{requiredCount}
                    </Title>
                    <Tag
                      className={`m-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${workflowMeta.badgeClass}`}
                    >
                      {workflowMeta.label}
                    </Tag>
                  </div>
                  <div className="mt-4 h-3 rounded-full bg-slate-200">
                    <div
                      className={`h-3 rounded-full ${
                        workflowStatus === "rejected"
                          ? "bg-rose-500"
                          : workflowStatus === "under_review"
                            ? "bg-sky-500"
                            : workflowStatus === "uploaded"
                              ? "bg-emerald-500"
                              : "bg-amber-400"
                      }`}
                      style={{
                        width: `${Math.max(8, (uploadedCount / requiredCount) * 100)}%`,
                      }}
                    />
                  </div>
                  <Text className="mt-3 block text-xs text-slate-500">
                    {workflowStatus === "under_review"
                      ? "Your documents are locked while the admin verifies them."
                      : workflowStatus === "approved"
                        ? "Your trainer account is activated and ready for scheduling."
                        : workflowStatus === "uploaded"
                          ? "All required documents are uploaded. Submit them to start review."
                          : "Upload the remaining required documents to continue your registration."}
                  </Text>
                  {missingDocuments.length > 0 && (
                    <Text className="mt-3 block text-xs text-rose-600 font-semibold">
                      {missingDocuments.length} document{missingDocuments.length === 1 ? '' : 's'} still missing: {missingDocuments.map((doc) => doc.label).join(', ')}.
                    </Text>
                  )}
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-xs text-slate-600">
                    <div className="font-semibold text-slate-800 mb-2">What these document statuses mean</div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-700">Approved: ready to go</div>
                      <div className="rounded-2xl bg-sky-50 px-3 py-2 text-sky-700">Under Review: wait for verification</div>
                      <div className="rounded-2xl bg-rose-50 px-3 py-2 text-rose-700">Rejected: re-upload the marked document</div>
                    </div>
                  </div>
                </div>
              </Col>
              <Col xs={24} lg={15}>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {REQUIRED_TRAINER_DOCUMENTS.map(({ key, label }) => {
                    const isUploaded = Boolean(docs[key]);
                    const isRejected = Boolean(verification[key]?.reason);
                    return (
                      <div
                        key={key}
                        className={`rounded-2xl border px-4 py-3 ${
                          isRejected
                            ? "border-rose-200 bg-rose-50"
                            : isUploaded
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isRejected ? (
                            <CloseCircleOutlined className="text-rose-500" />
                          ) : isUploaded ? (
                            <CheckCircleOutlined className="text-emerald-500" />
                          ) : (
                            <ClockCircleOutlined className="text-amber-500" />
                          )}
                          <Text strong className="text-xs uppercase tracking-wider text-slate-700">
                            {label}
                          </Text>
                        </div>
                        <Text className="mt-2 block text-[11px] text-slate-500">
                          {isRejected
                            ? verification[key]?.reason
                            : isUploaded
                              ? "Uploaded successfully"
                              : "Upload required"}
                        </Text>
                      </div>
                    );
                  })}
                </div>
              </Col>
            </Row>
          </div>

          <Row gutter={[24, 24]}>
            {DOCUMENT_UPLOAD_CONFIG.map((item) => (
              <Col key={item.key} xs={24} md={12} lg={8} className="mb-6">
                <DocumentCard
                  documentKey={item.key}
                  title={item.title}
                  accept={item.accept}
                  status={buildDocumentCardStatus(item.key)}
                  onUploadDocument={handleUploadDocument}
                  uploading={uploadingDoc === item.key}
                  rejectionReason={verification[item.key]?.reason}
                  fileUrl={getProfilePictureUrl(docs[item.key])}
                />
              </Col>
            ))}
          </Row>

          {(
            profile?.ndaAgreementPdf ||
            profile?.ntaAgreementPdf ||
            profile?.NDAAgreementPdf ||
            docs.ndaAgreement ||
            docs.ntaAgreement ||
            docs.NDAAgreement
          ) && (
            <div className="mt-2 mb-10 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-center">
              <Text className="block text-[11px] font-black uppercase tracking-[0.25em] text-indigo-500">
                NDA Agreement File
              </Text>
              <Text className="mt-2 block text-sm text-indigo-700">
                Your official NDA file is available for review.
              </Text>
              <Button
                type="primary"
                ghost
                icon={<EyeOutlined />}
                className="mt-4 rounded-xl border-indigo-200 text-indigo-700"
                onClick={() =>
                  window.open(
                    getProfilePictureUrl(
                      profile?.ndaAgreementPdf ||
                      profile?.ntaAgreementPdf ||
                        profile?.NDAAgreementPdf ||
                        docs.ndaAgreement ||
                        docs.ntaAgreement ||
                        docs.NDAAgreement,
                    ),
                    "_blank",
                  )
                }
              >
                Open NDA File
              </Button>
            </div>
          )}

          <div className="mt-8 flex flex-col items-center pb-12">
            <Button
              type="primary"
              size="large"
              disabled={!canSubmit}
              onClick={handleSubmitForVerification}
              icon={
                canSubmit ? (
                  <SafetyCertificateOutlined />
                ) : workflowStatus === "under_review" ? (
                  <ClockCircleOutlined />
                ) : (
                  <CloseCircleOutlined />
                )
              }
              className={`font-bold min-w-[300px] h-[50px] shadow-lg rounded-xl transition-all ${
                canSubmit
                  ? "bg-indigo-600 hover:bg-indigo-700"
                  : "bg-slate-200 border-slate-200"
              }`}
              danger={
                workflowStatus === "rejected" && !anyRejected
              }
            >
              {workflowStatus === "under_review"
                ? "AWAITING REVIEW"
                : workflowStatus === "approved"
                  ? "ACCOUNT VERIFIED"
                  : workflowStatus === "rejected" && anyRejected
                    ? "ACTION REQUIRED: RE-UPLOAD REJECTED DOCS"
                    : workflowStatus === "rejected"
                      ? "RE-SUBMIT FOR VERIFICATION"
                      : "SUBMIT FOR REVIEW"}
            </Button>

            {workflowStatus === "rejected" && anyRejected && (
              <div className="mt-4 bg-rose-50 px-6 py-3 rounded-2xl border border-rose-100 max-w-lg text-center">
                <Text
                  strong
                  className="text-rose-600 text-xs uppercase tracking-widest block mb-1"
                >
                  Attention Required
                </Text>
                <Text className="text-xs text-rose-500">
                  Some of your documents were rejected. Please re-upload the
                  specific files marked as 'Rejected' above to enable
                  re-submission.
                </Text>
              </div>
            )}

            {!allUploaded &&
              workflowStatus === "pending" && (
                <Text
                  type="danger"
                  className="mt-4 font-bold uppercase tracking-widest text-[10px] bg-rose-50 px-4 py-2 rounded-full border border-rose-100 flex items-center gap-2"
                >
                  <ClockCircleOutlined /> Please upload all {requiredCount} required documents
                  to enable verification
                </Text>
              )}
          </div>
        </div>

        <IDCardModal
          isOpen={isIDCardOpen}
          onClose={() => setIsIDCardOpen(false)}
          user={profile}
        />

        <Modal
          title={
            <Title level={4} style={{ margin: 0 }}>
              Edit Profile Information
            </Title>
          }
          open={isEditModalOpen}
          onCancel={() => setIsEditModalOpen(false)}
          onOk={() => editForm.submit()}
          confirmLoading={updateProfileMutation.isPending}
          okText="Save Changes"
          cancelText="Cancel"
          centered
          styles={{ body: { paddingTop: 20 } }}
        >
          <Form form={editForm} layout="vertical" onFinish={handleEditSave}>
            <Form.Item
              name="name"
              label="Full Name"
              rules={[
                { required: true, message: "Please input your full name!" },
              ]}
              tooltip="Contact support to change name if locked"
            >
              <Input disabled={profile?.profileCompletedOnce} size="large" />
            </Form.Item>

            <Form.Item
              name="phoneNumber"
              label="Phone Number"
              rules={[
                { required: true, message: "Please input your phone number!" },
              ]}
            >
              <Input size="large" placeholder="Enter phone number" />
            </Form.Item>

            <Form.Item
              name="specialization"
              label="Specialization"
              rules={[
                {
                  required: true,
                  message: "Please input your specialization!",
                },
              ]}
            >
              <Input size="large" placeholder="e.g. Yoga, Pilates, Strength" />
            </Form.Item>

            <Form.Item
              name="city"
              label="City"
              rules={[{ required: true, message: "Please enter your city!" }]}
            >
              <AutoComplete
                size="large"
                placeholder="Type or select your city"
                options={cities.map((city) => ({
                  value: city.name,
                }))}
                filterOption={(input, option) =>
                  String(option?.value || "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </Form.Item>
          </Form>
        </Modal>
      </>
    </MobileTrainerLayout>
  );
};

export default TrainerProfile;
