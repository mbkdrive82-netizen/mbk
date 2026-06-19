"use client";

import { memo, useEffect, useState } from "react";
import { Avatar, Button, Card, Col, Row, Space, Tag, Typography, Upload } from "antd";
import {
  CameraOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { canGenerateTrainerIdCard } from "@/utils/trainerIdCard";
import { getPortalUserInitial } from "@/utils/portalUserDisplay";

const { Title, Text } = Typography;

const LOCKED_STATUSES = new Set(["under_review", "approved"]);

const ProfileIdentityHeaderCard = memo(function ProfileIdentityHeaderCard({
  profile,
  workflowStatus,
  workflowMeta,
  uploadingDoc,
  profileImageSrc,
  onProfileImageError,
  onSelfieUploadBefore,
  onOpenIdCard,
}) {
  const isProfileLocked = LOCKED_STATUSES.has(workflowStatus);
  const canShowIdCard = canGenerateTrainerIdCard(profile);
  const profileInitial = getPortalUserInitial(profile || {});
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [profileImageSrc]);

  return (
    <Card
      className="mb-8 border-indigo-50 bg-linear-to-r from-indigo-50 to-white shadow-sm"
      style={{ borderRadius: 16 }}
    >
      <Row align="middle" gutter={24}>
        <Col>
          <Upload
            accept="image/jpeg,image/png"
            showUploadList={false}
            beforeUpload={onSelfieUploadBefore}
            disabled={uploadingDoc === "selfiePhoto" || isProfileLocked}
          >
            <div className="group relative cursor-pointer">
              <Avatar
                size={120}
                src={!imageFailed ? profileImageSrc : undefined}
                onError={() => {
                  setImageFailed(true);
                  onProfileImageError?.();
                }}
                className={`border-4 border-indigo-50 transition-opacity ${
                  isProfileLocked ? "opacity-90" : "group-hover:opacity-80"
                }`}
              >
                {!profileImageSrc || imageFailed ? (
                  <span className="flex h-full w-full items-center justify-center text-4xl font-semibold uppercase leading-none text-[#1d5f87]">
                    {profileInitial}
                  </span>
                ) : null}
              </Avatar>
              {!isProfileLocked ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                  <CameraOutlined className="text-2xl text-white" />
                </div>
              ) : null}
              {isProfileLocked ? (
                <div className="absolute right-0 bottom-0 z-10 rounded-full border border-gray-100 bg-white p-1.5 shadow-md">
                  <LockOutlined className="text-sm text-gray-400" />
                </div>
              ) : null}
              {uploadingDoc === "selfiePhoto" ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-white/50">
                  <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-indigo-600" />
                </div>
              ) : null}
            </div>
          </Upload>
        </Col>

        <Col flex="auto">
          <div className="flex flex-col">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Title
                level={2}
                style={{ margin: 0 }}
                className="font-calibri uppercase tracking-tight text-indigo-900"
              >
                {profile?.name}
              </Title>
              <Tag
                color={profile?.isActive ? "green" : "red"}
                className="m-0 rounded-full border-0 px-3 py-1 text-[11px] font-bold uppercase shadow-sm"
              >
                {profile?.isActive ? "Active Account" : "Inactive"}
              </Tag>
            </div>

            <Text className="text-sm text-slate-500 max-w-xl">
              {isProfileLocked
                ? 'Selfie updates are paused while your profile is under review.'
                : 'Tap your selfie to upload a fresh image for verification.'}
            </Text>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Tag
                className={`flex items-center gap-2 rounded-xl border px-4 py-1.5 text-xs font-bold uppercase tracking-wide ${workflowMeta.badgeClass}`}
              >
                {workflowStatus === "approved" ? (
                  <SafetyCertificateOutlined className="text-lg" />
                ) : (
                  <ClockCircleOutlined className="text-lg" />
                )}
                {workflowMeta.label}
              </Tag>

              {canShowIdCard ? (
                <Tag className="flex items-center gap-2 rounded-xl border-0 bg-green-100 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-green-700">
                  <CheckCircleOutlined className="text-lg" />
                  Trainer Activated
                </Tag>
              ) : null}
            </div>
          </div>
        </Col>

        <Col className="ml-auto">
          <div className="flex flex-col items-end text-right">
            <div className="mb-2 rounded-xl border border-indigo-100 bg-white/80 px-4 py-2 shadow-xs backdrop-blur-sm">
              <Text
                type="secondary"
                className="mb-1.5 block text-[10px] leading-none font-bold uppercase tracking-widest text-indigo-400"
              >
                Trainer ID
              </Text>
              <Text
                strong
                className="block text-sm leading-none font-mono tracking-widest text-indigo-900"
              >
                {profile?.trainerId || profile?.trainerCode || "PENDING"}
              </Text>
            </div>
            <div className="flex items-center gap-2 px-2">
              <MailOutlined className="text-xs text-indigo-400" />
              <Text className="text-xs font-semibold tracking-tight text-gray-500">
                {profile?.email}
              </Text>
            </div>
            {canShowIdCard ? (
              <Space className="mt-3">
                <Button
                  type="text"
                  icon={<SafetyCertificateOutlined />}
                  onClick={onOpenIdCard}
                  className="font-bold text-indigo-600 hover:bg-indigo-50"
                >
                  View ID Card
                </Button>
              </Space>
            ) : null}
          </div>
        </Col>
      </Row>
    </Card>
  );
});

export default ProfileIdentityHeaderCard;
