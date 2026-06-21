"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import type { AppData, NoteTemplate } from "@/lib/types";
import { defaultData } from "@/lib/default-data";
import {
  clearData,
  exportDataFile,
  importDataFile,
  loadData,
  saveData,
} from "@/lib/storage";
import { updateSettings } from "@/lib/study-actions";
import { applyCursorStyle } from "@/lib/apply-cursor";
import { AppColorThemeSettings } from "@/components/AppColorThemeSettings";
import {
  REPLAY_TUTORIAL_EVENT,
  RESTART_TUTORIALS_EVENT,
} from "@/components/TutorialController";


export default function SettingsPage() {
  const [data, setData] = useState<AppData>(defaultData);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const loadedData = loadData();
      setData(loadedData);
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

  function handleExportBackup() {
    exportDataFile(data);
  }

  async function handleImportBackup(file: File) {
    const confirmed = window.confirm(
      "Importing this backup will replace your current Just Study data. Continue?"
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
      previewText: "↖",
    },
    {
      value: "y2k-arrow",
      label: "Y2K Arrow",
      previewImage: "/cursors/y2k.png",
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
            <p className="text-sm font-medium text-gray-700">Default Theme</p>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={
                  data.settings.theme === "light"
                    ? "rounded-lg bg-black px-4 py-2 text-sm text-white"
                    : "rounded-lg border px-4 py-2 text-sm text-gray-700"
                }
                onClick={() =>
                  handleUpdateSettings({
                    theme: "light",
                    app_background_color: "#f9fafb",
                    app_surface_color: "#ffffff",
                    app_accent_color: "#111827",
                    app_text_color: "#111827",
                  })
                }
              >
                Light
              </button>

              <button
                type="button"
                className={
                  data.settings.theme === "dark"
                    ? "rounded-lg bg-black px-4 py-2 text-sm text-white"
                    : "rounded-lg border px-4 py-2 text-sm text-gray-700"
                }
                onClick={() =>
                  handleUpdateSettings({
                    theme: "dark",
                    app_background_color: "#0f172a",
                    app_surface_color: "#172033",
                    app_accent_color: "#a78bfa",
                    app_text_color: "#f8fafc",
                  })
                }
              >
                Dark
              </button>
            </div>

            <p className="mt-2 text-sm text-gray-500">
              Dark mode UI will be applied later. For now, this saves the preference.
            </p>

            <div className="mt-6">
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
                      {"previewImage" in cursor ? (
                        <img
                          src={cursor.previewImage}
                          alt={cursor.label}
                          className="h-16 w-16 object-contain"
                          draggable={false}
                        />
                      ) : (
                        <span className="text-5xl leading-none">{cursor.previewText}</span>
                      )}
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

        <section className={cardClass}>
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
            onChange={handleUpdateSettings}
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

        <section className="rounded-xl border bg-white p-6 shadow-sm">
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

        <section className="rounded-xl border bg-white p-6 shadow-sm">
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

        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Backup & Restore
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            Export a backup file to keep your study data safe or move it to another
            device. Importing a backup will replace the current data on this device.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={handleExportBackup}
            >
              Export Backup
            </button>

            <label className="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
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
            >
              Reset All Data
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
            <p className="font-medium text-gray-800">Moving to a new laptop?</p>
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
