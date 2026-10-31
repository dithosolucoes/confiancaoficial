import { useRefreshedSignedUrl } from "@/lib/storageUrl";

interface PrivatePhotoProps {
  url: string | null | undefined;
  bucket?: string;
  alt?: string;
  className?: string;
}

/**
 * Renders an <img> for a file stored in a private storage bucket.
 * Resolves the URL just-in-time into a fresh signed URL so old public
 * URLs and expired signed URLs continue to display correctly.
 */
export function PrivatePhoto({ url, bucket = "equipment-photos", alt = "", className }: PrivatePhotoProps) {
  const resolved = useRefreshedSignedUrl(url, bucket);
  if (!resolved) return null;
  return <img src={resolved} alt={alt} className={className} loading="lazy" />;
}

interface PrivatePhotoLinkProps extends PrivatePhotoProps {
  children: React.ReactNode;
}

/**
 * Wraps children in an <a> pointing at a freshly signed URL for the file.
 */
export function PrivatePhotoLink({ url, bucket = "equipment-photos", children }: PrivatePhotoLinkProps) {
  const resolved = useRefreshedSignedUrl(url, bucket);
  return (
    <a href={resolved ?? "#"} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
