export function generateStaticParams() { return [{id: '1', param: '1', stepSlug: '1', courseId: '1', collegeId: '1', departmentName: '1'}]; }
import dynamic from "next/dynamic";
import PortalLoadingState from "@/components/common/PortalLoadingState";

const SuperAdminCollegeDetails = dynamic(
  () => import("@/portals/admin/SuperAdminCollegeDetails"),
  {
    loading: () => (
      <PortalLoadingState
        title="Loading college details"
        description="Fetching college profile, departments, and trainer assignments."
      />
    ),
  }
);

export default function CollegeDetailsPage() {
  return <SuperAdminCollegeDetails />;
}
