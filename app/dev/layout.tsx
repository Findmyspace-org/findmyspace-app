import { notFound } from "next/navigation";

export default function DevPreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.VERCEL_ENV === "production") notFound();
  return children;
}
