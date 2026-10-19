"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";

/*
 * Storage path conventions (all buckets are private, read via short lived
 * signed URLs):
 *   messages.media_path, purchase_orders.file_path  -> "<bucket>/<manufacturer_id>/..."
 *   quotations.pdf_path                             -> "<manufacturer_id>/..." in bucket "quotations"
 *   documents.storage_path                          -> "<manufacturer_id>/..." in bucket "catalogues"
 */
export function splitBucketPath(fullPath: string): { bucket: string; key: string } {
  const i = fullPath.indexOf("/");
  return { bucket: fullPath.slice(0, i), key: fullPath.slice(i + 1) };
}

export async function signedUrl(bucket: string, key: string, expiresIn = 300): Promise<string | null> {
  const { data, error } = await getSupabaseBrowser().storage.from(bucket).createSignedUrl(key, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

export async function signedUrlForFullPath(fullPath: string, expiresIn = 300): Promise<string | null> {
  const { bucket, key } = splitBucketPath(fullPath);
  return signedUrl(bucket, key, expiresIn);
}

export async function openSigned(bucket: string, key: string) {
  const url = await signedUrl(bucket, key);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
  return url;
}
