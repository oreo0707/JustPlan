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
  const [imageState, setImageState] = useState<{
    reference: string;
    objectUrl: string | null;
    hasFinishedLoading: boolean;
  }>({
    reference,
    objectUrl: null,
    hasFinishedLoading: false,
  });

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    loadStoredImage(reference).then((blob) => {
      if (!active) return;
      if (!blob) {
        setImageState({
          reference,
          objectUrl: null,
          hasFinishedLoading: true,
        });
        return;
      }
      createdUrl = URL.createObjectURL(blob);
      setImageState({
        reference,
        objectUrl: createdUrl,
        hasFinishedLoading: true,
      });
    });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [reference]);

  const isCurrentReference = imageState.reference === reference;
  const objectUrl = isCurrentReference ? imageState.objectUrl : null;
  const hasFinishedLoading = isCurrentReference
    ? imageState.hasFinishedLoading
    : false;

  if (hasFinishedLoading && !objectUrl) {
    return (
      <div
        className={`${className ?? ""} flex items-center justify-center bg-gray-100 text-xs text-gray-500`}
        style={style}
      >
        Image unavailable
      </div>
    );
  }

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
