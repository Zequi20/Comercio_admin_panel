"use client";

import { Store } from "lucide-react";
import { useState } from "react";

function metadataImageUrl(metadata?: Record<string, unknown> | null) {
  const value = metadata?.imageUrl;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("data:image/")
  ) {
    return trimmed;
  }

  return null;
}

export function MerchantAvatar({
  className = "commerce-avatar",
  iconSize = 28,
  metadata,
  name,
}: {
  className?: string;
  iconSize?: number;
  metadata?: Record<string, unknown> | null;
  name: string;
}) {
  const imageUrl = metadataImageUrl(metadata);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  if (imageUrl && failedImageUrl !== imageUrl) {
    return (
      <span className={`${className} merchant-avatar has-image`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={name}
          loading="lazy"
          referrerPolicy="no-referrer"
          src={imageUrl}
          onError={() => setFailedImageUrl(imageUrl)}
        />
      </span>
    );
  }

  return (
    <span className={`${className} merchant-avatar`} aria-hidden="true">
      <Store size={iconSize} />
    </span>
  );
}
