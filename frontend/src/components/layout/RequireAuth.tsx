import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { homeFor, useAuth } from "../../stores/auth";
import type { Role } from "../../types/api";

/** Route guard: signed in, and one of the allowed roles (the API enforces the same rules server-side). */
export function RequireAuth({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { tokens, user } = useAuth();
  const location = useLocation();
  if (!tokens || !user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return <>{children}</>;
}
