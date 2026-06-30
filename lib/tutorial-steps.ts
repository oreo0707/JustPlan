export type TutorialStep = {
  title: string;
  description: string;
  emoji?: string;
  target?: string;
};

export type TutorialSection =
  | "home"
  | "subjects"
  | "subject-detail"
  | "note-editor"
  | "stats"
  | "settings";

export type TutorialDefinition = {
  section: TutorialSection;
  label: string;
  steps: TutorialStep[];
};

export const homeTutorialSteps: TutorialStep[] = [
  {
    title: "Welcome to Just Note",
    description:
      "Here is a quick tour of the main study tools. Each tip appears near the feature it explains.",
  },
  {
    title: "Home overview",
    description:
      "Home gives you a quick view of your study plan: schedule, today’s work, and nearby deadlines.",
    target: '[data-tutorial="home-overview"]',
  },
  {
    title: "Weekly and monthly schedule",
    description:
      "Tasks appear here when they have planned dates. Switch views to see your workload by week or month.",
    target: '[data-tutorial="home-schedule"]',
  },
  {
    title: "Today’s tasks",
    description:
      "This shows tasks planned for today, including date-range tasks that include the current day.",
    target: '[data-tutorial="home-tasks"]',
  },
  {
    title: "Due soon",
    description:
      "Use this panel to spot tasks with upcoming due dates before they become urgent.",
    target: '[data-tutorial="home-due-soon"]',
  },
];

export const subjectsTutorialSteps: TutorialStep[] = [
  {
    title: "Subjects",
    description:
      "Subjects keep your modules separated, so each one can have its own tasks and notes.",
  },
  {
    title: "Add subjects",
    description: "Create a subject for each class, module, or topic you study.",
    target: '[data-tutorial="subjects-add"]',
  },
  {
    title: "Subject cards",
    description:
      "Open a subject card to manage its tasks and notes in one place.",
    target: '[data-tutorial="subjects-list"]',
  },
];

export const subjectDetailTutorialSteps: TutorialStep[] = [
  {
    title: "Subject workspace",
    description:
      "This page is the workspace for one subject: tasks, deadlines, and notes.",
    target: '[data-tutorial="subject-header"]',
  },
  {
    title: "Add tasks",
    description:
      "Add tasks with a due date and a planned completion date. Planned dates decide where tasks appear in your schedule.",
    target: '[data-tutorial="subject-tasks"]',
  },
  {
    title: "Plan date vs due date",
    description:
      "Planned date is when you want to work. Due date is the real deadline.",
    target: '[data-tutorial="subject-task-dates"]',
  },
  {
    title: "Add notes",
    description:
      "Create notes for typing or free writing. The note editor supports text, drawing, templates, stickers, shapes, and images.",
    target: '[data-tutorial="subject-notes"]',
  },
  {
    title: "Import study materials",
    description:
      "Use the Notes menu to import a PDF or Word document. Each imported file becomes its own note card for viewing.",
    target: '[data-tutorial="subject-import-material"]',
  },
];

export const noteEditorTutorialSteps: TutorialStep[] = [
  {
    title: "Note editor",
    description:
      "This is where you type, write, draw, and arrange note objects freely.",
  },
  {
    title: "Text and drawing tools",
    description:
      "Use the toolbar for typing, drawing, highlighting, erasing, and adding objects.",
  },
  {
    title: "Templates and pages",
    description:
      "Choose plain, lined, grid, or dotted paper and move through note pages from the page panel.",
  },
  {
    title: "Movable objects",
    description:
      "Add stickers, images, text boxes, shapes, and lines. Select them to move, resize, duplicate, or delete.",
  },
];

export const statsTutorialSteps: TutorialStep[] = [
  {
    title: "Statistics",
    description:
      "Stats summarizes your task plan so you can see workload, progress, and deadline pressure.",
  },
  {
    title: "Three study views",
    description:
      "Choose Subject Workload, Planned Task Progress, or Deadline Urgency Breakdown from these tabs.",
    target: '[data-tutorial="stats-tabs"]',
  },
  {
    title: "Current statistic",
    description:
      "Each view focuses on one question: how much work exists, how much is done, or which deadlines need attention.",
    target: '[data-tutorial="stats-panel"]',
  },
  {
    title: "AI study coach",
    description:
      "Generate a suggestion based on the statistic you are viewing, so the advice matches your current progress and deadlines.",
    target: '[data-tutorial="stats-ai"]',
  },
];

export const settingsTutorialSteps: TutorialStep[] = [
  {
    title: "Settings",
    description:
      "Settings lets you personalize how the app looks and how new notes start.",
  },
  {
    title: "Cursors",
    description: "Choose a cursor style that fits the feel you want.",
    target: '[data-tutorial="settings-cursors"]',
  },
  {
    title: "App colors",
    description:
      "Customize the app color palette or save your own color template.",
    target: '[data-tutorial="settings-colors"]',
  },
  {
    title: "Note preferences",
    description:
      "Set your preferred font, font size, pencil, eraser, highlighter thickness, and paper template.",
    target: '[data-tutorial="settings-note-defaults"]',
  },
  {
    title: "Tutorial replay",
    description:
      "Replay this screen’s guide or restart all tutorials whenever you want a refresher.",
    target: '[data-tutorial="settings-tutorial"]',
  },
  {
    title: "Feedback",
    description:
      "Send anonymous feedback when something feels confusing, useful, or worth improving.",
    target: '[data-tutorial="settings-feedback"]',
  },
];

export function getTutorialForPathname(
  pathname: string
): TutorialDefinition | null {
  if (/^\/subjects\/[^/]+\/notes\/[^/]+\/?$/.test(pathname)) {
    return {
      section: "note-editor",
      label: "Note editor tutorial",
      steps: noteEditorTutorialSteps,
    };
  }

  if (/^\/subjects\/[^/]+\/?$/.test(pathname)) {
    return {
      section: "subject-detail",
      label: "Subject workspace tutorial",
      steps: subjectDetailTutorialSteps,
    };
  }

  const tutorials: Record<string, TutorialDefinition> = {
    "/": {
      section: "home",
      label: "Home tutorial",
      steps: homeTutorialSteps,
    },
    "/subjects": {
      section: "subjects",
      label: "Subjects tutorial",
      steps: subjectsTutorialSteps,
    },
    "/stats": {
      section: "stats",
      label: "Statistics tutorial",
      steps: statsTutorialSteps,
    },
    "/settings": {
      section: "settings",
      label: "Settings tutorial",
      steps: settingsTutorialSteps,
    },
  };

  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;

  return tutorials[normalizedPathname] ?? null;
}
