import type { Metadata } from "next";
import RequireAuth from "@/app/components/RequireAuth";
import { SpacePlaceProvider } from "./SpacePlaceContext";
import { SpacePlaceShell } from "./components/SpacePlaceShell";

export const metadata: Metadata = {
  title: "The Space Place | FindMySpace",
  robots: { index: false, follow: false },
};

export default function SpacePlaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <SpacePlaceProvider>
        <SpacePlaceShell>{children}</SpacePlaceShell>
      </SpacePlaceProvider>
    </RequireAuth>
  );
}
