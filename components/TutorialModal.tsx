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

    function updateAnchor() {
      const rect = tutorialTarget.getBoundingClientRect();

      const isVisible =
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;

      if (!isVisible) {
        setAnchor((current) =>
          current?.target === selector ? null : current
        );
        tutorialTarget.classList.remove("tutorial-active-target");
        return;
      }

      const gap = 16;
      const margin = 16;
      const panelWidth = panelRef.current?.offsetWidth ?? 340;
      const panelHeight = panelRef.current?.offsetHeight ?? 260;

      let left = rect.right + gap;
      let top = rect.top;

      // Move panel to the left if there is no room on the right.
      if (left + panelWidth > window.innerWidth - margin) {
        left = rect.left - panelWidth - gap;
      }

      // Place it below if neither side has enough room.
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

    const frame = window.requestAnimationFrame(updateAnchor);

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
  const isTargetVisible =
    !step.target || anchor?.target === step.target;

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

  // Show this prompt while the next feature is outside the viewport.
  if (!isTargetVisible) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[9998] flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-sky-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-lg">
          <span>Scroll to {step.title}</span>

          <button
            type="button"
            className="font-semibold text-sky-600"
            onClick={handleSkip}
          >
            End tutorial
          </button>
        </div>
      </div>
    );
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
          ? "fixed z-[9998] w-[min(340px,calc(100vw-2rem))]"
          : "fixed left-1/2 top-20 z-[9998] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2"
      }
    >
      <div
        role="dialog"
        aria-labelledby={titleId}
        className="w-full rounded-2xl border border-sky-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-3xl">
              {step.emoji ?? "✨"}
            </div>

            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-sky-500">
              Step {currentStep + 1} of {steps.length}
            </p>

            <h2
              id={titleId}
              className="mt-2 text-xl font-bold text-gray-950"
            >
              {step.title}
            </h2>
          </div>

          <button
            type="button"
            className="rounded-full px-3 py-1 text-sm text-gray-500 hover:bg-gray-100"
            onClick={handleSkip}
          >
            Skip
          </button>
        </div>

        <p className="mt-3 leading-6 text-gray-600">
          {step.description}
        </p>

        <div className="mt-6 h-2 rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full bg-sky-400 transition-all"
            style={{
              width: `${((currentStep + 1) / steps.length) * 100}%`,
            }}
          />
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            disabled={isFirstStep}
            className="rounded-xl border px-4 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleBack}
          >
            Back
          </button>

          <button
            type="button"
            className="rounded-xl bg-sky-500 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-600"
            onClick={handleNext}
          >
            {isLastStep ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
