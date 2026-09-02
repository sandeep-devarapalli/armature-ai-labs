import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";

export function MemberRoute({ children }: PropsWithChildren) {
  const { currentMember, loading } = useApp();
  const location = useLocation();
  if (loading) {
    return <div className="route-loading mono">Loading member workspace…</div>;
  }
  if (!currentMember) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export function StaffRoute({ children }: PropsWithChildren) {
  const { isStaff, loading } = useApp();
  if (loading) {
    return <div className="route-loading mono">Checking staff role…</div>;
  }
  if (!isStaff) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export function AdminRoute({ children }: PropsWithChildren) {
  const { isAdmin, loading } = useApp();
  if (loading) return <div className="route-loading mono">Checking admin role…</div>;
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
