import type { AppData } from "./types";

export const defaultData: AppData = {
  subjects: [],
  settings: {
    theme: "light",
    app_theme: "light",
    cursor_style: "default",
    default_font_size: 16,
    default_font_family: "Arial",
    default_pencil_thickness: 4,
    default_eraser_thickness: 18,
    default_highlighter_thickness: 18,
    default_note_template: "plain",
    app_background_color: "#f9fafb",
    app_surface_color: "#ffffff",
    app_accent_color: "#111827",
    app_text_color: "#111827",
    saved_app_color_template: null,
    tutorial_shown: false,
    home_schedule_note: "",
  },
  recently_deleted: {
    tasks: [],
    notes: [],
    subjects: [],
  },
};
