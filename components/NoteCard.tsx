"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { NoteMaterial } from "@/lib/types";
import { deleteStoredMaterial, loadStoredMaterial } from "@/lib/material-storage";

type NoteCardProps = {
  subjectId: string;
  noteId: string;
  title: string;
  template: string;
  materials?: NoteMaterial[];
  onSaveTitle: (title: string) => void;
  onSaveMaterials: (materials: NoteMaterial[]) => void;
  onDelete: () => void;
};

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdfMaterial(material: NoteMaterial) {
  return (
    material.type === "application/pdf" ||
    material.name.toLowerCase().endsWith(".pdf")
  );
}

function isWordMaterial(material: NoteMaterial) {
  const name = material.name.toLowerCase();
  return (
    material.type.includes("word") ||
    material.type.includes("officedocument") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx")
  );
}

function removeMaterialFileExtension(fileName: string) {
  return fileName.replace(/\.(pdf|docx?)$/i, "");
}

function PdfMaterialViewer({
  materialUrl,
  title,
}: {
  materialUrl: string;
  title: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      setContainerWidth(Math.floor(entry.contentRect.width));
    });

    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!materialUrl || containerWidth <= 0) return;

    let cancelled = false;

    async function renderPdfPages() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url
        ).toString();

        const pdf = await pdfjsLib.getDocument({ url: materialUrl }).promise;
        const nextPageImages: string[] = [];
        const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const targetPageWidth = Math.max(
          280,
          Math.min(containerWidth - 24, 1200)
        );

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;

          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = targetPageWidth / baseViewport.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) continue;

          canvas.width = Math.ceil(viewport.width * devicePixelRatio);
          canvas.height = Math.ceil(viewport.height * devicePixelRatio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;

          context.setTransform(
            devicePixelRatio,
            0,
            0,
            devicePixelRatio,
            0,
            0
          );

          await page.render({
            canvas,
            canvasContext: context,
            viewport,
          }).promise;

          nextPageImages.push(canvas.toDataURL("image/png"));
        }

        if (!cancelled) {
          setRenderError("");
          setPageImages(nextPageImages);
        }
      } catch {
        if (!cancelled) {
          setRenderError("This PDF could not be previewed in the app.");
        }
      }
    }

    void renderPdfPages();

    return () => {
      cancelled = true;
    };
  }, [containerWidth, materialUrl]);

  return (
    <div
      ref={containerRef}
      className="mx-auto min-h-full w-full overflow-visible bg-gray-200 px-3 py-4"
    >
      {renderError ? (
        <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-center text-sm text-gray-600 shadow-sm">
          <p>{renderError}</p>
          <a
            href={materialUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-white"
          >
            Open PDF
          </a>
        </div>
      ) : pageImages.length > 0 ? (
        <div className="flex flex-col items-center gap-4">
          {pageImages.map((pageImage, index) => (
            <img
              key={`${title}-${index}`}
              src={pageImage}
              alt={`${title} page ${index + 1}`}
              className="h-auto max-w-full rounded-lg bg-white shadow-md"
              draggable={false}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500">
          Loading PDF pages...
        </div>
      )}
    </div>
  );
}

export function NoteCard({
  subjectId,
  noteId,
  title,
  template,
  materials = [],
  onSaveTitle,
  onDelete,
}: NoteCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [showMaterialViewer, setShowMaterialViewer] = useState(false);
  const [materialUrl, setMaterialUrl] = useState("");

  const material = materials[0] ?? null;
  const isMaterialNote = Boolean(material);
  const visibleTitle = isMaterialNote
    ? removeMaterialFileExtension(title)
    : title;

  useEffect(() => {
    if (!material) {
      const frame = window.requestAnimationFrame(() => setMaterialUrl(""));
      return () => window.cancelAnimationFrame(frame);
    }

    let currentUrl = "";
    let cancelled = false;

    async function loadMaterial() {
      const blob = await loadStoredMaterial(material.fileReference);
      if (!blob || cancelled) return;

      currentUrl = URL.createObjectURL(blob);
      setMaterialUrl(currentUrl);
    }

    void loadMaterial();

    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [material]);

  async function handleDeleteNote() {
    await Promise.all(
      materials.map((item) => deleteStoredMaterial(item.fileReference))
    );
    onDelete();
  }

  if (isEditing) {
    return (
      <form
        className="rounded-lg border bg-gray-50 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const title = draftTitle.trim();
          if (!title) return;

          onSaveTitle(title);
          setIsEditing(false);
        }}
      >
        <label className="text-xs font-semibold text-gray-600">
          Note name
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
            autoFocus
          />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border bg-white px-3 py-1 text-sm"
            onClick={() => setIsEditing(false)}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!draftTitle.trim()}
            className="rounded-lg bg-black px-3 py-1 text-sm text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-gray-50 p-3">
        {isMaterialNote ? (
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => setShowMaterialViewer(true)}
          >
            <p className="truncate font-medium">{visibleTitle}</p>
            <p className="text-sm text-gray-500">
              Imported material · {formatFileSize(material.size)}
            </p>
          </button>
        ) : (
          <Link
            href={`/subjects/${subjectId}/notes/${noteId}`}
            className="min-w-0 flex-1"
          >
              <p className="truncate font-medium">{visibleTitle}</p>
            <p className="text-sm text-gray-500">
              Template: {template.charAt(0).toUpperCase() + template.slice(1)}
            </p>
          </Link>
        )}

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-lg border px-3 py-1 text-sm"
            onClick={() => {
                setDraftTitle(visibleTitle);
              setIsEditing(true);
            }}
          >
            Edit
          </button>

          <button
            type="button"
            className="rounded-lg border px-3 py-1 text-sm text-red-500"
            onClick={() => void handleDeleteNote()}
          >
            Delete
          </button>
        </div>
      </div>

      {showMaterialViewer && material && (
        <div className="fixed inset-0 z-[10000] flex h-[100dvh] flex-col bg-gray-100">
          <div className="flex shrink-0 items-center gap-3 border-b bg-white px-4 py-2 shadow-sm">
            <button
              type="button"
              className="rounded-lg border px-3 py-1 text-lg leading-none text-gray-700"
              onClick={() => setShowMaterialViewer(false)}
              aria-label="Back to subject"
            >
              ←
            </button>
            <h2 className="truncate text-base font-bold text-gray-950">
              {visibleTitle}
            </h2>
          </div>

          <main
            className="min-h-0 flex-1 overflow-auto bg-gray-200"
            style={{
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}
          >
            {materialUrl && isPdfMaterial(material) ? (
              <PdfMaterialViewer
                materialUrl={materialUrl}
                title={material.name}
              />
            ) : materialUrl && isWordMaterial(material) ? (
              <div className="flex h-full items-center justify-center bg-white p-8 text-center">
                <div>
                  <p className="text-lg font-semibold text-gray-900">
                    Word document stored
                  </p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                    Browsers usually cannot preview local Word files directly.
                    Download or open it from your device.
                  </p>
                  <a
                    href={materialUrl}
                    download={material.name}
                    className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm text-white"
                  >
                    Download Word File
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center bg-white text-sm text-gray-500">
                Loading material...
              </div>
            )}
          </main>
        </div>
      )}
    </>
  );
}
