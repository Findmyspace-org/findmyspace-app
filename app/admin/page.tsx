"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  LayoutDashboard,
  MessageSquare,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";

type AdminProfileRow = {
  id?: string;
  role: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
  owner_verification_status?: string | null;
  bank_verification_status?: string | null;
};

type OwnerSpaceRow = {
  id: string;
  owner_id?: string | null;
  title?: string | null;
  status?: string | null;
  address_line_1?: string | null;
  suburb?: string | null;
  city?: string | null;
  space_type?: string | null;
  booking_unit?: string | null;
  created_at?: string | null;
};

export default function AdminPage() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [users, setUsers] = useState<AdminProfileRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [spacesByOwner, setSpacesByOwner] = useState<Record<string, OwnerSpaceRow[]>>({});
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    checkRole();
  }, []);

  async function checkRole() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Please log in first.");
      setLoading(false);
      return;
    }

    const { data: rawData, error } = await (supabase.from("profiles") as any)
      .select("role")
      .eq("id", user.id)
      .single();

    const data = rawData as AdminProfileRow | null;

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setRole(data?.role || "user");

    if ((data?.role || "user") === "admin") {
      const { data: usersData, error: usersError } = await (supabase.from("profiles") as any)
        .select(
          "id, role, first_name, last_name, full_name, email, phone, created_at, owner_verification_status, bank_verification_status"
        )
        .order("created_at", { ascending: false });

      if (usersError) {
        setMessage(usersError.message);
      } else {
        setUsers((usersData || []) as AdminProfileRow[]);
      }

      const { data: spacesData, error: spacesError } = await (supabase.from("spaces") as any)
        .select(
          "id, owner_id, title, status, address_line_1, suburb, city, space_type, booking_unit, created_at"
        )
        .order("created_at", { ascending: false });

      if (spacesError) {
        setMessage(spacesError.message);
      } else {
        const groupedSpaces = ((spacesData || []) as OwnerSpaceRow[]).reduce(
          (acc, space) => {
            const ownerId = space.owner_id || "";
            if (!ownerId) return acc;
            if (!acc[ownerId]) acc[ownerId] = [];
            acc[ownerId].push(space);
            return acc;
          },
          {} as Record<string, OwnerSpaceRow[]>
        );

        setSpacesByOwner(groupedSpaces);
      }
    }

    setLoading(false);
  }

  function displayName(user: AdminProfileRow) {
    const joined = `${user.first_name || ""} ${user.last_name || ""}`.trim();
    return joined || user.full_name || user.email || "Name not set";
  }

  function getBadgeClass(status?: string | null) {
    switch (status) {
      case "verified":
      case "active":
      case "admin":
        return "border-green-300 bg-green-50 text-green-700";
      case "rejected":
        return "border-red-300 bg-red-50 text-red-700";
      case "paused":
        return "border-gray-300 bg-gray-100 text-gray-700";
      default:
        return "border-yellow-300 bg-yellow-50 text-yellow-800";
    }
  }

  function toggleUser(userId: string) {
    setExpandedUsers((current) => ({
      ...current,
      [userId]: !current[userId],
    }));
  }

  function getUserSpaces(userId?: string) {
    if (!userId) return [];
    return spacesByOwner[userId] || [];
  }

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    if (!normalizedSearch) return users;

    return users.filter((user) => {
      const haystack = [
        user.first_name,
        user.last_name,
        user.full_name,
        user.email,
        user.phone,
        user.role,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [users, searchQuery]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-4xl rounded-md border border-gray-300 p-6 shadow-sm">
          Loading admin area...
        </div>
      </main>
    );
  }

  if (role !== "admin") {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-4xl rounded-md border border-red-300 bg-red-50 p-6">
          <h1 className="mb-3 text-2xl font-bold">Access denied</h1>
          <p className="text-sm text-red-700">
            You do not have admin access to this area.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-4xl font-bold">Admin Dashboard</h1>
        <p className="mb-6 text-gray-600">
          Internal management area for FindMySpace.
        </p>

        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-md border border-[#192a3a] bg-[#192a3a] px-4 py-2 text-sm text-white"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/admin#users-section"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Users className="h-4 w-4" />
            Users
          </Link>
          <Link
            href="/admin/spaces"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Building2 className="h-4 w-4" />
            Spaces
          </Link>
          <Link
            href="/admin/verification"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <ShieldCheck className="h-4 w-4" />
            Verification
          </Link>
          <Link
            href="/admin/messages"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <MessageSquare className="h-4 w-4" />
            Messages
          </Link>
          <Link
            href="/admin/finance"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Finance
          </Link>
        </div>

        <div className="mb-6 rounded-md border border-gray-300 bg-white p-4 shadow-sm">
          <label className="mb-3 block text-sm font-medium text-[#192a3a]">
            Search admin records
          </label>
          <div className="flex items-center gap-3 rounded-md border border-gray-300 px-3 py-2">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users by name, email, phone, or role"
              className="w-full border-0 bg-transparent text-sm text-[#192a3a] outline-none"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
            <span className="rounded-full bg-gray-100 px-3 py-1">Users search works on this page</span>
            <Link href="/admin/spaces" className="rounded-full bg-gray-100 px-3 py-1 hover:bg-gray-200">
              Go to Spaces
            </Link>
            <Link href="/admin/verification" className="rounded-full bg-gray-100 px-3 py-1 hover:bg-gray-200">
              Go to Verification
            </Link>
          </div>
        </div>


        <div id="users-section" className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Users</h2>
              <p className="text-sm text-gray-600">
                Manage platform users and review their current details.
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
              {filteredUsers.length} user{filteredUsers.length === 1 ? "" : "s"}
            </span>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="rounded-md border border-gray-300 p-5 text-sm text-gray-600 shadow-sm">
              No users found.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredUsers.map((user) => (
                <div
                  key={user.id || user.email || Math.random().toString()}
                  className="overflow-hidden rounded-md border border-gray-300 bg-white shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => user.id && toggleUser(user.id)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <h3 className="truncate text-xl font-semibold text-[#192a3a]">
                          {displayName(user)}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-gray-500">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getBadgeClass(user.role)}`}>
                          {user.role || "user"}
                        </span>
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getBadgeClass(user.owner_verification_status)}`}>
                          Owner: {user.owner_verification_status || "pending"}
                        </span>
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getBadgeClass(user.bank_verification_status)}`}>
                          Bank: {user.bank_verification_status || "pending"}
                        </span>

                        <span className="ml-2 text-sm font-medium text-[#192a3a]">
                          {getUserSpaces(user.id).length} listing{getUserSpaces(user.id).length === 1 ? "" : "s"}
                        </span>

                        {user.id && expandedUsers[user.id] ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-gray-700 lg:grid-cols-[1fr_0.8fr_1fr]">
                      <div className="rounded-sm border border-gray-200 bg-gray-50 px-4 py-2.5">
                        <div className="flex items-center gap-2 text-gray-500">
                          <Mail className="h-4 w-4" />
                          <p className="text-[11px] uppercase tracking-wide">Email</p>
                        </div>
                        <p className="mt-1 truncate text-[#192a3a]">{user.email || "Email not set"}</p>
                      </div>

                      <div className="rounded-sm border border-gray-200 bg-gray-50 px-4 py-2.5">
                        <div className="flex items-center gap-2 text-gray-500">
                          <Phone className="h-4 w-4" />
                          <p className="text-[11px] uppercase tracking-wide">Phone</p>
                        </div>
                        <p className="mt-1 text-[#192a3a]">{user.phone || "Phone not set"}</p>
                      </div>

                      <div className="rounded-sm border border-gray-200 bg-gray-50 px-4 py-2.5">
                        <div className="flex items-center gap-2 text-gray-500">
                          <Users className="h-4 w-4" />
                          <p className="text-[11px] uppercase tracking-wide">Created</p>
                        </div>
                        <p className="mt-1 text-[#192a3a]">
                          {user.created_at ? new Date(user.created_at).toLocaleString() : "Unknown"}
                        </p>
                      </div>
                    </div>
                  </button>

                  {user.id && expandedUsers[user.id] && (
                    <div className="border-t border-gray-200 px-4 pb-4 pt-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-[#192a3a]">Listings</h4>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                          {getUserSpaces(user.id).length} listing{getUserSpaces(user.id).length === 1 ? "" : "s"}
                        </span>
                      </div>

                      {getUserSpaces(user.id).length === 0 ? (
                        <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                          This user has no listings yet.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {getUserSpaces(user.id).map((space) => (
                            <div
                              key={space.id}
                              className="rounded-sm border border-gray-200 bg-gray-50 p-3"
                            >
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#192a3a]">
                                    {space.title || "Untitled listing"}
                                  </p>
                                  <p className="mt-1 text-xs text-gray-600">
                                    {[space.address_line_1, space.suburb, space.city]
                                      .filter(Boolean)
                                      .join(", ") || "Address not set"}
                                  </p>
                                  <p className="mt-1 text-xs text-gray-500">
                                    Type: {space.space_type || "Not set"} | Booking: {space.booking_unit || "Not set"}
                                  </p>
                                </div>

                                <div className="flex items-center gap-3">
                                  <span
                                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getBadgeClass(
                                      space.status
                                    )}`}
                                  >
                                    {space.status || "pending"}
                                  </span>
                                  <Link
                                    href={`/admin/spaces`}
                                    className="text-xs font-medium text-[#192a3a] underline"
                                  >
                                    Manage
                                  </Link>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {message && (
          <div className="mt-6 rounded-md bg-gray-100 p-3 text-sm text-gray-800">
            {message}
          </div>
        )}
      </div>
    </main>
  );
}