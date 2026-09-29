import type { Metadata } from "next";
import V2BrowseSpaces from "@/app/components/v2/V2BrowseSpaces";

export const metadata: Metadata = {
  title: "Browse Spaces | FindMySpace V2",
  robots: { index: false, follow: false },
};

export default function V2BrowseSpacesPage() {
  return <V2BrowseSpaces />;
}
