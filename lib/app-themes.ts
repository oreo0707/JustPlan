import type { AppData } from "./types";

export type AppThemeId = AppData["settings"]["app_theme"];

export type AppThemeColors = Pick<
  AppData["settings"],
  | "app_background_color"
  | "app_surface_color"
  | "app_accent_color"
  | "app_text_color"
>;

export type AppThemeOption = {
  id: Exclude<AppThemeId, "custom">;
  label: string;
  noteTheme: AppData["settings"]["theme"];
  colors: AppThemeColors;
};

export const appThemeOptions: AppThemeOption[] = [
  {
    id: "light",
    label: "Light",
    noteTheme: "light",
    colors: {
      app_background_color: "#f9fafb",
      app_surface_color: "#ffffff",
      app_accent_color: "#111827",
      app_text_color: "#111827",
    },
  },
  {
    id: "dark",
    label: "Dark",
    noteTheme: "dark",
    colors: {
      app_background_color: "#0f172a",
      app_surface_color: "#111827",
      app_accent_color: "#93c5fd",
      app_text_color: "#f8fafc",
    },
  },
  {
    id: "milky-mocca",
    label: "Milky Mocca",
    noteTheme: "light",
    colors: {
      app_background_color: "#fefeec",
      app_surface_color: "#d7ecef",
      app_accent_color: "#d7b7be",
      app_text_color: "#806042",
    },
  },
  {
    id: "winter-tune",
    label: "Winter Tune",
    noteTheme: "light",
    colors: {
      app_background_color: "#efe6e6",
      app_surface_color: "#d4e8f7",
      app_accent_color: "#b8a8a9",
      app_text_color: "#b2909d",
    },
  },
  {
    id: "cloudy-pink",
    label: "Cloudy Pink",
    noteTheme: "light",
    colors: {
      app_background_color: "#fff5ea",
      app_surface_color: "#fefefb",
      app_accent_color: "#dad2d6",
      app_text_color: "#b58c8c",
    },
  },
  {
    id: "light-taro",
    label: "Light Taro",
    noteTheme: "light",
    colors: {
      app_background_color: "#c6c8e6",
      app_surface_color: "#fef6e1",
      app_accent_color: "#8c6e63",
      app_text_color: "#b08e6d",
    },
  },
  {
    id: "midnight-haze",
    label: "Midnight Haze",
    noteTheme: "light",
    colors: {
      app_background_color: "#02122f",
      app_surface_color: "#23354d",
      app_accent_color: "#8ba3c5",
      app_text_color: "#e5edf7",
    },
  },
];

export function getAppThemeOption(themeId: AppThemeId) {
  return appThemeOptions.find((theme) => theme.id === themeId);
}
