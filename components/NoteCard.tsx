"use client";

import Link from "next/link";
import { useState } from "react";

type NoteCardProps = {
  subjectId: string;
  noteId: string;
  title: string;
  template: string;
  onSaveTitle: (title: string) => void;
  onDelete: () => void;
};

export function NoteCard({
  subjectId,
  noteId,
  title,
  template,
  onSaveTitle,
  onDelete,
}: NoteCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);

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
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-gray-50 p-3">
      <Link href={`/subjects/${subjectId}/notes/${noteId}`} className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="text-sm text-gray-500">
          Template: {template.charAt(0).toUpperCase() + template.slice(1)}
        </p>
      </Link>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          className="rounded-lg border px-3 py-1 text-sm"
          onClick={() => {
            setDraftTitle(title);
            setIsEditing(true);
          }}
        >
          Edit
        </button>
        <button
          type="button"
          className="rounded-lg border px-3 py-1 text-sm text-red-500"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
