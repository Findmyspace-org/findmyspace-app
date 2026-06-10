"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  ExternalLink,
  LogOut,
  Menu,
  Search,
  User,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchAdminCommsUnreadCount } from "@/lib/admin-comms-badge";

type BadgeMap = Partial<
  Record<"comms" | "listing-enquiries" | "listing-claim-interests", number>
>;

export function AdminTopBar({
  onOpenSidebar,
  badges = {},
}: {
  onOpenSidebar: () => void;
  badges?: BadgeMap;
}) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<{
    email: string | null;
    name: string | null;
  } | null>(null);
  const [commsUnread, setCommsUnread] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      const { data } = await supabase
        .from("profiles")
        .select("email, first_name, last_name, full_name")
        .eq("id", user.id)
        .maybeSingle();

      const row = data as {
        email?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
      } | null;

      const name =
        `${row?.first_name || ""} ${row?.last_name || ""}`.trim() ||
        row?.full_name ||
        null;

      if (mounted) {
        setProfile({
          email: row?.email || user.email || null,
          name,
        });
      }

      const count = await fetchAdminCommsUnreadCount(user.id);
      if (mounted) setCommsUnread(count);
    }

    void loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    router.push(`/admin/users?search=${encodeURIComponent(q)}`);
  }

  const commsCount = badges.comms ?? commsUnread;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 md:px-4">
      <button
        type="button"
        onClick={onOpenSidebar}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Link href="/admin" className="hidden items-center gap-2 lg:flex">
        <Image src="/map-pin.png" alt="" width={24} height={24} aria-hidden />
        <span className="text-sm font-semibold text-[#192a3a]">Admin</span>
      </Link>

      <form
        onSubmit={handleSearchSubmit}
        className="hidden min-w-0 flex-1 md:block md:max-w-md lg:max-w-lg"
      >
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search…"
            className="w-full border-0 bg-transparent text-sm text-[#192a3a] outline-none placeholder:text-gray-400"
          />
        </div>
      </form>

      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/dashboard/comms?context=admin"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          aria-label="Comms inbox"
        >
          <Bell className="h-4 w-4" />
          {commsCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#c1121f] px-1 text-[10px] font-semibold text-white">
              {commsCount > 99 ? "99+" : commsCount}
            </span>
          ) : null}
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5 text-sm hover:bg-gray-50"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#192a3a]/10">
              <User className="h-4 w-4 text-[#192a3a]" />
            </span>
            <span className="hidden max-w-[120px] truncate text-sm font-medium text-[#192a3a] md:inline">
              {profile?.name || profile?.email || "Admin"}
            </span>
            <ChevronDown className="hidden h-4 w-4 text-gray-500 md:block" />
          </button>

          {profileOpen ? (
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <div className="border-b border-gray-100 px-3 py-2">
                <p className="truncate text-sm font-medium text-[#192a3a]">
                  {profile?.name || "Admin"}
                </p>
                {profile?.email ? (
                  <p className="truncate text-xs text-gray-500">{profile.email}</p>
                ) : null}
              </div>
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setProfileOpen(false)}
              >
                <ExternalLink className="h-4 w-4" />
                Public site
              </Link>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
