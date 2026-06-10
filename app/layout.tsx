import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
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

        <main>{children}</main>

        <Suspense fallback={null}>
          <ConditionalSiteFooter />
        </Suspense>
      </body>
    </html>
  );
}