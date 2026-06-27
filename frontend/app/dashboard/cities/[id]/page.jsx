export function generateStaticParams() { return [{id: '1', param: '1', stepSlug: '1', courseId: '1', collegeId: '1', departmentName: '1'}]; }
import dynamic from "next/dynamic";
import PortalLoadingState from "@/components/common/PortalLoadingState";

const CityDetails = dynamic(() => import("@/portals/admin/CityDetails"), {
  loading: () => (
    <PortalLoadingState
      title="Loading city details"
      description="Fetching city profile and associated trainers."
    />
  ),
});

export default function CityDetailsPage() {
  return <CityDetails />;
}
