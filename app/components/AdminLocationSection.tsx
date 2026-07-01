export {
  SpaceLocationSection,
  type SpaceLocationValue,
} from "@/app/components/SpaceLocationSection";

/** @deprecated Use SpaceLocationSection with apiMode="admin". */
export type AdminLocationValue = import("@/app/components/SpaceLocationSection").SpaceLocationValue;

import {
  SpaceLocationSection,
  type SpaceLocationValue,
} from "@/app/components/SpaceLocationSection";

type AdminLocationSectionProps = {
  value: SpaceLocationValue;
  readOnly?: boolean;
  onChange: (patch: Partial<SpaceLocationValue>) => void;
};

export function AdminLocationSection(props: AdminLocationSectionProps) {
  return <SpaceLocationSection apiMode="admin" {...props} />;
}
