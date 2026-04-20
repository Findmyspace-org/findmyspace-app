#!/usr/bin/env node
/**
 * Manual E2E check for PATCH /api/admin/users/[id]
 *
 * Required env:
 *   ADMIN_API_BASE_URL   (default http://127.0.0.1:3000)
 *   ADMIN_ACCESS_TOKEN   (Bearer JWT from an admin session — browser devtools / Application)
 *   ADMIN_PATCH_USER_ID  (UUID of profile to update — use a test user, not production-critical)
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-admin-user-patch.mjs
 *
 * Optional: pass token and user id as args:
 *   node scripts/test-admin-user-patch.mjs '<access_token>' '<user_uuid>'
 */

const base =
  process.env.ADMIN_API_BASE_URL || "http://127.0.0.1:3000";
const token =
  process.argv[2] || process.env.ADMIN_ACCESS_TOKEN || "";
const userId =
  process.argv[3] || process.env.ADMIN_PATCH_USER_ID || "";

if (!token || !userId) {
  console.error(
    "Set ADMIN_ACCESS_TOKEN and ADMIN_PATCH_USER_ID (or pass token and user id as argv)."
  );
  process.exit(1);
}

const body = {
  reason: "E2E script verification",
  first_name: null,
  last_name: null,
  full_name: null,
  phone: null,
};

async function main() {
  const url = `${base.replace(/\/$/, "")}/api/admin/users/${userId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  console.log(res.status, json);
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
