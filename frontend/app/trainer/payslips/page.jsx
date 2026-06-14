"use client";



import dynamic from "next/dynamic";

import PortalLoadingState from "@/components/common/PortalLoadingState";



const TrainerPaySlips = dynamic(

  () => import("@/portals/trainer/TrainerPaySlips"),

  { loading: () => <PortalLoadingState title="Loading payslips" description="Fetching your monthly salary slips." /> }

);



export default function TrainerPayslipsPage() {

  return <TrainerPaySlips />;

}

