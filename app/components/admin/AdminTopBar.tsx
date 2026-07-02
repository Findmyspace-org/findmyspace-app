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

export function AdminTopBar({
  onOpenSidebar,
  unreadCount = 0,
  actionRequiredCount = 0,
}: {
  onOpenSidebar: () => void;
  unreadCount?: number;
  actionRequiredCount?: number;
}) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [profile, setProfile] = useState<{
    email: string | null;
    name: string | null;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
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
    if (loggingOut) return;
    setLoggingOut(true);
    setProfileOpen(false);

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      window.location.replace("/");
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    router.push(`/admin/users?search=${encodeURIComponent(q)}`);
  }

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
          href="/admin/comms"
          className="relative inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-2.5 text-gray-700 hover:bg-gray-50"
          aria-label={`Comms inbox${unreadCount ? `, ${unreadCount} unread` : ""}${actionRequiredCount ? `, ${actionRequiredCount} need action` : ""}`}
        >
          <Bell className="h-4 w-4" />
          <span className="hidden text-xs font-medium text-gray-600 sm:inline">
            {unreadCount > 0 ? `${unreadCount} unread` : "Comms"}
          </span>
          {unreadCount > 0 ? (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#c1121f] px-1 text-[10px] font-semibold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
          {actionRequiredCount > 0 ? (
            <span
              className="hidden rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 sm:inline-flex"
              title={`${actionRequiredCount} items need admin action`}
            >
              {actionRequiredCount} action
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
