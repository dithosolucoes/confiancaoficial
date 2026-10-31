import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Create a signed URL for a file stored in a private storage bucket.
 * Returns null if the file cannot be signed. Use a long expiry for content
 * stored in the database (1 year). For just-in-time display use shorter ones.
 */
export async function createBucketSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 60 * 60 * 24 * 365 // 1 year
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    console.warn("createSignedUrl failed", bucket, path, error?.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Extract the in-bucket object path from a Supabase storage URL.
 * Supports both public (/object/public/<bucket>/...) and signed
 * (/object/sign/<bucket>/...?token=...) URL formats.
 */
export function extractBucketPath(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const tail = url.slice(idx + marker.length);
  const qIdx = tail.indexOf("?");
  return decodeURIComponent(qIdx === -1 ? tail : tail.slice(0, qIdx));
}

/**
 * Refresh a stored storage URL into a fresh signed URL. Use for content
 * stored as a signed URL that may have expired or as an old public URL
 * after the bucket was made private. Falls back to the original URL if
 * the path cannot be extracted.
 */
export async function refreshSignedUrl(
  url: string | null | undefined,
  bucket: string,
  expiresInSeconds = 60 * 60
): Promise<string | null> {
  if (!url) return null;
  const path = extractBucketPath(url, bucket);
  if (!path) return url;
  const signed = await createBucketSignedUrl(bucket, path, expiresInSeconds);
  return signed ?? url;
}

/**
 * React hook that turns a stored photo URL into a freshly signed URL for
 * private buckets. Returns the resolved URL (or the original while loading).
 */
export function useRefreshedSignedUrl(
  url: string | null | undefined,
  bucket: string,
  expiresInSeconds = 60 * 60
): string | null {
  const [resolved, setResolved] = useState<string | null>(url ?? null);
  useEffect(() => {
    let cancelled = false;
    if (!url) { setResolved(null); return; }
    refreshSignedUrl(url, bucket, expiresInSeconds).then((u) => {
      if (!cancelled) setResolved(u);
    });
    return () => { cancelled = true; };
  }, [url, bucket, expiresInSeconds]);
  return resolved;
}
