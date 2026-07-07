import { Suspense } from "react";
import MarketingUnsubscribePage from "./MarketingUnsubscribeClient";

export default function Page() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-lg px-4 py-16 text-sm text-gray-500">Loading…</main>}>
      <MarketingUnsubscribePage />
    </Suspense>
  );
}
