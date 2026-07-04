"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadData } from "@/lib/storage";
import { applyCursorStyle } from "@/lib/apply-cursor";
import { CursorTrail } from "@/components/CursorTrail";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const [cursorStyle, setCursorStyle] = useState<
    "default" | "y2k-arrow" | "heart" | "cute-pointer" | "star"
  >("default");
  const [appColors, setAppColors] = useState({
    background: "#f9fafb",
    surface: "#ffffff",
    accent: "#111827",
    text: "#111827",
  });

useEffect(() => {
  function loadAppearance() {
    const data = loadData();
    setCursorStyle(data.settings.cursor_style);
    setAppColors({
      background: data.settings.app_background_color,
      surface: data.settings.app_surface_color,
      accent: data.settings.app_accent_color,
      text: data.settings.app_text_color,
    });
    applyCursorStyle(data.settings.cursor_style);
  }

  loadAppearance();

  window.addEventListener("cursor-style-changed", loadAppearance);
  window.addEventListener("app-colors-changed", loadAppearance);

  return () => {
    window.removeEventListener("cursor-style-changed", loadAppearance);
    window.removeEventListener("app-colors-changed", loadAppearance);
  };
}, []);

  const cursorClass =
    cursorStyle === "default" ? "" : `cursor-${cursorStyle}`;

  useEffect(() => {
    applyCursorStyle(cursorStyle);
  }, [cursorStyle]);

  return (
    <div
      className={`app-color-theme flex h-screen overflow-hidden ${cursorClass}`}
      style={
        {
          "--app-theme-background": appColors.background,
          "--app-theme-surface": appColors.surface,
          "--app-theme-accent": appColors.accent,
          "--app-theme-text": appColors.text,
        } as React.CSSProperties
      }
    >
      <CursorTrail
        enabled={cursorStyle === "heart"}
        imageSrc="/cursors/heart.png"
      />
      <aside
        className="h-screen w-64 shrink-0 border-r p-6"
      >
        <h1 className="text-2xl font-bold">Just Plan</h1>

        <nav className="mt-8 flex flex-col gap-2">
          <Link
            href="/"
            className="app-theme-nav-link rounded-lg px-3 py-2 text-sm"
          >
            Home
          </Link>

          <Link
            href="/subjects"
            className="app-theme-nav-link rounded-lg px-3 py-2 text-sm"
          >
            Subjects
          </Link>

          <Link
            href="/stats"
            className="app-theme-nav-link rounded-lg px-3 py-2 text-sm"
          >
            Stats
          </Link>

          <Link
            href="/settings"
            className="app-theme-nav-link rounded-lg px-3 py-2 text-sm"
          >
            Settings
          </Link>
        </nav>
      </aside>

      <main className="h-screen flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}
