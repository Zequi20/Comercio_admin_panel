"use client";

import { Store } from "lucide-react";
import { useState } from "react";

import {
  isSupportedImageUrl,
  parseImageUrl,
} from "@/app/lib/image-url";

function metadataImageUrl(metadata?: Record<string, unknown> | null) {
  const value = metadata?.imageUrl;

  if (typeof value !== "string") {
    return null;
  }

  const parsed = parseImageUrl(value);

  if (!parsed) {
    return null;
  }

  return isSupportedImageUrl(parsed) ? parsed : null;
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
