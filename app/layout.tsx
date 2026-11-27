import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { serverSupabaseTargetBlocked } from "@/lib/supabase-target-guard";
import Header from "@/app/components/Header";
import AdvisorParamCapture from "@/app/components/AdvisorParamCapture";
import { ConditionalSiteFooter } from "@/app/components/ConditionalSiteFooter";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "FindMySpace",
  description: "Rent storage, parking, and spaces near you.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-black">
        <Suspense fallback={null}>
          <AdvisorParamCapture />
        </Suspense>
        <Suspense fallback={null}>
          <Header />
        </Suspense>

        {serverSupabaseTargetBlocked() ? (
          <p className="bg-red-50 px-4 py-3 text-sm text-red-950">
            This environment is pointed at the production database. FindMySpace has stopped
            rather than read or write live customer data. Point it at the isolated Supabase
            project before testing.
          </p>
        ) : null}
        <main>{children}</main>

        <Suspense fallback={null}>
          <ConditionalSiteFooter />
        </Suspense>
      </body>
    </html>
  );
}