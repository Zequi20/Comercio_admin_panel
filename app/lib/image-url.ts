const GOOGLE_DRIVE_HOSTNAMES = new Set([
  "drive.google.com",
  "www.drive.google.com",
]);
const GOOGLE_DRIVE_FILE_PATH = /^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/;
const GOOGLE_DRIVE_FILE_ID = /^[A-Za-z0-9_-]+$/;

function googleDriveFileId(url: URL) {
  if (!GOOGLE_DRIVE_HOSTNAMES.has(url.hostname.toLowerCase())) {
    return null;
  }

  const pathMatch = url.pathname.match(GOOGLE_DRIVE_FILE_PATH);
  if (pathMatch) {
    return pathMatch[1];
  }

  if (
    url.pathname !== "/open" &&
    url.pathname !== "/uc" &&
    url.pathname !== "/thumbnail"
  ) {
    return null;
  }

  const queryId = url.searchParams.get("id");
  return queryId && GOOGLE_DRIVE_FILE_ID.test(queryId) ? queryId : null;
}

/**
 * Converts supported Google Drive sharing URLs to an embeddable thumbnail URL.
 * Other image URLs are returned trimmed and unchanged.
 */
export function parseImageUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    const fileId = googleDriveFileId(url);

    return fileId
      ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w500`
      : trimmed;
  } catch {
    return trimmed;
  }
}

export function isSupportedImageUrl(value: string) {
  const parsed = parseImageUrl(value);

  if (!parsed) {
    return true;
  }

  if (parsed.startsWith("/") || parsed.startsWith("data:image/")) {
    return true;
  }

  try {
    const url = new URL(parsed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseMetadataImageUrl(metadata: Record<string, unknown>) {
  const imageUrl = metadata.imageUrl;

  if (typeof imageUrl !== "string") {
    return metadata;
  }

  const parsedImageUrl = parseImageUrl(imageUrl);

  return parsedImageUrl === imageUrl
    ? metadata
    : { ...metadata, imageUrl: parsedImageUrl };
}
