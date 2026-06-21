"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { TutorialModal } from "@/components/TutorialModal";
import {
  getTutorialForPathname,
  type TutorialSection,
} from "@/lib/tutorial-steps";

const PROGRESS_KEY = "just-study-tutorial-progress";

export const REPLAY_TUTORIAL_EVENT = "just-study:replay-tutorial";
export const RESTART_TUTORIALS_EVENT = "just-study:restart-tutorials";

function readCompletedSections(): TutorialSection[] {
  try {
    const stored = window.localStorage.getItem(PROGRESS_KEY);
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as TutorialSection[]) : [];
  } catch {
    return [];
  }
}

function rememberSection(section: TutorialSection) {
  const completed = new Set(readCompletedSections());
  completed.add(section);
  window.localStorage.setItem(PROGRESS_KEY, JSON.stringify([...completed]));
}

export function TutorialController() {
  const pathname = usePathname();
  const tutorial = getTutorialForPathname(pathname);
  const [isOpen, setIsOpen] = useState(false);
  const section = tutorial?.section;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!section) {
        setIsOpen(false);
        return;
      }

      setIsOpen(!readCompletedSections().includes(section));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [section]);

  useEffect(() => {
    function replayTutorial() {
      if (section) setIsOpen(true);
    }

    function restartTutorials() {
      window.localStorage.removeItem(PROGRESS_KEY);
      if (section) setIsOpen(true);
    }

    window.addEventListener(REPLAY_TUTORIAL_EVENT, replayTutorial);
    window.addEventListener(RESTART_TUTORIALS_EVENT, restartTutorials);

    return () => {
      window.removeEventListener(REPLAY_TUTORIAL_EVENT, replayTutorial);
      window.removeEventListener(RESTART_TUTORIALS_EVENT, restartTutorials);
    };
  }, [section]);

  const closeTutorial = useCallback(() => {
    if (section) rememberSection(section);
    setIsOpen(false);
  }, [section]);

  if (!tutorial) return null;

  return (
    <>
      <button
        type="button"
        aria-label={`Open ${tutorial.label}`}
        title={tutorial.label}
        className="fixed bottom-5 right-5 z-[9997] flex h-11 w-11 items-center justify-center rounded-full border border-pink-200 bg-white text-lg font-bold text-sky-600 shadow-lg transition hover:-translate-y-0.5 hover:bg-sky-50"
        onClick={() => setIsOpen(true)}
      >
        ?
      </button>

      <TutorialModal
        key={tutorial.section}
        steps={tutorial.steps}
        isOpen={isOpen}
        onClose={closeTutorial}
        onFinish={closeTutorial}
      />
    </>
  );
}
