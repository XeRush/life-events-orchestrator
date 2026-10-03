import { lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import { RequireAuth } from "../components/layout/RequireAuth";
import { OfficerShell, PublicShell, ResidentShell } from "../components/layout/Shells";
import { Spinner } from "../components/ui/primitives";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const page = <P extends Record<string, any>>(loader: () => Promise<{ default: ComponentType<P> }>) => lazy(loader);

const Landing = page(() => import("../pages/public/Landing"));
const Architecture = page(() => import("../pages/public/Architecture"));
const Login = page(() => import("../pages/auth/Login"));
const Register = page(() => import("../pages/auth/Register"));
const VerifyEmail = page(() => import("../pages/auth/VerifyEmail"));
const ForgotPassword = page(() => import("../pages/auth/ForgotPassword"));
const ResetPassword = page(() => import("../pages/auth/ResetPassword"));
const AcceptInvite = page(() => import("../pages/auth/AcceptInvite"));
const ResidentHome = page(() => import("../pages/resident/ResidentHome"));
const Intake = page(() => import("../pages/resident/Intake"));
const Voice = page(() => import("../pages/resident/Voice"));
const CaseDashboard = page(() => import("../pages/resident/CaseDashboard"));
const CaseGraph = page(() => import("../pages/resident/CaseGraph"));
const CaseTimelinePage = page(() => import("../pages/resident/CaseTimelinePage"));
const CaseDocuments = page(() => import("../pages/resident/CaseDocuments"));
const Settings = page(() => import("../pages/resident/Settings"));
const OfficerCases = page(() => import("../pages/officer/OfficerCases"));
const Approvals = page(() => import("../pages/officer/Approvals"));
const Escalations = page(() => import("../pages/officer/Escalations"));
const Callbacks = page(() => import("../pages/officer/Callbacks"));
const Audit = page(() => import("../pages/officer/Audit"));
const Analytics = page(() => import("../pages/officer/Analytics"));
const OfficerCaseDetail = page(() => import("../pages/officer/OfficerCaseDetail"));
const Users = page(() => import("../pages/admin/Users"));
const System = page(() => import("../pages/admin/System"));
const DemoControl = page(() => import("../pages/demo/DemoControl"));
const AgentTesting = page(() => import("../pages/demo/AgentTesting"));
// Dev only: renders every <Bones> fixture so `npm run bones` can capture skeletons. Not in production builds.
const BonesCapture = import.meta.env.DEV ? page(() => import("../pages/dev/BonesCapture")) : null;

function Fallback() {
  return <div className="grid min-h-[50vh] place-items-center"><Spinner /></div>;
}

const router = createBrowserRouter([
  {
    element: <Suspense fallback={<Fallback />}><Outlet /></Suspense>,
    children: [
      {
        element: <PublicShell />,
        children: [
          { path: "/", element: <Landing /> },
          { path: "/architecture", element: <Architecture /> },
          { path: "/login", element: <Login /> },
          { path: "/register", element: <Register /> },
          { path: "/verify-email", element: <VerifyEmail /> },
          { path: "/forgot-password", element: <ForgotPassword /> },
          { path: "/reset-password", element: <ResetPassword /> },
          { path: "/accept-invite", element: <AcceptInvite /> },
        ],
      },
      {
        path: "/app",
        element: <RequireAuth roles={["RESIDENT"]}><ResidentShell /></RequireAuth>,
        children: [
          { index: true, element: <ResidentHome /> },
          { path: "intake", element: <Intake /> },
          { path: "voice", element: <Voice /> },
          { path: "cases/:ref", element: <CaseDashboard /> },
          { path: "cases/:ref/graph", element: <CaseGraph /> },
          { path: "cases/:ref/timeline", element: <CaseTimelinePage /> },
          { path: "cases/:ref/documents", element: <CaseDocuments /> },
          { path: "settings", element: <Settings /> },
        ],
      },
      {
        element: <RequireAuth roles={["OFFICER", "ADMIN"]}><OfficerShell /></RequireAuth>,
        children: [
          { path: "/officer", element: <OfficerCases queue="all" /> },
          { path: "/officer/approvals", element: <Approvals /> },
          { path: "/officer/blocked", element: <OfficerCases queue="blocked" /> },
          { path: "/officer/escalations", element: <Escalations /> },
          { path: "/officer/callbacks", element: <Callbacks /> },
          { path: "/officer/audit", element: <Audit /> },
          { path: "/officer/analytics", element: <Analytics /> },
          { path: "/officer/settings", element: <Settings /> },
          { path: "/officer/cases/:ref", element: <OfficerCaseDetail /> },
          { path: "/demo", element: <DemoControl /> },
          { path: "/agent-testing", element: <AgentTesting /> },
        ],
      },
      {
        element: <RequireAuth roles={["ADMIN"]}><OfficerShell /></RequireAuth>,
        children: [
          { path: "/admin/users", element: <Users /> },
          { path: "/admin/system", element: <System /> },
        ],
      },
      ...(BonesCapture ? [{ path: "/__bones", element: <BonesCapture /> }] : []),
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
