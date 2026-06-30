"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { TutorialStep } from "@/lib/tutorial-steps";

type TutorialModalProps = {
  steps: TutorialStep[];
  isOpen: boolean;
  onClose: () => void;
  onFinish?: () => void;
};

export function TutorialModal({
  steps,
  isOpen,
  onClose,
  onFinish,
}: TutorialModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [anchor, setAnchor] = useState<{
    target: string;
    top: number;
    left: number;
  } | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const step = steps[currentStep] ?? steps[0];

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCurrentStep(0);
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !step?.target) return;

    const selector = step.target;
    const target = document.querySelector<HTMLElement>(selector);

    if (!target) return;
    const tutorialTarget = target;

    function isTargetInView() {
      const rect = tutorialTarget.getBoundingClientRect();

      return (
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth
      );
    }

    function scrollTargetIntoView() {
      tutorialTarget.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }

    function updateAnchor() {
      const rect = tutorialTarget.getBoundingClientRect();

      if (!isTargetInView()) {
        tutorialTarget.classList.remove("tutorial-active-target");
        scrollTargetIntoView();
        return;
      }

      const gap = 10;
      const margin = 12;
      const panelWidth = panelRef.current?.offsetWidth ?? 300;
      const panelHeight = panelRef.current?.offsetHeight ?? 210;
      const isWideTarget = rect.width >= panelWidth + gap * 4;

      let left = rect.right + gap;
      let top = rect.top + Math.min(20, rect.height / 3);

      if (isWideTarget) {
        left = Math.min(
          rect.right - panelWidth - gap,
          window.innerWidth - panelWidth - margin
        );
        top = rect.top + Math.min(64, Math.max(18, rect.height / 3));
      } else if (left + panelWidth > window.innerWidth - margin) {
        left = rect.left - panelWidth - gap;
      }

      if (left < margin) {
        left = Math.min(
          Math.max(margin, rect.left),
          window.innerWidth - panelWidth - margin
        );
        top = rect.bottom + gap;
      }

      top = Math.min(
        Math.max(margin, top),
        window.innerHeight - panelHeight - margin
      );

      tutorialTarget.classList.add("tutorial-active-target");

      setAnchor({
        target: selector,
        top,
        left,
      });
    }

    const frame = window.requestAnimationFrame(() => {
      setAnchor(null);

      if (!isTargetInView()) {
        scrollTargetIntoView();
      }

      updateAnchor();
    });

    const observer = new IntersectionObserver(updateAnchor, {
      threshold: 0.15,
    });

    observer.observe(tutorialTarget);
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
      tutorialTarget.classList.remove("tutorial-active-target");
    };
  }, [isOpen, step?.target]);

  if (!isOpen || !step) {
    return null;
  }

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;
  const isTargetVisible = !step.target || anchor?.target === step.target;

  function handleNext() {
    if (isLastStep) {
      setCurrentStep(0);
      onFinish?.();
      onClose();
      return;
    }

    setCurrentStep((current) => current + 1);
  }

  function handleBack() {
    if (!isFirstStep) {
      setCurrentStep((current) => current - 1);
    }
  }

  function handleSkip() {
    setCurrentStep(0);
    onClose();
  }

  if (!isTargetVisible) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      style={
        step.target && anchor
          ? {
              top: anchor.top,
              left: anchor.left,
            }
          : undefined
      }
      className={
        step.target
          ? "fixed z-[9998] w-[min(300px,calc(100vw-1.5rem))]"
          : "fixed left-1/2 top-20 z-[9998] w-[min(340px,calc(100vw-1.5rem))] -translate-x-1/2"
      }
    >
      <div
        role="dialog"
        aria-labelledby={titleId}
        className="w-full rounded-xl border border-slate-200/80 bg-white/50 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Step {currentStep + 1} of {steps.length}
            </p>

            <h2
              id={titleId}
              className="mt-1 text-base font-semibold text-slate-950"
            >
              {step.title}
            </h2>
          </div>

          <button
            type="button"
            className="rounded-full px-2 py-1 text-xs text-slate-500 hover:bg-white/60"
            onClick={handleSkip}
          >
            Skip
          </button>
        </div>

        <p className="mt-2 text-sm leading-5 text-slate-700">
          {step.description}
        </p>

        <div className="mt-4 h-1 rounded-full bg-white/70">
          <div
            className="h-1 rounded-full bg-slate-500 transition-all"
            style={{
              width: `${((currentStep + 1) / steps.length) * 100}%`,
            }}
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            disabled={isFirstStep}
            className="rounded-lg border border-slate-200/80 bg-white/40 px-3 py-1.5 text-xs text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleBack}
          >
            Back
          </button>

          <button
            type="button"
            className="rounded-lg bg-slate-900/90 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            onClick={handleNext}
          >
            {isLastStep ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
