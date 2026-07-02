import { ChevronRight } from "lucide-react";
import { GuardedLink } from "@/app/components/UnsavedChangesProvider";

type Props = {
  propertyId: string;
  propertyName: string;
  spaceTitle?: string | null;
};

export function AdminPropertySpaceBreadcrumb({
  propertyId,
  propertyName,
  spaceTitle,
}: Props) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 space-y-2">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-gray-600">
        <li>
          <GuardedLink href="/admin/properties" className="font-medium hover:text-gray-900">
            Properties
          </GuardedLink>
        </li>
        <li aria-hidden className="text-gray-400">
          <ChevronRight className="h-3.5 w-3.5" />
        </li>
        <li>
          <GuardedLink
            href={`/admin/properties/${propertyId}`}
            className="font-medium hover:text-gray-900"
          >
            {propertyName}
          </GuardedLink>
        </li>
        {spaceTitle ? (
          <>
            <li aria-hidden className="text-gray-400">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li className="font-medium text-gray-900">{spaceTitle}</li>
          </>
        ) : null}
      </ol>
      <div className="flex flex-wrap gap-3 text-sm">
        <GuardedLink
          href={`/admin/properties/${propertyId}`}
          className="font-medium text-[#0f2740] hover:underline"
        >
          ← Back to property
        </GuardedLink>
        <GuardedLink href="/admin/properties" className="text-gray-600 hover:underline">
          All properties
        </GuardedLink>
      </div>
    </nav>
  );
}
