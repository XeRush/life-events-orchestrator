import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Spinner } from "../components/ui/primitives";
import { useAuth } from "../stores/auth";

const Landing = lazy(() => import("../pages/Landing"));
const Login = lazy(() => import("../pages/Login"));
const Register = lazy(() => import("../pages/Register"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const LifeEvents = lazy(() => import("../pages/LifeEvents"));
const LifeEventDetail = lazy(() => import("../pages/LifeEventDetail"));
const Timeline = lazy(() => import("../pages/Timeline"));
const VoiceAssistant = lazy(() => import("../pages/VoiceAssistant"));
const Callbacks = lazy(() => import("../pages/Callbacks"));
const Entities = lazy(() => import("../pages/Entities"));
const DemoControl = lazy(() => import("../pages/DemoControl"));
const Settings = lazy(() => import("../pages/Settings"));

function Protected() {
  const tokens = useAuth((s) => s.tokens);
  const location = useLocation();
  if (!tokens) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <AppShell />;
}

function Fallback() {
  return <div className="grid min-h-[50vh] place-items-center"><Spinner /></div>;
}

const router = createBrowserRouter([
  { element: <Suspense fallback={<Fallback />}><Outlet /></Suspense>, children: [
    { path: "/", element: <Landing /> },
    { path: "/login", element: <Login /> },
    { path: "/register", element: <Register /> },
    { path: "/app", element: <Protected />, children: [
      { index: true, element: <Dashboard /> },
      { path: "life-events", element: <LifeEvents /> },
      { path: "life-events/:reference", element: <LifeEventDetail /> },
      { path: "timeline", element: <Timeline /> },
      { path: "voice", element: <VoiceAssistant /> },
      { path: "callbacks", element: <Callbacks /> },
      { path: "entities", element: <Entities /> },
      { path: "demo", element: <DemoControl /> },
      { path: "settings", element: <Settings /> },
    ] },
    { path: "*", element: <Navigate to="/" replace /> },
  ] },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
