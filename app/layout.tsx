import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/app/components/Header";
import AdvisorParamCapture from "@/app/components/AdvisorParamCapture";
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
        <Header />

        <main>{children}</main>

        <footer className="mt-16 border-t border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-6 text-sm text-gray-500 text-center">
            <p>
              © {new Date().getFullYear()} FindMySpace. All rights reserved.
            </p>
            <div className="mt-2 flex justify-center gap-4">
              <a href="/terms" className="hover:underline">
                Terms & Conditions
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}