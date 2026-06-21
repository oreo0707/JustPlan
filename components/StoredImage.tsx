"use client";

import { useEffect, useState } from "react";
import {
  isStoredImageReference,
  loadStoredImage,
} from "@/lib/image-storage";

type StoredImageProps = {
  src: string;
  alt: string;
  className?: string;
};

function IndexedDatabaseImage({
  reference,
  alt,
  className,
}: {
  reference: string;
  alt: string;
  className?: string;
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
    return <div className={`${className ?? ""} animate-pulse bg-gray-100`} />;
  }

  return <img src={objectUrl} alt={alt} className={className} draggable={false} />;
}

export function StoredImage({ src, alt, className }: StoredImageProps) {
  if (!isStoredImageReference(src)) {
    return <img src={src} alt={alt} className={className} draggable={false} />;
  }

  return (
    <IndexedDatabaseImage
      reference={src}
      alt={alt}
      className={className}
    />
  );
}
