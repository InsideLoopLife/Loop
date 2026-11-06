import type { ReactNode } from "react";
import { requireAdminAccess } from "@/lib/admin/access";

// Every /admin page goes through this check (13 pages had no check of their
// own). Non-admins are sent to /dashboard, signed-out visitors to /login.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminAccess();
  return children;
}
