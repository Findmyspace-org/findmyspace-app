"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Globe2, Plus } from "lucide-react";
import { AdminNav } from "@/app/components/AdminNav";
import { adminApiFetch } from "@/lib/admin-api-client";
import { useAdminRole } from "@/lib/use-admin-role";

type ImportJob = {
  id: string;
  source_url: string;
  normalized_domain: string | null;
  status: string;
  crawl_depth: number;
  max_pages: number;
  created_at: string;
  updated_at: string;
  extraction_summary: string | null;
  confidence_score: number | null;
  error_message: string | null;
};

export default function VenueScoutImportsPage() {
  const { isAdmin, loading: roleLoading } = useAdminRole();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [jobs, setJobs] = useState<ImportJob[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApiFetch("/api/admin/venue-scout/imports");
      setJobs((result.jobs as ImportJob[]) || []);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load imports.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isAdmin) void load();
      else if (!roleLoading) setLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isAdmin, roleLoading, load]);

  if (roleLoading || loading) return <main className="p-8 text-gray-600">Loading…</main>;
  if (!isAdmin) {
    return (
      <main className="p-8">
        <p className="text-red-600">Access denied.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <AdminNav current="venue-scout" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/admin/venue-scout"
              className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to venue scout
            </Link>
            <h1 className="text-2xl font-semibold text-gray-900">Website imports</h1>
            <p className="mt-1 text-sm text-gray-600">
              Staged crawl results waiting for review. No live data is created until conversion.
            </p>
          </div>
          <Link
            href="/admin/venue-scout/import"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            New import
          </Link>
        </div>

        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {jobs.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-600">
              No website imports yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/admin/venue-scout/imports/${job.id}`}
                  className="block p-4 hover:bg-gray-50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                        <Globe2 className="h-4 w-4 text-gray-500" />
                        <span className="truncate">{job.normalized_domain || job.source_url}</span>
                      </p>
                      <p className="mt-1 break-all text-xs text-gray-500">{job.source_url}</p>
                      <p className="mt-2 text-sm text-gray-600">
                        {job.extraction_summary || job.error_message || "Awaiting crawl result."}
                      </p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {job.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
