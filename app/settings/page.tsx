"use client";

import { type FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import type { AppData, Note, NoteTemplate } from "@/lib/types";
import { defaultData } from "@/lib/default-data";
import {
  clearData,
  exportDataFile,
  importDataFile,
  loadData,
  saveData,
} from "@/lib/storage";
import {
  permanentlyDeleteNotes,
  recoverDeletedNotes,
  updateSettings,
} from "@/lib/study-actions";
import { applyCursorStyle } from "@/lib/apply-cursor";
import { AppColorThemeSettings } from "@/components/AppColorThemeSettings";
import { appThemeOptions, type AppThemeId } from "@/lib/app-themes";
import { deleteStoredMaterial } from "@/lib/material-storage";
import { deleteStoredImage, isStoredImageReference } from "@/lib/image-storage";
import {
  REPLAY_TUTORIAL_EVENT,
  RESTART_TUTORIALS_EVENT,
} from "@/components/TutorialController";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isDeletedNoteExpired(note: Note, currentTime: number) {
  if (!note.deleted_at) return false;

  const deletedTime = new Date(note.deleted_at).getTime();
  if (Number.isNaN(deletedTime)) return false;

  return currentTime - deletedTime >= THIRTY_DAYS_MS;
}

function getExpiredDeletedNotes(nextData: AppData, currentTime: number) {
  return nextData.recently_deleted.notes.filter((note) =>
    isDeletedNoteExpired(note, currentTime)
  );
}

function removeExpiredDeletedNotes(nextData: AppData, currentTime: number) {
  const activeNotes = nextData.recently_deleted.notes.filter(
    (note) => !isDeletedNoteExpired(note, currentTime)
  );

  if (activeNotes.length === nextData.recently_deleted.notes.length) {
    return nextData;
  }

  return {
    ...nextData,
    recently_deleted: {
      ...nextData.recently_deleted,
      notes: activeNotes,
    },
  };
}

async function deleteStoredFilesForNotes(notes: Note[]) {
  await Promise.all(
    notes.flatMap((note) => [
      ...(note.materials ?? []).map((material) =>
        deleteStoredMaterial(material.fileReference)
      ),
      ...note.objects
        .filter(
          (object) =>
            object.type === "image" &&
            object.src &&
            isStoredImageReference(object.src)
        )
        .map((object) => deleteStoredImage(object.src as string)),
    ])
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<AppData>(defaultData);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState("general");
  const [feedbackRating, setFeedbackRating] = useState("5");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [showRecentlyDeletedNotes, setShowRecentlyDeletedNotes] =
    useState(false);
  const [selectedDeletedNoteIds, setSelectedDeletedNoteIds] = useState<
    string[]
  >([]);
  const [feedbackStatus, setFeedbackStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [feedbackError, setFeedbackError] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const loadedData = loadData();
      const currentTime = new Date().getTime();
      const expiredNotes = getExpiredDeletedNotes(loadedData, currentTime);
      const cleanedData = removeExpiredDeletedNotes(
        loadedData,
        currentTime
      );
      setData(cleanedData);
      if (cleanedData !== loadedData) {
        saveData(cleanedData);
        void deleteStoredFilesForNotes(expiredNotes);
      }
      setHasLoaded(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    saveData(data);
  }, [data, hasLoaded]);

  function handleUpdateSettings(settings: Partial<AppData["settings"]>) {
    const updatedData = updateSettings(data, settings);
    setData(updatedData);

    if (settings.cursor_style) {
      applyCursorStyle(settings.cursor_style);
      window.dispatchEvent(new Event("cursor-style-changed"));
    }

    if (
      settings.app_background_color ||
      settings.app_surface_color ||
      settings.app_accent_color ||
      settings.app_text_color
    ) {
      saveData(updatedData);
      window.dispatchEvent(new Event("app-colors-changed"));
    }
  }

  function handleApplyAppTheme(themeId: AppThemeId) {
    const themeOption = appThemeOptions.find((option) => option.id === themeId);
    if (!themeOption) return;

    handleUpdateSettings({
      app_theme: themeOption.id,
      theme: themeOption.noteTheme,
      ...themeOption.colors,
    });
  }

  function handleExportBackup() {
    exportDataFile(data);
  }

  async function handleImportBackup(file: File) {
    const confirmed = window.confirm(
      "Importing this backup will replace your current Just Plan data. Continue?"
    );

    if (!confirmed) return;

    try {
      const importedData = await importDataFile(file);

      setData(importedData);
      saveData(importedData);

      window.alert("Backup imported successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to import backup.";

      window.alert(message);
    }
  }

  function handleResetData() {
    const confirmed = window.confirm(
      "Are you sure you want to reset all data? This will delete all subjects, tasks, notes, and settings."
    );

    if (!confirmed) return;

    clearData();
    setData(defaultData);
  }

  function getDeletedNoteDescription(note: Note) {
    const deletedDate = note.deleted_at
      ? new Date(note.deleted_at).toLocaleDateString()
      : "Unknown date";
    const subjectName = note.deleted_from_subject_name || "Unknown subject";

    return `${subjectName} · Deleted ${deletedDate}`;
  }

  function toggleDeletedNoteSelection(noteId: string) {
    setSelectedDeletedNoteIds((current) =>
      current.includes(noteId)
        ? current.filter((id) => id !== noteId)
        : [...current, noteId]
    );
  }

  function toggleSelectAllDeletedNotes() {
    const noteIds = data.recently_deleted.notes.map((note) => note.id);

    setSelectedDeletedNoteIds((current) =>
      current.length === noteIds.length ? [] : noteIds
    );
  }

  function handleRecoverDeletedNotes() {
    if (selectedDeletedNoteIds.length === 0) return;

    const updatedData = recoverDeletedNotes(data, selectedDeletedNoteIds);
    setData(updatedData);
    setSelectedDeletedNoteIds([]);
  }

  async function handlePermanentlyDeleteNotes() {
    if (selectedDeletedNoteIds.length === 0) return;

    const confirmed = window.confirm(
      "Permanently delete the selected notes? This cannot be undone."
    );

    if (!confirmed) return;

    const selectedIds = new Set(selectedDeletedNoteIds);
    const notesToDelete = data.recently_deleted.notes.filter((note) =>
      selectedIds.has(note.id)
    );

    await deleteStoredFilesForNotes(notesToDelete);

    const updatedData = permanentlyDeleteNotes(data, selectedDeletedNoteIds);
    setData(updatedData);
    setSelectedDeletedNoteIds([]);
  }

  async function handleSubmitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = feedbackMessage.trim();

    if (message.length < 5) {
      setFeedbackStatus("error");
      setFeedbackError("Please write a little more feedback before sending.");
      return;
    }

    setFeedbackStatus("sending");
    setFeedbackError("");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: feedbackCategory,
          rating: Number(feedbackRating),
          message,
          page: "Settings",
        }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        throw new Error(result?.error ?? "Unable to send feedback.");
      }

      setFeedbackStatus("sent");
      setFeedbackMessage("");
      setFeedbackCategory("general");
      setFeedbackRating("5");
    } catch (error) {
      setFeedbackStatus("error");
      setFeedbackError(
        error instanceof Error
          ? error.message
          : "Unable to send feedback right now."
      );
    }
  }

  const isDark = data.settings.theme === "dark";

  const cardClass = isDark
    ? "rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-sm"
    : "rounded-xl border bg-white p-6 shadow-sm";

  const titleClass = isDark
    ? "text-3xl font-bold text-gray-100"
    : "text-3xl font-bold text-gray-950";

  const sectionTitleClass = isDark
    ? "text-xl font-semibold text-gray-100"
    : "text-xl font-semibold text-gray-900";

  const mutedTextClass = isDark ? "text-gray-400" : "text-gray-600";

  const cursorOptions = [
    {
      value: "default",
      label: "Default",
      previewImage: "/cursors/default-cursor.png",
    },
    {
      value: "y2k-arrow",
      label: "Pin",
      previewImage: "/cursors/pin.png",
    },
    {
      value: "heart",
      label: "Heart",
      previewImage: "/cursors/heart.png",
    },
    {
      value: "cute-pointer",
      label: "Cute Pointer",
      previewImage: "/cursors/pointer.png",
    },
    {
      value: "star",
      label: "Star",
      previewImage: "/cursors/star.png",
    },
  ];

  return (
    <AppShell>
      <section className="mx-auto max-w-4xl space-y-6 pb-12">
        <div>
          <h1 className={titleClass}>Settings</h1>
          <p className="mt-2 text-gray-600">
            Manage your app preferences and note defaults.
          </p>
        </div>

        <section className={cardClass}>
          <h2 className="text-xl font-semibold text-gray-900">
            Appearance
          </h2>

          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700">App Theme</p>

            <div className="mt-2 flex flex-wrap gap-2">
              {appThemeOptions.slice(0, 2).map((themeOption) => {
                const isSelected =
                  (data.settings.app_theme ?? data.settings.theme) ===
                  themeOption.id;

                return (
                  <button
                    key={themeOption.id}
                    type="button"
                    className={
                      isSelected
                        ? "rounded-full border-2 border-black px-3 py-1.5 text-xs font-semibold shadow-sm"
                        : "rounded-full border px-3 py-1.5 text-xs font-semibold hover:shadow-sm"
                    }
                    onClick={() => handleApplyAppTheme(themeOption.id)}
                  >
                    <span
                      className="mr-2 inline-block h-3 w-3 rounded-full align-[-1px]"
                      style={{
                        backgroundColor: themeOption.colors.app_accent_color,
                      }}
                    />
                    {themeOption.label}
                  </button>
                );
              })}
            </div>

            <p className="mt-2 text-sm text-gray-500">
              Each theme changes the whole app palette. Your note editor stays
              unchanged except when Dark is selected.
            </p>

            <div className="mt-6" data-tutorial="settings-cursors">
              <p className="text-sm font-medium text-gray-700">Cursor Style</p>

              <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {cursorOptions.map((cursor) => (
                  <button
                    key={cursor.value}
                    type="button"
                    className={
                      data.settings.cursor_style === cursor.value
                        ? "flex h-32 flex-col items-center justify-center rounded-xl border-2 border-black bg-gray-50 p-4 text-center"
                        : "flex h-32 flex-col items-center justify-center rounded-xl border bg-white p-4 text-center hover:bg-gray-50"
                    }
                    onClick={() =>
                      handleUpdateSettings({
                        cursor_style: cursor.value as AppData["settings"]["cursor_style"],
                      })
                    }
                  >
                    <div className="flex h-20 w-20 items-center justify-center">
                      <img
                        src={cursor.previewImage}
                        alt={cursor.label}
                        className="h-16 w-16 object-contain"
                        draggable={false}
                      />
                    </div>

                    <p className="mt-3 text-sm font-medium text-gray-800">
                      {cursor.label}
                    </p>
                  </button>
                ))}
              </div>

              <p className="mt-2 text-sm text-gray-500">
                The custom cursor applies to the app after refresh.
              </p>
            </div>
          </div>
        </section>

        <section className={cardClass} data-tutorial="settings-colors">
          <h2 className={sectionTitleClass}>App Colour Theme</h2>
          <p className={`mt-2 text-sm ${mutedTextClass}`}>
            Build your own colour palette for the app interface.
          </p>

          <AppColorThemeSettings
            colors={{
              app_background_color: data.settings.app_background_color,
              app_surface_color: data.settings.app_surface_color,
              app_accent_color: data.settings.app_accent_color,
              app_text_color: data.settings.app_text_color,
            }}
            savedTemplate={data.settings.saved_app_color_template}
            onChange={(colors) =>
              handleUpdateSettings({
                app_theme: "custom",
                ...colors,
              })
            }
            onApplyTheme={handleApplyAppTheme}
            onSave={(name) =>
              handleUpdateSettings({
                saved_app_color_template: {
                  name,
                  colors: {
                    app_background_color:
                      data.settings.app_background_color,
                    app_surface_color: data.settings.app_surface_color,
                    app_accent_color: data.settings.app_accent_color,
                    app_text_color: data.settings.app_text_color,
                  },
                },
              })
            }
            onDelete={() =>
              handleUpdateSettings({ saved_app_color_template: null })
            }
          />
        </section>

        <section
          className="rounded-xl border bg-white p-6 shadow-sm"
          data-tutorial="settings-note-defaults"
        >
          <h2 className="text-xl font-semibold text-gray-900">
            Note Defaults
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Default font family
              <select
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
                value={data.settings.default_font_family}
                onChange={(event) =>
                  handleUpdateSettings({
                    default_font_family: event.target.value,
                  })
                }
              >
                <option value="Arial">Arial</option>
                <option value="Georgia">Georgia</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Comic Sans MS">Comic Sans</option>
              </select>
            </label>

            <label className="text-sm font-medium text-gray-700">
              Default font size
              <select
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
                value={data.settings.default_font_size}
                onChange={(event) =>
                  handleUpdateSettings({
                    default_font_size: Number(event.target.value),
                  })
                }
              >
                <option value={12}>12</option>
                <option value={14}>14</option>
                <option value={16}>16</option>
                <option value={18}>18</option>
                <option value={20}>20</option>
                <option value={24}>24</option>
              </select>
            </label>

            <label className="text-sm font-medium text-gray-700">
              Default pencil thickness
              <select
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
                value={data.settings.default_pencil_thickness}
                onChange={(event) =>
                  handleUpdateSettings({
                    default_pencil_thickness: Number(event.target.value),
                  })
                }
              >
                {[2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 28, 32].map(
                  (size) => (
                    <option key={size} value={size}>
                      {size}px
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="text-sm font-medium text-gray-700">
              Default eraser thickness
              <select
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
                value={data.settings.default_eraser_thickness}
                onChange={(event) =>
                  handleUpdateSettings({
                    default_eraser_thickness: Number(event.target.value),
                  })
                }
              >
                {[4, 6, 8, 10, 12, 16, 18, 20, 24, 28, 32, 40, 48].map(
                  (size) => (
                    <option key={size} value={size}>
                      {size}px
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="text-sm font-medium text-gray-700">
              Default highlighter thickness
              <select
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
                value={data.settings.default_highlighter_thickness}
                onChange={(event) =>
                  handleUpdateSettings({
                    default_highlighter_thickness: Number(event.target.value),
                  })
                }
              >
                {[4, 6, 8, 10, 12, 16, 18, 20, 24, 28, 32, 40, 48].map(
                  (size) => (
                    <option key={size} value={size}>
                      {size}px
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="text-sm font-medium text-gray-700">
              Default note template
              <select
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
                value={data.settings.default_note_template}
                onChange={(event) =>
                  handleUpdateSettings({
                    default_note_template: event.target.value as NoteTemplate,
                  })
                }
              >
                <option value="plain">Plain</option>
                <option value="lined">Lined</option>
                <option value="grid">Grid</option>
                <option value="dots">Dots</option>
              </select>
            </label>
          </div>
        </section>

        <section
          className="rounded-xl border bg-white p-6 shadow-sm"
          data-tutorial="settings-tutorial"
        >
          <h2 className="text-xl font-semibold text-gray-900">
            Tutorial
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            Replay this screen&apos;s guide or restart every tutorial from the beginning.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-black px-4 py-2 text-sm text-white"
              onClick={() => window.dispatchEvent(new Event(REPLAY_TUTORIAL_EVENT))}
            >
              Replay This Tutorial
            </button>
            <button
              type="button"
              className="rounded-lg border px-4 py-2 text-sm text-gray-700"
              onClick={() => window.dispatchEvent(new Event(RESTART_TUTORIALS_EVENT))}
            >
              Restart All Tutorials
            </button>
          </div>
        </section>

        <section className={cardClass} data-tutorial="settings-feedback">
          <h2 className={sectionTitleClass}>Feedback Form</h2>

          <p className={`mt-2 text-sm ${mutedTextClass}`}>
            Tell us how do you feel using Just Plan.
          </p>

          <form className="mt-4 space-y-4" onSubmit={handleSubmitFeedback}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className={isDark ? "text-sm font-medium text-slate-200" : "text-sm font-medium text-gray-700"}>
                Feedback type
                <select
                  className={isDark ? "mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none" : "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"}
                  value={feedbackCategory}
                  onChange={(event) => setFeedbackCategory(event.target.value)}
                >
                  <option value="general">General feedback</option>
                  <option value="bug">Bug report</option>
                  <option value="feature">Feature idea</option>
                  <option value="design">Design / UI feedback</option>
                </select>
              </label>

              <label className={isDark ? "text-sm font-medium text-slate-200" : "text-sm font-medium text-gray-700"}>
                Rating
                <select
                  className={isDark ? "mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none" : "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"}
                  value={feedbackRating}
                  onChange={(event) => setFeedbackRating(event.target.value)}
                >
                  <option value="5">5 - Love it</option>
                  <option value="4">4 - Good</option>
                  <option value="3">3 - Okay</option>
                  <option value="2">2 - Needs work</option>
                  <option value="1">1 - Frustrating</option>
                </select>
              </label>
            </div>

            <label className={isDark ? "block text-sm font-medium text-slate-200" : "block text-sm font-medium text-gray-700"}>
              Your feedback
              <textarea
                className={isDark ? "mt-1 min-h-32 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500" : "mt-1 min-h-32 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-400"}
                value={feedbackMessage}
                maxLength={2000}
                placeholder="Type here..."
                onChange={(event) => {
                  setFeedbackMessage(event.target.value);
                  if (feedbackStatus !== "sending") {
                    setFeedbackStatus("idle");
                    setFeedbackError("");
                  }
                }}
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={feedbackStatus === "sending"}
                className={
                  feedbackStatus === "sending"
                    ? "rounded-lg bg-gray-400 px-4 py-2 text-sm text-white"
                    : "rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
                }
              >
                {feedbackStatus === "sending" ? "Sending..." : "Send Feedback"}
              </button>

              {feedbackStatus === "sent" && (
                <p className="text-sm text-green-600">
                  Thanks — your feedback was sent.
                </p>
              )}

              {feedbackStatus === "error" && (
                <p className="text-sm text-red-600">{feedbackError}</p>
              )}
            </div>
          </form>
        </section>

        <section
          className={cardClass}
          data-tutorial="settings-recently-deleted"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className={sectionTitleClass}>Recently Deleted</h2>
              <p className={`mt-2 text-sm ${mutedTextClass}`}>
                Notes deleted will stay here for 30 days. After 30 days, the file
                will be permanently deleted.
              </p>
            </div>

            {data.recently_deleted.notes.length > 0 && (
              <button
                type="button"
                className="rounded-lg bg-black px-4 py-2 text-sm text-white"
                onClick={() =>
                  setShowRecentlyDeletedNotes((current) => !current)
                }
              >
                {showRecentlyDeletedNotes ? "Hide" : "View"}
              </button>
            )}
          </div>

          {data.recently_deleted.notes.length === 0 ? (
            <p className={`mt-4 text-sm ${mutedTextClass}`}>
              No recently deleted notes.
            </p>
          ) : (
            showRecentlyDeletedNotes && (
              <div className="mt-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className={isDark ? "flex items-center gap-2 text-sm text-slate-200" : "flex items-center gap-2 text-sm text-gray-700"}>
                    <input
                      type="checkbox"
                      checked={
                        selectedDeletedNoteIds.length ===
                        data.recently_deleted.notes.length
                      }
                      onChange={toggleSelectAllDeletedNotes}
                    />
                    Select all
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={selectedDeletedNoteIds.length === 0}
                      className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={handleRecoverDeletedNotes}
                    >
                      Recover
                    </button>
                    <button
                      type="button"
                      disabled={selectedDeletedNoteIds.length === 0}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => void handlePermanentlyDeleteNotes()}
                    >
                      Permanently Delete
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {data.recently_deleted.notes.map((note) => (
                    <label
                      key={note.id}
                      className={
                        selectedDeletedNoteIds.includes(note.id)
                          ? isDark
                            ? "flex cursor-pointer gap-3 rounded-xl border-2 border-blue-500 bg-slate-800 p-4"
                            : "flex cursor-pointer gap-3 rounded-xl border-2 border-blue-500 bg-blue-50 p-4"
                          : isDark
                            ? "flex cursor-pointer gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4"
                            : "flex cursor-pointer gap-3 rounded-xl border bg-gray-50 p-4"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={selectedDeletedNoteIds.includes(note.id)}
                        onChange={() => toggleDeletedNoteSelection(note.id)}
                      />
                      <div className="min-w-0">
                        <p className={isDark ? "truncate font-semibold text-slate-100" : "truncate font-semibold text-gray-900"}>
                          {note.title}
                        </p>
                        <p className={`mt-1 text-xs ${mutedTextClass}`}>
                          {getDeletedNoteDescription(note)}
                        </p>
                        <p className={`mt-1 text-xs ${mutedTextClass}`}>
                          {(note.materials?.length ?? 0) > 0
                            ? "Imported material"
                            : "Normal note"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )
          )}
        </section>

        <section
          className="rounded-xl border bg-white p-6 shadow-sm"
          data-tutorial="settings-backup"
        >
          <h2 className="text-xl font-semibold text-gray-900">
            Backup & Restore
          </h2>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={handleExportBackup}
              data-tutorial="settings-export-backup"
            >
              Export Backup
            </button>

            <label
              className="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              data-tutorial="settings-import-backup"
            >
              Import Backup
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];

                  if (!file) return;

                  await handleImportBackup(file);

                  event.target.value = "";
                }}
              />
            </label>

            <button
              type="button"
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              onClick={handleResetData}
              data-tutorial="settings-reset-data"
            >
              Reset All Data
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
            <p className="font-medium text-gray-800">Moving to a new device?</p>
            <p className="mt-1">
              Export your backup from the old device, then import the backup file on
              the new device.
            </p>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
