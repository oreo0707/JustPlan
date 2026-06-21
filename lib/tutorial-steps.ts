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
    emoji: "😊",
    title: "Welcome to Just Note!",
    description: "Thank you for trying out Just Note. Let's give you a tour to familiarize yourself with the environment.",
  },
  {
    emoji: "🏠",
    title: "Welcome to your Home Dashboard",
    description:
      "This is your main study overview. You can quickly see your schedule, today’s tasks, and deadlines that are coming soon.",
    target: '[data-tutorial="home-overview"]',
  },
  {
    emoji: "📅",
    title: "Schedule Panel",
    description:
      "The schedule shows tasks planned for each day. Tasks can be planned for one specific day or across a range of days.",
    target: '[data-tutorial="home-schedule"]',
  },
  {
    emoji: "✅",
    title: "Today’s Tasks",
    description:
      "This panel shows what you should work on today, including tasks planned specifically for today and ongoing tasks from a date range.",
    target: '[data-tutorial="home-tasks"]',
  },
  {
    emoji: "⏰",
    title: "Due Soon",
    description:
      "This panel focuses on deadlines. It helps you notice tasks that are urgent or need attention soon.",
    target: '[data-tutorial="home-due-soon"]',
  },
];

export const subjectsTutorialSteps: TutorialStep[] = [
  {
    emoji: "📚",
    title: "Subjects",
    description:
      "Subjects help you organise your study materials. You can create subjects such as Math, Cybersecurity, English, or any module you are taking.",
  },
  {
    emoji: "➕",
    title: "Add a Subject",
    description:
      "Use the add subject button to create a new study area. Each subject can have its own tasks and notes.",
  },
  {
    emoji: "🗂️",
    title: "Subject Cards",
    description:
      "Click a subject card to open it. You will be able to manage tasks and notes inside that subject.",
  },
];

export const subjectDetailTutorialSteps: TutorialStep[] = [
  {
    emoji: "📝",
    title: "Subject Workspace",
    description:
      "This screen lets you manage everything inside one subject, including tasks and notes.",
  },
  {
    emoji: "✅",
    title: "Tasks",
    description:
      "You can add tasks, set a planned date or date range, add a due date, and mark tasks as completed when done.",
  },
  {
    emoji: "📌",
    title: "Planned Date vs Due Date",
    description:
      "Planned date means when you want to work on the task. Due date means the actual deadline.",
  },
  {
    emoji: "📖",
    title: "Notes",
    description:
      "Create notes for this subject. Each note can use templates, rich text, stickers, shapes, and text boxes.",
  },
];

export const noteEditorTutorialSteps: TutorialStep[] = [
  {
    emoji: "✍️",
    title: "Note Editor",
    description:
      "This is where you write and design your notes. You can type normally or add movable objects like stickers and text boxes.",
  },
  {
    emoji: "🎨",
    title: "Text Tools",
    description:
      "Use the toolbar to change font, size, colour, highlight text, underline, bold, or insert images.",
  },
  {
    emoji: "📄",
    title: "Note Templates",
    description:
      "Choose between plain, lined, grid, or dotted paper templates to match your note-taking style.",
  },
  {
    emoji: "🌟",
    title: "Stickers and Shapes",
    description:
      "Add stickers, shapes, and lines to decorate or organise your notes. You can drag, resize, flip, and recolour them.",
  },
  {
    emoji: "🔤",
    title: "Movable Text Boxes",
    description:
      "Text boxes are useful for labels, headers, mind map words, or decorative notes that you want to move freely.",
  },
];

export const statsTutorialSteps: TutorialStep[] = [
  {
    emoji: "📊",
    title: "Statistics",
    description:
      "The statistics screen helps you understand your study workload, progress, and upcoming deadlines.",
  },
  {
    emoji: "📚",
    title: "Study Load by Subject",
    description:
      "This shows how many tasks are planned for each subject during the selected week or month.",
  },
  {
    emoji: "⏳",
    title: "Planned Task Progress",
    description:
      "This compares completed and pending tasks based on your planned study schedule.",
  },
  {
    emoji: "⏰",
    title: "Deadline Urgency",
    description:
      "This shows overdue tasks, tasks due today, and upcoming deadlines so you can prioritise better.",
  },
  {
    emoji: "🤖",
    title: "AI Study Coach",
    description:
      "The AI Study Coach gives suggestions based on the statistic feature you are currently viewing.",
  },
];

export const settingsTutorialSteps: TutorialStep[] = [
  {
    emoji: "⚙️",
    title: "Settings",
    description:
      "Settings allow you to customise the app based on your study style and visual preferences.",
  },
  {
    emoji: "🎨",
    title: "Appearance",
    description:
      "You can change the app theme and choose cute custom cursors such as hearts, stars, or Y2K arrows.",
  },
  {
    emoji: "📝",
    title: "Note Defaults",
    description:
      "Choose your default font, font size, and note template so new notes start with your preferred style.",
  },
  {
    emoji: "🔁",
    title: "Replay Tutorial",
    description:
      "You can replay the tutorial anytime if you want to learn the app features again.",
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
