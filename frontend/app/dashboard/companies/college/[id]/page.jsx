export function generateStaticParams() { return [{id: '1', param: '1', stepSlug: '1', courseId: '1', collegeId: '1', departmentName: '1'}]; }
import dynamic from "next/dynamic";
import PortalLoadingState from "@/components/common/PortalLoadingState";

const CollegeDepartments = dynamic(
  () => import("@/portals/admin/CollegeDepartments"),
  {
    loading: () => (
      <PortalLoadingState
        title="Loading departments"
        description="Fetching college departments and current training schedule status."
      />
    ),
  }
);

export default function CollegeDepartmentsPage() {
  return <CollegeDepartments />;
}
