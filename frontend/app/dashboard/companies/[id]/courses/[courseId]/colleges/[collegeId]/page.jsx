export function generateStaticParams() { return [{id: '1', param: '1', stepSlug: '1', courseId: '1', collegeId: '1', departmentName: '1'}]; }
import dynamic from "next/dynamic";
import PortalLoadingState from "@/components/common/PortalLoadingState";

const BatchManagement = dynamic(() => import("@/portals/admin/BatchManagement"), {
  loading: () => (
    <PortalLoadingState
      title="Loading batches"
      description="Preparing batch configurations, student rosters, and trainer assignments."
    />
  ),
});

export default function BatchManagementPage() {
  return <BatchManagement />;
}
