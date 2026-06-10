/**
 * @deprecated Admin navigation is rendered by AdminShell sidebar via app/admin/layout.tsx.
 * This export remains for type compatibility during migration.
 */
export type { AdminNavKey } from "@/lib/admin-navigation";

/** @deprecated No-op — sidebar is provided by admin layout. */
export function AdminNav(_props: {
  current?: import("@/lib/admin-navigation").AdminNavKey;
  badges?: unknown;
}) {
  return null;
}
