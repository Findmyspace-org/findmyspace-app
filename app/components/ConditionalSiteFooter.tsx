"use client";

import { usePathname } from "next/navigation";

export function ConditionalSiteFooter() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <footer className="mt-16 border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-6 text-sm text-gray-500 text-center">
        <p>© {new Date().getFullYear()} FindMySpace. All rights reserved.</p>
        <div className="mt-2 flex justify-center gap-4">
          <a href="/terms" className="hover:underline">
            Terms & Conditions
          </a>
        </div>
      </div>
    </footer>
  );
}
