const COORDINATE_PAIR_PATTERN =
  /^(?:lat(?:itude|itud)?\s*[:=]?\s*)?(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(?:(?:lng|lon(?:gitude|gitud)?)\s*[:=]?\s*)?(-?\d{1,3}(?:\.\d+)?)$/i;

const LABELED_COORDINATE_PAIR_PATTERN =
  /^lat(?:itude|itud)?\s*[:=]?\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]+(?:lng|lon(?:gitude|gitud)?)\s*[:=]?\s*(-?\d{1,3}(?:\.\d+)?)$/i;

function isGoogleMapsUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isGoogleHostname =
      /^(?:(?:www|maps)\.)?google\.(?:com|[a-z]{2,3}|com\.[a-z]{2}|co\.[a-z]{2})$/.test(
        hostname
      );

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }

    return (
      hostname === "maps.app.goo.gl" ||
      (hostname === "goo.gl" && url.pathname.startsWith("/maps")) ||
      (isGoogleHostname &&
        (hostname.startsWith("maps.google.") ||
          url.pathname.startsWith("/maps")))
    );
  } catch {
    return false;
  }
}

function coordinatesFromAddress(address: string) {
  const normalized = address
    .trim()
    .replace(/^(?:(?:ubicaci[oó]n\s+)?gps|coordenadas?)\s*:?\s*/i, "")
    .replace(/^geo:\s*/i, "")
    .split("?")[0]
    .trim()
    .replace(/^\((.*)\)$/, "$1");
  const match =
    normalized.match(COORDINATE_PAIR_PATTERN) ??
    normalized.match(LABELED_COORDINATE_PAIR_PATTERN);

  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  return `${latitude},${longitude}`;
}

export function googleMapsUrlForAddress(address: string) {
  const normalized = address
    .trim()
    .replace(/^(?:(?:ubicaci[oó]n\s+)?gps)\s*:?\s*/i, "");

  if (isGoogleMapsUrl(normalized)) {
    return normalized;
  }

  const coordinates = coordinatesFromAddress(address);

  if (!coordinates) {
    return null;
  }

  const query = new URLSearchParams({ api: "1", query: coordinates });
  return `https://www.google.com/maps/search/?${query.toString()}`;
}
