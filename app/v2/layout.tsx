import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import V2PreviewGate from "@/app/components/v2/V2PreviewGate";
import V2Shell from "@/app/components/v2/V2Shell";
import "./v2.css";

export const metadata: Metadata = {
  title: "V2 Preview | FindMySpace",
  robots: { index: false, follow: false },
};

export default function V2Layout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="fms-v2-root fms-v2-gate">
          <p>Preparing V2 preview…</p>
        </div>
      }
    >
      <V2PreviewGate>
        <V2Shell>{children}</V2Shell>
      </V2PreviewGate>
    </Suspense>
  );
}
