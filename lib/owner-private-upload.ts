import { supabase } from "@/lib/supabase";

/** Upload a file to a private bucket under `{ownerId}/{folder}-timestamp.ext`. */
export async function uploadOwnerPrivateFile(
  bucket: string,
  ownerId: string,
  file: File,
  folder: string
): Promise<{ filePath: string; fileUrl: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be logged in to upload files.");
  }

  if (user.id !== ownerId) {
    throw new Error("You can only upload files for your own account.");
  }

  const fileExt = file.name.split(".").pop() || "bin";
  const safeFolder = folder.replace(/[^a-zA-Z0-9-_]/g, "-");
  const filePath = `${ownerId}/${safeFolder}-${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

  return {
    filePath,
    fileUrl: data.publicUrl,
  };
}
