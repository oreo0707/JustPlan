"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
        <div className="fixed inset-0 z-[10000] flex flex-col bg-gray-100">
          <div className="flex items-center gap-3 border-b bg-white px-4 py-2 shadow-sm">
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

          <main className="min-h-0 flex-1 overflow-hidden bg-gray-100">
            {materialUrl && isPdfMaterial(material) ? (
              <iframe
                src={materialUrl}
                title={material.name}
                className="h-full w-full border-0"
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
