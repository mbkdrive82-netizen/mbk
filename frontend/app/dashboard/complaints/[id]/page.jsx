export function generateStaticParams() { return [{id: '1', param: '1', stepSlug: '1', courseId: '1', collegeId: '1', departmentName: '1'}]; }
import dynamic from "next/dynamic";
import PortalLoadingState from "@/components/common/PortalLoadingState";

const ComplaintDetails = dynamic(
  () => import("@/portals/admin/ComplaintDetails"),
  {
    loading: () => (
      <PortalLoadingState
        title="Loading complaint details"
        description="Fetching complaint history, attachments, and resolution timeline."
      />
    ),
  }
);

export default function ComplaintDetailsPage() {
  return <ComplaintDetails />;
}
