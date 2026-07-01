"use client";

import type { AppData } from "@/lib/types";
import { appThemeOptions, type AppThemeId } from "@/lib/app-themes";

type AppColors = Pick<
  AppData["settings"],
  | "app_background_color"
  | "app_surface_color"
  | "app_accent_color"
  | "app_text_color"
>;

type AppColorThemeSettingsProps = {
  colors: AppColors;
  savedTemplate: AppData["settings"]["saved_app_color_template"];
  onChange: (colors: Partial<AppColors>) => void;
  onApplyTheme: (themeId: AppThemeId) => void;
  onSave: (name: string) => void;
  onDelete: () => void;
};

const colorFields: Array<{
  key: keyof AppColors;
  label: string;
  description: string;
}> = [
  {
    key: "app_background_color",
    label: "Page background",
    description: "The colour behind your content.",
  },
  {
    key: "app_surface_color",
    label: "Cards and sidebar",
    description: "The colour used for raised surfaces.",
  },
  {
    key: "app_accent_color",
    label: "Accent",
    description: "Buttons, links, and selected controls.",
  },
  {
    key: "app_text_color",
    label: "Text",
    description: "The main readable text colour.",
  },
];

export function AppColorThemeSettings({
  colors,
  savedTemplate,
  onChange,
  onApplyTheme,
  onSave,
  onDelete,
}: AppColorThemeSettingsProps) {
  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        {appThemeOptions.slice(2).map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-sm"
            onClick={() => onApplyTheme(preset.id)}
          >
            <span
              className="mr-2 inline-block h-3 w-3 rounded-full align-[-1px]"
              style={{ backgroundColor: preset.colors.app_accent_color }}
            />
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="grid gap-3 sm:grid-cols-2">
          {colorFields.map((field) => (
            <label
              key={field.key}
              className="rounded-xl border bg-white p-3 text-sm"
            >
              <span className="font-semibold text-gray-800">{field.label}</span>
              <span className="mt-1 block text-xs text-gray-500">
                {field.description}
              </span>
              <span className="mt-3 flex items-center gap-3">
                <input
                  type="color"
                  value={colors[field.key]}
                  onChange={(event) =>
                    onChange({ [field.key]: event.target.value })
                  }
                  className="h-10 w-12 cursor-pointer rounded-lg border bg-transparent p-1"
                  aria-label={field.label}
                />
                <span className="font-mono text-xs uppercase text-gray-500">
                  {colors[field.key]}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div
          className="overflow-hidden rounded-2xl border shadow-sm"
          style={{
            backgroundColor: colors.app_background_color,
            color: colors.app_text_color,
          }}
        >
          <div className="flex min-h-64">
            <div
              className="w-24 border-r p-3"
              style={{ backgroundColor: colors.app_surface_color }}
            >
              <div
                className="h-5 w-12 rounded-full"
                style={{ backgroundColor: colors.app_accent_color }}
              />
              <div className="mt-6 space-y-3 opacity-40">
                <div className="h-2 rounded-full bg-current" />
                <div className="h-2 rounded-full bg-current" />
                <div className="h-2 w-2/3 rounded-full bg-current" />
              </div>
            </div>
            <div className="flex-1 p-4">
              <p className="text-sm font-bold">Your app preview</p>
              <p className="mt-1 text-xs opacity-60">Notes stay unchanged.</p>
              <div
                className="mt-5 rounded-xl p-4 shadow-sm"
                style={{ backgroundColor: colors.app_surface_color }}
              >
                <div className="h-2 w-2/3 rounded-full bg-current opacity-25" />
                <div className="mt-3 h-2 w-1/2 rounded-full bg-current opacity-15" />
                <button
                  type="button"
                  className="mt-5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                  style={{ backgroundColor: colors.app_accent_color }}
                >
                  Primary action
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              Your saved template
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              One custom slot is available. Saving again replaces the previous template.
            </p>
          </div>

          {savedTemplate && (
            <div className="flex items-center gap-1.5">
              {Object.values(savedTemplate.colors).map((color, index) => (
                <span
                  key={`${color}-${index}`}
                  className="h-5 w-5 rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          )}
        </div>

        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const name = String(formData.get("templateName") ?? "").trim();
            onSave(name || "My Colour Template");
          }}
        >
          <input
            key={savedTemplate?.name ?? "new-template"}
            name="templateName"
            type="text"
            defaultValue={savedTemplate?.name ?? ""}
            maxLength={40}
            placeholder="Name your colour template"
            className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:border-violet-400"
          />
          <button
            type="submit"
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            {savedTemplate ? "Overwrite Template" : "Save Template"}
          </button>
        </form>

        {savedTemplate && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-gray-50 p-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {savedTemplate.name}
              </p>
              <p className="text-xs text-gray-500">Saved custom palette</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                onClick={() => onChange(savedTemplate.colors)}
              >
                Apply
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600"
                onClick={onDelete}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
