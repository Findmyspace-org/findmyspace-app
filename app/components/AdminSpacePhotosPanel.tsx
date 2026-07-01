"use client";

import {
  SpacePhotosPanel,
  type SpacePhotoImage,
} from "@/app/components/SpacePhotosPanel";

export type AdminSpaceImage = SpacePhotoImage;

type AdminSpacePhotosPanelProps = {
  spaceId?: string;
  images: AdminSpaceImage[];
  onImagesChange: (images: AdminSpaceImage[]) => void;
  readOnly?: boolean;
  compact?: boolean;
};

export function AdminSpacePhotosPanel(props: AdminSpacePhotosPanelProps) {
  return <SpacePhotosPanel {...props} apiMode="admin" />;
}
