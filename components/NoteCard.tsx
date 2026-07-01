"use client";

import Link from "next/link";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { NoteMaterial } from "@/lib/types";
import { loadStoredMaterial } from "@/lib/material-storage";

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

function getPdfViewerUrl(url: string) {
  return `${url}#toolbar=1&navpanes=0&scrollbar=1&view=FitH&zoom=page-width`;
}

type PdfAnnotationTool = "pan" | "highlight" | "draw" | "erase";

type RenderedPdfPage = {
  src: string;
  width: number;
  height: number;
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getSvgPoint(
  event: ReactPointerEvent<SVGSVGElement>,
  svg: SVGSVGElement
) {
  const rect = svg.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;

  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  };
}

function getAnnotationBounds(points: { x: number; y: number }[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function isPointNearAnnotation(
  point: { x: number; y: number },
  annotation: NoteMaterial["highlights"][number],
  radius: number
) {
  const points = annotation.points ?? [];

  if (points.length > 0) {
    return points.some((annotationPoint) => {
      const xDistance = annotationPoint.x - point.x;
      const yDistance = annotationPoint.y - point.y;
      return Math.hypot(xDistance, yDistance) <= radius;
    });
  }

  return (
    point.x >= annotation.x - radius &&
    point.x <= annotation.x + annotation.width + radius &&
    point.y >= annotation.y - radius &&
    point.y <= annotation.y + annotation.height + radius
  );
}

function NativePdfViewer({
  materialUrl,
  title,
}: {
  materialUrl: string;
  title: string;
}) {
  return (
    <iframe
      src={getPdfViewerUrl(materialUrl)}
      title={title}
      className="h-full w-full border-0 bg-white"
    />
  );
}

function PdfMaterialViewer({
  materialUrl,
  title,
  material,
  onSaveMaterial,
}: {
  materialUrl: string;
  title: string;
  material: NoteMaterial;
  onSaveMaterial: (material: NoteMaterial) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasRedirectedToPdfRef = useRef(false);
  const activeAnnotationRef = useRef<NoteMaterial["highlights"][number] | null>(
    null
  );
  const [containerWidth, setContainerWidth] = useState(0);
  const [pdfPages, setPdfPages] = useState<RenderedPdfPage[]>([]);
  const [renderError, setRenderError] = useState("");
  const [tool, setTool] = useState<PdfAnnotationTool>("pan");
  const [annotationColor, setAnnotationColor] = useState("#fff08a");
  const [strokeWidth, setStrokeWidth] = useState(14);
  const [draftAnnotation, setDraftAnnotation] = useState<
    NoteMaterial["highlights"][number] | null
  >(null);

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
        const nextPages: RenderedPdfPage[] = [];
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

          nextPages.push({
            src: canvas.toDataURL("image/png"),
            width: viewport.width,
            height: viewport.height,
          });
        }

        if (!cancelled) {
          setRenderError("");
          setPdfPages(nextPages);
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

  useEffect(() => {
    if (!renderError || hasRedirectedToPdfRef.current) return;

    hasRedirectedToPdfRef.current = true;
    window.location.href = materialUrl;
  }, [materialUrl, renderError]);

  function saveAnnotations(nextAnnotations: NoteMaterial["highlights"]) {
    onSaveMaterial({
      ...material,
      highlights: nextAnnotations,
    });
  }

  function handleAnnotationPointerDown(
    event: ReactPointerEvent<SVGSVGElement>,
    pageNumber: number
  ) {
    if (tool === "pan") return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const point = getSvgPoint(event, event.currentTarget);

    if (tool === "erase") {
      const radius = Math.max(2, strokeWidth / 4);
      saveAnnotations(
        (material.highlights ?? []).filter(
          (annotation) =>
            annotation.page !== pageNumber ||
            !isPointNearAnnotation(point, annotation, radius)
        )
      );
      return;
    }

    const newAnnotation: NoteMaterial["highlights"][number] = {
      id: createId("material-mark"),
      page: pageNumber,
      tool,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      color: annotationColor,
      strokeWidth,
      points: [point],
    };

    activeAnnotationRef.current = newAnnotation;
    setDraftAnnotation(newAnnotation);
  }

  function handleAnnotationPointerMove(
    event: ReactPointerEvent<SVGSVGElement>
  ) {
    if (tool === "pan" || tool === "erase" || !activeAnnotationRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = getSvgPoint(event, event.currentTarget);
    const nextPoints = [...(activeAnnotationRef.current.points ?? []), point];
    const bounds = getAnnotationBounds(nextPoints);
    const nextAnnotation = {
      ...activeAnnotationRef.current,
      ...bounds,
      points: nextPoints,
    };

    activeAnnotationRef.current = nextAnnotation;
    setDraftAnnotation(nextAnnotation);
  }

  function handleAnnotationPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const finishedAnnotation = activeAnnotationRef.current;
    activeAnnotationRef.current = null;
    setDraftAnnotation(null);

    if (!finishedAnnotation || (finishedAnnotation.points?.length ?? 0) < 2) {
      return;
    }

    saveAnnotations([...(material.highlights ?? []), finishedAnnotation]);
  }

  function renderAnnotation(
    annotation: NoteMaterial["highlights"][number],
    page: RenderedPdfPage
  ) {
    const points = annotation.points ?? [];
    const linePoints = points
      .map(
        (point) =>
          `${(point.x / 100) * page.width},${(point.y / 100) * page.height}`
      )
      .join(" ");

    if (points.length > 0) {
      return (
        <polyline
          key={annotation.id}
          points={linePoints}
          fill="none"
          stroke={annotation.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={annotation.strokeWidth ?? 10}
          opacity={annotation.tool === "highlight" ? 0.45 : 1}
        />
      );
    }

    return (
      <rect
        key={annotation.id}
        x={(annotation.x / 100) * page.width}
        y={(annotation.y / 100) * page.height}
        width={(annotation.width / 100) * page.width}
        height={(annotation.height / 100) * page.height}
        fill={annotation.color}
        opacity={0.45}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="mx-auto min-h-full w-full overflow-visible bg-gray-200 px-3 py-4"
    >
      {renderError ? (
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500">
          Opening PDF...
        </div>
      ) : pdfPages.length > 0 ? (
        <div className="flex flex-col items-center gap-4">
          <div className="sticky top-2 z-20 flex max-w-full items-center gap-2 rounded-full border bg-white/90 px-3 py-2 text-xs shadow-lg backdrop-blur">
            {(["pan", "highlight", "draw", "erase"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={
                  tool === option
                    ? "rounded-full bg-black px-3 py-1 text-white"
                    : "rounded-full border px-3 py-1 text-gray-700"
                }
                onClick={() => setTool(option)}
              >
                {option === "pan"
                  ? "Pan"
                  : option === "highlight"
                    ? "Highlight"
                    : option === "draw"
                      ? "Pencil"
                      : "Eraser"}
              </button>
            ))}

            <input
              type="color"
              value={annotationColor}
              onChange={(event) => setAnnotationColor(event.target.value)}
              className="h-8 w-8 rounded border bg-white"
              aria-label="Annotation color"
              disabled={tool === "erase"}
            />

            <input
              type="range"
              min="4"
              max="36"
              value={strokeWidth}
              onChange={(event) => setStrokeWidth(Number(event.target.value))}
              className="w-20"
              aria-label="Annotation thickness"
            />
          </div>

          {pdfPages.map((page, index) => {
            const pageNumber = index + 1;
            const pageAnnotations = (material.highlights ?? []).filter(
              (annotation) => (annotation.page ?? 1) === pageNumber
            );
            const visibleAnnotations =
              draftAnnotation?.page === pageNumber
                ? [...pageAnnotations, draftAnnotation]
                : pageAnnotations;

            return (
              <div
                key={`${title}-${index}`}
                className="relative max-w-full rounded-lg bg-white shadow-md"
                style={{ width: page.width }}
              >
                <img
                  src={page.src}
                  alt={`${title} page ${pageNumber}`}
                  className="h-auto max-w-full rounded-lg bg-white"
                  draggable={false}
                />
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${page.width} ${page.height}`}
                  preserveAspectRatio="none"
                  style={{
                    touchAction: tool === "pan" ? "auto" : "none",
                    pointerEvents: tool === "pan" ? "none" : "auto",
                  }}
                  onPointerDown={(event) =>
                    handleAnnotationPointerDown(event, pageNumber)
                  }
                  onPointerMove={handleAnnotationPointerMove}
                  onPointerUp={handleAnnotationPointerUp}
                  onPointerCancel={handleAnnotationPointerUp}
                >
                  {visibleAnnotations.map((annotation) =>
                    renderAnnotation(annotation, page)
                  )}
                </svg>
              </div>
            );
          })}
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
  onSaveMaterials,
  onDelete,
}: NoteCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [showMaterialViewer, setShowMaterialViewer] = useState(false);
  const [materialUrl, setMaterialUrl] = useState("");
  const [useTabletPdfViewer, setUseTabletPdfViewer] = useState(false);

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

  useEffect(() => {
    function updateViewerMode() {
      const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const compactWidth = window.matchMedia("(max-width: 900px)").matches;
      setUseTabletPdfViewer(coarsePointer || compactWidth);
    }

    updateViewerMode();
    window.addEventListener("resize", updateViewerMode);

    return () => window.removeEventListener("resize", updateViewerMode);
  }, []);

  function handleDeleteNote() {
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
            onClick={handleDeleteNote}
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
              useTabletPdfViewer ? (
                <PdfMaterialViewer
                  materialUrl={materialUrl}
                  title={material.name}
                  material={material}
                  onSaveMaterial={(nextMaterial) =>
                    onSaveMaterials([nextMaterial])
                  }
                />
              ) : (
                <NativePdfViewer
                  materialUrl={materialUrl}
                  title={material.name}
                />
              )
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
