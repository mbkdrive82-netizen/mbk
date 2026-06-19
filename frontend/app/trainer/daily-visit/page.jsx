"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PortalLoadingState from "@/components/common/PortalLoadingState";

export default function TrainerDailyVisitRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/trainer/activities");
  }, [router]);

  return (
    <PortalLoadingState
      title="Redirecting"
      description="Redirecting legacy Daily Visit links to Trainer Activities..."
    />
  );
}
