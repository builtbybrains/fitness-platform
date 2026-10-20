import { createFileRoute, redirect } from "@tanstack/react-router";

// The admin dashboard is a static app served from public/admin/. Any request
// that reaches the router for /admin goes straight to its page.
export const Route = createFileRoute("/admin")({
  beforeLoad: () => {
    throw redirect({ href: "/admin/index.html" });
  },
});
