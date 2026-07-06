"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Globe2 } from "lucide-react";
import { AdminNav } from "@/app/components/AdminNav";
import { adminApiFetch } from "@/lib/admin-api-client";
import { useAdminRole } from "@/lib/use-admin-role";

export default function VenueScoutImportPage() {
  const router = useRouter();
  const { isAdmin, loading } = useAdminRole();
  const [sourceUrl, setSourceUrl] = useState("");
  const [maxPages, setMaxPages] = useState("20");
  const [crawlDepth, setCrawlDepth] = useState("2");
  const [includeImages, setIncludeImages] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("Crawling website. This may take up to a minute for larger sites…");
    try {
      const result = await adminApiFetch("/api/admin/venue-scout/imports", {
        method: "POST",
        body: JSON.stringify({
          source_url: sourceUrl,
          max_pages: Number(maxPages),
          crawl_depth: Number(crawlDepth),
          include_images: includeImages,
        }),
      });
      const jobId = result.job_id;
      if (typeof jobId === "string") {
        router.replace(`/admin/venue-scout/imports/${jobId}`);
      } else {
        router.replace("/admin/venue-scout/imports");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Import failed.");
    }
    setSubmitting(false);
  }

  if (loading) return <main className="p-8 text-gray-600">Loading…</main>;
  if (!isAdmin) {
    return (
      <main className="p-8">
        <p className="text-red-600">Access denied.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-3xl">
        <AdminNav current="venue-scout" />
        <Link
          href="/admin/venue-scout"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to venue scout
        </Link>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0f2740]/10 text-[#0f2740]">
              <Globe2 className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                Import venue website
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Crawl a same-domain venue website into staging. Nothing is created in
                properties or spaces until you review and convert.
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-gray-800">Website URL</span>
              <input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                required
                placeholder="https://examplevenue.co.za"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-gray-800">Max pages</span>
                <select
                  value={maxPages}
                  onChange={(event) => setMaxPages(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-800">Crawl depth</span>
                <select
                  value={crawlDepth}
                  onChange={(event) => setCrawlDepth(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(event) => setIncludeImages(event.target.checked)}
                className="mt-1"
              />
              <span>
                Stage image candidates. Images are not imported into listings until an
                admin confirms permission and uses the existing upload/storage flow.
              </span>
            </label>

            {message ? <p className="text-sm text-gray-700">{message}</p> : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? "Starting import…" : "Start import"}
              </button>
              <Link
                href="/admin/venue-scout/imports"
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800"
              >
                View imports
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
