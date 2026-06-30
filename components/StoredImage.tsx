"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import {
  isStoredImageReference,
  loadStoredImage,
} from "@/lib/image-storage";

type StoredImageProps = {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
};

function IndexedDatabaseImage({
  reference,
  alt,
  className,
  style,
}: {
  reference: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    loadStoredImage(reference).then((blob) => {
      if (!active || !blob) return;
      createdUrl = URL.createObjectURL(blob);
      setObjectUrl(createdUrl);
    });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [reference]);

  if (!objectUrl) {
    return (
      <div
        className={`${className ?? ""} animate-pulse bg-gray-100`}
        style={style}
      />
    );
  }

  return (
    <img
      src={objectUrl}
      alt={alt}
      className={className}
      style={style}
      draggable={false}
    />
  );
}

export function StoredImage({ src, alt, className, style }: StoredImageProps) {
  if (!isStoredImageReference(src)) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        style={style}
        draggable={false}
      />
    );
  }

  return (
    <IndexedDatabaseImage
      reference={src}
      alt={alt}
      className={className}
      style={style}
    />
  );
}
