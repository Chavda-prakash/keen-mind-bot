import { createFileRoute, Outlet } from "@tanstack/react-router";

// Single-owner mode: no sign-in gate yet.
export const Route = createFileRoute("/_authenticated")({
  component: () => <Outlet />,
});
