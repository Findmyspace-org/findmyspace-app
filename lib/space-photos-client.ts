import { adminApiFetch } from "@/lib/admin-api-client";
import { supabase } from "@/lib/supabase";
import { normalizeSpaceImages } from "@/lib/sort-space-images";

export type SpacePhotoImage = {
  id: string;
  image_url: string;
  sort_order: number | null;
  file_path?: string | null;
};

export type SpacePhotosApiMode = "admin" | "owner";

export async function reorderSpacePhotos(
  apiMode: SpacePhotosApiMode,
  spaceId: string,
  ordered: SpacePhotoImage[]
): Promise<void> {
  const imageIds = ordered.map((img) => img.id);

  if (apiMode === "admin") {
    await adminApiFetch(`/api/admin/spaces/${spaceId}/images/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ imageIds }),
    });
    return;
  }

  for (let i = 0; i < ordered.length; i++) {
    const { error } = await (supabase.from("space_images") as any)
      .update({ sort_order: i })
      .eq("id", ordered[i].id)
      .eq("space_id", spaceId);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function deleteSpacePhoto(
  apiMode: SpacePhotosApiMode,
  spaceId: string,
  image: SpacePhotoImage
): Promise<void> {
  if (apiMode === "admin") {
    await adminApiFetch(`/api/admin/spaces/${spaceId}/images`, {
      method: "DELETE",
      body: JSON.stringify({ imageId: image.id }),
    });
    return;
  }

  if (image.file_path) {
    const { error: storageError } = await supabase.storage
      .from("space-images")
      .remove([image.file_path]);

    if (storageError) {
      throw new Error(storageError.message);
    }
  }

  const { error: dbError } = await supabase
    .from("space_images")
    .delete()
    .eq("id", image.id)
    .eq("space_id", spaceId);

  if (dbError) {
    throw new Error(dbError.message);
  }
}

export async function uploadSpacePhotos(
  apiMode: SpacePhotosApiMode,
  spaceId: string,
  files: File[],
  existingImages: SpacePhotoImage[]
): Promise<{ added: SpacePhotoImage[]; failed: string[] }> {
  const prepared = files;

  if (apiMode === "admin") {
    const added: SpacePhotoImage[] = [];
    const failed: string[] = [];

    for (const file of prepared) {
      try {
        const form = new FormData();
        form.append("files", file);
        const result = await adminApiFetch(`/api/admin/spaces/${spaceId}/images`, {
          method: "POST",
          body: form,
        });
        added.push(...normalizeSpaceImages(result.images));
        const batchFailed = (result.failed as { name: string; error: string }[]) || [];
        for (const item of batchFailed) {
          failed.push(`${item.name}: ${item.error}`);
        }
      } catch (err) {
        failed.push(
          `${file.name}: ${err instanceof Error ? err.message : "Upload failed."}`
        );
      }
    }

    return { added, failed };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Please log in first.");
  }

  const startingSortOrder =
    existingImages.length > 0
      ? Math.max(...existingImages.map((img) => img.sort_order || 0)) + 1
      : 0;

  const added: SpacePhotoImage[] = [];
  const failed: string[] = [];

  for (let i = 0; i < prepared.length; i++) {
    const file = prepared[i];
    const fileExt = file.name.split(".").pop() || "bin";
    const fileName = `${user.id}/${spaceId}-${Date.now()}-${i}.${fileExt}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("space-images")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from("space-images")
        .getPublicUrl(fileName);

      const { data: inserted, error: insertError } = await (supabase
        .from("space_images") as any)
        .insert({
          space_id: spaceId,
          image_url: publicUrlData.publicUrl,
          file_path: fileName,
          sort_order: startingSortOrder + i,
        })
        .select("id, image_url, file_path, sort_order")
        .single();

      if (insertError || !inserted) {
        throw new Error(insertError?.message || "Could not save photo.");
      }

      added.push({
        id: inserted.id,
        image_url: inserted.image_url,
        file_path: inserted.file_path,
        sort_order: inserted.sort_order,
      });
    } catch (err) {
      failed.push(`${file.name}: ${err instanceof Error ? err.message : "Upload failed."}`);
    }
  }

  return { added, failed };
}
