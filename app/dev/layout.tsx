import { notFound } from "next/navigation";

export default function DevPreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const productionDatabase = supabaseUrl.includes("ppdaubmxrmzgmxdnyxff");
  return (
    <div data-dev-preview="non-writing">
      {productionDatabase ? (
        <p className="bg-amber-50 px-4 py-2 text-sm text-amber-950">
          These demonstration pages stay on sample data. They do not query the production database, take payment, or create bookings.
        </p>
      ) : null}
      {children}
    </div>
  );
}
