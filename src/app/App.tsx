import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { OpeningSoonPage, ReleaseGate, RouteFailurePage } from "../components/OpeningSoonPage";
import { PwaUpdatePrompt } from "../components/PwaUpdatePrompt";
import { Shell } from "../components/Shell";
import { MemberRoute, StaffRoute } from "../components/RouteGuard";
import { HomePage } from "../pages/HomePage";
import {
  componentRequestsAvailable,
  equipmentPageAvailable,
  memberPlatformAvailable
} from "../config/release";

const ProjectsPage = lazy(() => import("../pages/ProjectsPage").then((module) => ({ default: module.ProjectsPage })));
const BrandingPage = lazy(() => import("../pages/BrandingPage").then((module) => ({ default: module.BrandingPage })));
const ElectrofluidicMusclesPage = lazy(() => import("../pages/ElectrofluidicMusclesPage").then((module) => ({ default: module.ElectrofluidicMusclesPage })));
const BuildingVisionPage = lazy(() => import("../pages/BuildingVisionPage").then((module) => ({ default: module.BuildingVisionPage })));
const EcosystemPage = lazy(() => import("../pages/EcosystemPage").then((module) => ({ default: module.EcosystemPage })));
const KioskPage = lazy(() => import("../pages/KioskPage").then((module) => ({ default: module.KioskPage })));
const FinancialsPage = lazy(() => import("../pages/PlanningPages").then((module) => ({ default: module.FinancialsPage })));
const ProcurementPage = lazy(() => import("../pages/PlanningPages").then((module) => ({ default: module.ProcurementPage })));
const ComponentsPage = lazy(() => import("../pages/ComponentsPages").then((module) => ({ default: module.ComponentsPage })));
const ComponentDetailPage = lazy(() => import("../pages/ComponentsPages").then((module) => ({ default: module.ComponentDetailPage })));
const PublicComponentRequestPage = lazy(() => import("../pages/InventoryPages").then((module) => ({ default: module.PublicComponentRequestPage })));
const ComponentRequestsPage = lazy(() => import("../pages/InventoryPages").then((module) => ({ default: module.ComponentRequestsPage })));
const InventoryPage = lazy(() => import("../pages/InventoryPages").then((module) => ({ default: module.InventoryPage })));
const AdminComponentsPage = lazy(() => import("../pages/InventoryPages").then((module) => ({ default: module.AdminComponentsPage })));
const AdminInventoryPage = lazy(() => import("../pages/InventoryPages").then((module) => ({ default: module.AdminInventoryPage })));
const AdminComponentRequestsPage = lazy(() => import("../pages/InventoryPages").then((module) => ({ default: module.AdminComponentRequestsPage })));
const AdminCabinetsPage = lazy(() => import("../pages/InventoryPages").then((module) => ({ default: module.AdminCabinetsPage })));
const MakerDeskPage = lazy(() => import("../pages/MakerDeskPages").then((module) => ({ default: module.MakerDeskPage })));
const LockersPage = lazy(() => import("../pages/MakerDeskPages").then((module) => ({ default: module.LockersPage })));
const ConsumablesPage = lazy(() => import("../pages/MakerDeskPages").then((module) => ({ default: module.ConsumablesPage })));
const ToolkitsPage = lazy(() => import("../pages/MakerDeskPages").then((module) => ({ default: module.ToolkitsPage })));
const AdminMakerServicesPage = lazy(() => import("../pages/MakerDeskPages").then((module) => ({ default: module.AdminMakerServicesPage })));
const EquipmentPage = lazy(() => import("../pages/PublicPages").then((module) => ({ default: module.EquipmentPage })));
const MembershipPage = lazy(() => import("../pages/PublicPages").then((module) => ({ default: module.MembershipPage })));
const ServicesPage = lazy(() => import("../pages/PublicPages").then((module) => ({ default: module.ServicesPage })));
const JoinPage = lazy(() => import("../pages/PublicPages").then((module) => ({ default: module.JoinPage })));
const NotFoundPage = lazy(() => import("../pages/PublicPages").then((module) => ({ default: module.NotFoundPage })));
const AuthPage = lazy(() => import("../pages/AuthPages").then((module) => ({ default: module.AuthPage })));
const AuthCallbackPage = lazy(() => import("../pages/AuthPages").then((module) => ({ default: module.AuthCallbackPage })));
const MembersPage = lazy(() => import("../pages/AuthPages").then((module) => ({ default: module.MembersPage })));
const PublicMemberPage = lazy(() => import("../pages/AuthPages").then((module) => ({ default: module.PublicMemberPage })));
const DashboardPage = lazy(() => import("../pages/MemberPages").then((module) => ({ default: module.DashboardPage })));
const ProfilePage = lazy(() => import("../pages/MemberPages").then((module) => ({ default: module.ProfilePage })));
const BookPage = lazy(() => import("../pages/MemberPages").then((module) => ({ default: module.BookPage })));
const ResourceBookingPage = lazy(() => import("../pages/MemberPages").then((module) => ({ default: module.ResourceBookingPage })));
const BookingsPage = lazy(() => import("../pages/MemberPages").then((module) => ({ default: module.BookingsPage })));
const BookingDetailPage = lazy(() => import("../pages/MemberPages").then((module) => ({ default: module.BookingDetailPage })));
const CheckInPage = lazy(() => import("../pages/MemberPages").then((module) => ({ default: module.CheckInPage })));
const AdminMembersPage = lazy(() => import("../pages/AdminPages").then((module) => ({ default: module.AdminMembersPage })));
const AdminResourcesPage = lazy(() => import("../pages/AdminPages").then((module) => ({ default: module.AdminResourcesPage })));
const AdminBookingsPage = lazy(() => import("../pages/AdminPages").then((module) => ({ default: module.AdminBookingsPage })));
const AdminAttendancePage = lazy(() => import("../pages/AdminPages").then((module) => ({ default: module.AdminAttendancePage })));
const AdminIntegrationsPage = lazy(() => import("../pages/AdminPages").then((module) => ({ default: module.AdminIntegrationsPage })));

const protectedPage = (page: ReactNode) => (
  <MemberRoute>{page}</MemberRoute>
);
const staffPage = (page: ReactNode) => (
  <MemberRoute><StaffRoute>{page}</StaffRoute></MemberRoute>
);
const memberFeature = (page: ReactNode) => (
  <ReleaseGate enabled={memberPlatformAvailable}>{page}</ReleaseGate>
);
const componentRequestFeature = (page: ReactNode) => (
  <ReleaseGate enabled={componentRequestsAvailable}>{page}</ReleaseGate>
);
const memberComponentRequestFeature = (page: ReactNode) => (
  <ReleaseGate enabled={memberPlatformAvailable && componentRequestsAvailable}>
    {page}
  </ReleaseGate>
);

export const router = createBrowserRouter([
  {
    element: <Shell />,
    errorElement: (
      <Shell>
        <RouteFailurePage />
      </Shell>
    ),
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/equipment", element: equipmentPageAvailable ? <EquipmentPage /> : <Navigate to="/" replace /> },
      { path: "/membership", element: <MembershipPage /> },
      { path: "/services", element: <ServicesPage /> },
      { path: "/projects", element: <ProjectsPage /> },
      { path: "/branding", element: <BrandingPage /> },
      { path: "/projects/electrofluidic-fiber-muscles", element: <ElectrofluidicMusclesPage /> },
      { path: "/building-vision", element: <BuildingVisionPage /> },
      { path: "/ecosystem", element: <EcosystemPage /> },
      { path: "/financials", element: <FinancialsPage /> },
      { path: "/procurement", element: <ProcurementPage /> },
      { path: "/components", element: <ComponentsPage /> },
      { path: "/components/request", element: componentRequestFeature(<PublicComponentRequestPage />) },
      { path: "/components/:slug", element: <ComponentDetailPage /> },
      { path: "/maker-desk", element: <MakerDeskPage /> },
      { path: "/join", element: <JoinPage /> },
      { path: "/members", element: <MembersPage /> },
      { path: "/members/:handle", element: <PublicMemberPage /> },
      { path: "/auth", element: memberFeature(<AuthPage />) },
      { path: "/auth/callback", element: memberFeature(<AuthCallbackPage />) },
      { path: "/dashboard", element: memberFeature(protectedPage(<DashboardPage />)) },
      { path: "/profile", element: memberFeature(protectedPage(<ProfilePage />)) },
      { path: "/book", element: memberFeature(protectedPage(<BookPage />)) },
      { path: "/book/:resource", element: memberFeature(protectedPage(<ResourceBookingPage />)) },
      { path: "/bookings", element: memberFeature(protectedPage(<BookingsPage />)) },
      { path: "/bookings/:id", element: memberFeature(protectedPage(<BookingDetailPage />)) },
      { path: "/check-in", element: memberFeature(protectedPage(<CheckInPage />)) },
      { path: "/component-requests", element: memberComponentRequestFeature(protectedPage(<ComponentRequestsPage />)) },
      { path: "/inventory", element: memberFeature(protectedPage(<InventoryPage />)) },
      { path: "/lockers", element: memberFeature(protectedPage(<LockersPage />)) },
      { path: "/consumables", element: memberFeature(protectedPage(<ConsumablesPage />)) },
      { path: "/toolkits", element: memberFeature(protectedPage(<ToolkitsPage />)) },
      { path: "/admin", element: memberFeature(<Navigate to="/admin/members" replace />) },
      { path: "/admin/members", element: memberFeature(staffPage(<AdminMembersPage />)) },
      { path: "/admin/resources", element: memberFeature(staffPage(<AdminResourcesPage />)) },
      { path: "/admin/bookings", element: memberFeature(staffPage(<AdminBookingsPage />)) },
      { path: "/admin/attendance", element: memberFeature(staffPage(<AdminAttendancePage />)) },
      { path: "/admin/integrations", element: memberFeature(staffPage(<AdminIntegrationsPage />)) },
      { path: "/admin/components", element: memberFeature(staffPage(<AdminComponentsPage />)) },
      { path: "/admin/inventory", element: memberFeature(staffPage(<AdminInventoryPage />)) },
      { path: "/admin/component-requests", element: memberComponentRequestFeature(staffPage(<AdminComponentRequestsPage />)) },
      { path: "/admin/cabinets", element: memberFeature(staffPage(<AdminCabinetsPage />)) },
      { path: "/admin/maker-services", element: memberFeature(staffPage(<AdminMakerServicesPage />)) },
      { path: "*", element: <NotFoundPage /> }
    ]
  },
  {
    path: "/kiosk",
    errorElement: (
      <Shell>
        <RouteFailurePage />
      </Shell>
    ),
    element: memberPlatformAvailable
      ? <KioskPage />
      : <Shell><OpeningSoonPage /></Shell>
  }
]);

export function App() {
  return (
    <>
      <Suspense fallback={<div className="route-loading mono">Loading floor plan…</div>}>
        <RouterProvider router={router} />
      </Suspense>
      <PwaUpdatePrompt />
    </>
  );
}
