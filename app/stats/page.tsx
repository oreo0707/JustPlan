"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { defaultData } from "@/lib/default-data";
import { getStartOfWeek, addDays, toDateInputValue } from "@/lib/date-utils";
import { loadData } from "@/lib/storage";
import type { AppData, Task } from "@/lib/types";

type StatisticId = "workload" | "progress" | "urgency";
type Period = "weekly" | "monthly";

const statistics: Array<{
  id: StatisticId;
  label: string;
  subtitle: string;
}> = [
  {
    id: "workload",
    label: "Subject Workload",
    subtitle:
      "Shows how many tasks are scheduled for each subject during the selected week or month.",
  },
  {
    id: "progress",
    label: "Planned Task Progress",
    subtitle:
      "Tracks completed and pending tasks based on your scheduled study plan.",
  },
  {
    id: "urgency",
    label: "Deadline Urgency Breakdown",
    subtitle:
      "Highlights overdue tasks and upcoming deadlines that need attention.",
  },
];

function taskFallsWithinPeriod(task: Task, start: string, end: string) {
  if (task.scheduled_date) {
    return task.scheduled_date >= start && task.scheduled_date <= end;
  }

  if (task.scheduled_start_date && task.scheduled_end_date) {
    return task.scheduled_start_date <= end && task.scheduled_end_date >= start;
  }

  return false;
}

function getPeriodBounds(period: Period) {
  const today = new Date();

  if (period === "weekly") {
    const startDate = getStartOfWeek(today);
    const endDate = addDays(startDate, 6);
    return {
      start: toDateInputValue(startDate),
      end: toDateInputValue(endDate),
      label: `${startDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })} – ${endDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`,
    };
  }

  const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return {
    start: toDateInputValue(startDate),
    end: toDateInputValue(endDate),
    label: today.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }),
  };
}

function formatDueDate(dateString: string) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


export default function StatsPage() {
  const [data, setData] = useState<AppData>(defaultData);
  const [activeStatistic, setActiveStatistic] =
    useState<StatisticId>("workload");
  const [period, setPeriod] = useState<Period>("weekly");
  const [aiSummary, setAiSummary] = useState("");
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  useEffect(() => {
    const refreshData = () => {
      setData(loadData());
      setAiSummary("");
    };
    const frame = window.requestAnimationFrame(() => {
      refreshData();
    });

    window.addEventListener("focus", refreshData);
    window.addEventListener("storage", refreshData);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("focus", refreshData);
      window.removeEventListener("storage", refreshData);
    };
  }, []);

  const activeDefinition =
    statistics.find((statistic) => statistic.id === activeStatistic) ??
    statistics[0];
  const periodBounds = getPeriodBounds(period);
  const workload = data.subjects.map((subject) => {
    const tasks = subject.tasks.filter((task) =>
      taskFallsWithinPeriod(task, periodBounds.start, periodBounds.end)
    );
    const completed = tasks.filter((task) => task.completed).length;

    return {
      id: subject.id,
      name: subject.name,
      icon: subject.icon,
      completed,
      pending: tasks.length - completed,
      total: tasks.length,
    };
  });
  const totalTasks = workload.reduce((sum, subject) => sum + subject.total, 0);
  const completedTasks = workload.reduce(
    (sum, subject) => sum + subject.completed,
    0
  );
  const pendingTasks = totalTasks - completedTasks;
  const completionPercentage = totalTasks
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;
  const busiestSubject = workload.reduce<(typeof workload)[number] | null>(
    (current, subject) =>
      !current || subject.total > current.total ? subject : current,
    null
  );
  const rawMaximum = Math.max(1, ...workload.map((subject) => subject.total));
  const tickStep = rawMaximum <= 5 ? 1 : Math.ceil(rawMaximum / 5);
  const chartMaximum = tickStep * 5;
  const ticks = Array.from({ length: 6 }, (_, index) => index * tickStep);
  const today = toDateInputValue(new Date());
  const endOfCurrentWeek = toDateInputValue(
    addDays(getStartOfWeek(new Date()), 6)
  );
  const deadlineTasks = data.subjects
    .flatMap((subject) =>
      subject.tasks
        .filter((task) => !task.completed && task.due_date)
        .map((task) => ({
          ...task,
          subjectName: subject.name,
          subjectIcon: subject.icon,
        }))
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const urgencyBuckets = [
    {
      id: "overdue",
      label: "Overdue",
      description: "Past the deadline",
      tasks: deadlineTasks.filter((task) => task.due_date < today),
      cardClass: "border-red-200 bg-gradient-to-br from-red-50 to-rose-100",
      numberClass: "text-red-700",
      dotClass: "bg-red-500",
    },
    {
      id: "today",
      label: "Due Today",
      description: "Needs attention today",
      tasks: deadlineTasks.filter((task) => task.due_date === today),
      cardClass:
        "border-orange-200 bg-gradient-to-br from-orange-50 to-amber-100",
      numberClass: "text-orange-700",
      dotClass: "bg-orange-500",
    },
    {
      id: "week",
      label: "Due This Week",
      description: "Before the week ends",
      tasks: deadlineTasks.filter(
        (task) => task.due_date > today && task.due_date <= endOfCurrentWeek
      ),
      cardClass:
        "border-yellow-200 bg-gradient-to-br from-yellow-50 to-yellow-100",
      numberClass: "text-yellow-700",
      dotClass: "bg-yellow-500",
    },
    {
      id: "later",
      label: "Due Later",
      description: "Beyond this week",
      tasks: deadlineTasks.filter((task) => task.due_date > endOfCurrentWeek),
      cardClass:
        "border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-100",
      numberClass: "text-emerald-700",
      dotClass: "bg-emerald-500",
    },
  ];
  const urgentTaskCount = urgencyBuckets[0].tasks.length + urgencyBuckets[1].tasks.length;
  const pendingWithoutDeadline = data.subjects.reduce(
    (count, subject) =>
      count +
      subject.tasks.filter((task) => !task.completed && !task.due_date).length,
    0
  );
const visibleWorkload = workload.filter((subject) => subject.total > 0);

const mostPendingSubject = visibleWorkload.reduce<
  (typeof visibleWorkload)[number] | null
>(
  (current, subject) =>
    !current || subject.pending > current.pending ? subject : current,
  null
);

const mostTotalSubject = visibleWorkload.reduce<
  (typeof visibleWorkload)[number] | null
>(
  (current, subject) =>
    !current || subject.total > current.total ? subject : current,
  null
);

const urgentTasks = urgencyBuckets
  .flatMap((bucket) =>
    bucket.tasks.slice(0, 5).map((task) => ({
      urgencyGroup: bucket.label,
      title: task.title,
      subjectName: task.subjectName,
      dueDate: task.due_date,
    }))
  )
  .slice(0, 8);

const factualSummary =
  activeStatistic === "workload"
    ? `
Selected feature: Subject Workload
Selected period: ${periodBounds.label}
Subjects with scheduled tasks:
${visibleWorkload
  .map(
    (subject) =>
      `- ${subject.name}: ${subject.total} total, ${subject.completed} completed, ${subject.pending} pending`
  )
  .join("\n") || "- No scheduled tasks in this period."}

Subject with highest total workload: ${
        mostTotalSubject
          ? `${mostTotalSubject.name} with ${mostTotalSubject.total} task(s)`
          : "None"
      }
Subject with most pending tasks: ${
        mostPendingSubject
          ? `${mostPendingSubject.name} with ${mostPendingSubject.pending} pending task(s)`
          : "None"
      }
`
    : activeStatistic === "progress"
      ? `
Selected feature: Planned Task Progress
Selected period: ${periodBounds.label}
Total planned tasks: ${totalTasks}
Completed tasks: ${completedTasks}
Pending tasks: ${pendingTasks}
Completion percentage: ${completionPercentage}%

Progress by subject:
${visibleWorkload
  .map(
    (subject) =>
      `- ${subject.name}: ${subject.completed} completed, ${subject.pending} pending, ${subject.total} total`
  )
  .join("\n") || "- No scheduled tasks in this period."}
`
      : `
Selected feature: Deadline Urgency
Selected period: Current deadline status
Overdue tasks: ${urgencyBuckets[0].tasks.length}
Due today: ${urgencyBuckets[1].tasks.length}
Due this week: ${urgencyBuckets[2].tasks.length}
Due later: ${urgencyBuckets[3].tasks.length}
Pending tasks without deadline: ${pendingWithoutDeadline}

Urgent task examples:
${urgentTasks
  .map(
    (task) =>
      `- ${task.title} (${task.subjectName}), ${task.urgencyGroup}, due ${task.dueDate}`
  )
  .join("\n") || "- No urgent tasks found."}
`;

const aiRequestPayload = {
  activeStatistic,
  periodLabel:
    activeStatistic === "urgency"
      ? "Current deadline status"
      : periodBounds.label,
  factualSummary,
  allowedSubjectNames: data.subjects.map((subject) => subject.name),
};

const aiRequestKey = JSON.stringify(aiRequestPayload);

  async function handleGenerateSummary() {
    if (isGeneratingSummary) return;

    setIsGeneratingSummary(true);
    setAiSummary("");

    try {
      console.log("AI request payload:", aiRequestPayload);
      
      const response = await fetch("/api/study-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: aiRequestKey,
      });
      const result = (await response.json()) as { summary?: string };

      if (!response.ok || !result.summary) {
        throw new Error(result.summary ?? "Unable to generate summary.");
      }

      setAiSummary(result.summary);
    } catch (error) {
      setAiSummary(
        error instanceof Error
          ? error.message
          : "Unable to generate AI study suggestion right now."
      );
    } finally {
      setIsGeneratingSummary(false);
    }
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-7xl pb-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-600">
              Your study patterns
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">
              Study Statistics
            </h1>
            <p className="mt-2 max-w-2xl text-gray-600">
              Explore one part of your study plan at a time.
            </p>
          </div>

          <div className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700">
            Updated from your current schedule
          </div>
        </div>

        <nav
          data-tutorial="stats-tabs"
          className="mt-8 flex flex-wrap gap-2 border-b border-violet-200 px-2"
          aria-label="Statistics views"
        >
          {statistics.map((statistic, index) => {
            const active = statistic.id === activeStatistic;

            return (
              <button
                key={statistic.id}
                type="button"
                className={`relative min-w-max rounded-t-2xl border px-5 py-3 text-left transition ${
                  active
                    ? "-mb-px border-violet-300 border-b-white bg-white text-violet-700 shadow-[0_-4px_16px_rgba(124,58,237,0.08)]"
                    : "border-transparent bg-violet-100/70 text-gray-600 hover:bg-violet-100 hover:text-violet-700"
                }`}
                onClick={() => {
                  setActiveStatistic(statistic.id);
                  setAiSummary("");
                }}
              >
                <span className="mr-2 text-xs font-bold text-violet-400">
                  0{index + 1}
                </span>
                <span className="text-sm font-semibold">{statistic.label}</span>
              </button>
            );
          })}
        </nav>

        <div
          className="rounded-b-3xl rounded-tr-3xl border border-t-0 border-violet-200 bg-white p-6 shadow-sm md:p-8"
          data-tutorial="stats-panel"
        >
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <h2 className="text-2xl font-bold text-gray-950">
                {activeDefinition.label}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                {activeDefinition.subtitle}
              </p>
            </div>

            {(activeStatistic === "workload" ||
              activeStatistic === "progress") && (
              <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-1">
                {(["weekly", "monthly"] as Period[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition ${
                      period === item
                        ? "bg-white text-violet-700 shadow-sm"
                        : "text-gray-500 hover:text-violet-700"
                    }`}
                    onClick={() => {
                      setPeriod(item);
                      setAiSummary("");
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeStatistic === "workload" ? (
            <div className="mt-8">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Scheduled tasks
                  </p>
                  <p className="mt-2 text-3xl font-bold text-gray-950">
                    {totalTasks}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{periodBounds.label}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Completed
                  </p>
                  <p className="mt-2 text-3xl font-bold text-emerald-700">
                    {completedTasks}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {totalTasks
                      ? `${Math.round((completedTasks / totalTasks) * 100)}% of planned work`
                      : "No scheduled work yet"}
                  </p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Busiest subject
                  </p>
                  <p className="mt-2 truncate text-xl font-bold text-blue-800">
                    {busiestSubject?.total
                      ? `${busiestSubject.icon} ${busiestSubject.name}`.trim()
                      : "None yet"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {busiestSubject?.total
                      ? `${busiestSubject.total} scheduled tasks`
                      : "Add scheduled tasks to see a comparison"}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 p-5 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">Tasks per subject</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Completed and pending tasks scheduled for {periodBounds.label}.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium text-gray-600">
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-sm bg-emerald-400" />
                      Completed
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-sm bg-indigo-500" />
                      Pending
                    </span>
                  </div>
                </div>

                {workload.length === 0 ? (
                  <div className="mt-6 flex min-h-80 items-center justify-center rounded-xl border border-dashed border-violet-200 bg-violet-50/30 px-6 text-center">
                    <div>
                      <p className="text-lg font-semibold text-gray-800">
                        No subjects to compare yet
                      </p>
                      <p className="mt-2 text-sm text-gray-500">
                        Create a subject and schedule tasks to build your workload chart.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-8 pb-2">
                    <div className="relative h-80 w-full">
                      <div className="absolute inset-x-0 top-0 h-64">
                        {ticks.map((tick) => (
                          <div
                            key={tick}
                            className="absolute inset-x-0 border-t border-dashed border-gray-200"
                            style={{ bottom: `${(tick / chartMaximum) * 100}%` }}
                          >
                            <span className="absolute -top-2.5 left-0 bg-white pr-2 text-[11px] text-gray-400">
                              {tick}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="absolute inset-x-10 top-0 flex h-64 items-end justify-around gap-5">
                        {workload.map((subject) => (
                          <div
                            key={subject.id}
                            className="group relative flex h-full min-w-16 flex-1 items-end justify-center"
                            title={`${subject.name}: ${subject.completed} completed, ${subject.pending} pending`}
                          >
                            <div className="relative h-full w-12 overflow-hidden rounded-t-lg bg-gray-100 transition group-hover:ring-4 group-hover:ring-violet-100">
                              <div
                                className="absolute inset-x-0 bottom-0 bg-emerald-400 transition-all"
                                style={{
                                  height: `${(subject.completed / chartMaximum) * 100}%`,
                                }}
                              />
                              <div
                                className="absolute inset-x-0 bg-indigo-500 transition-all"
                                style={{
                                  bottom: `${(subject.completed / chartMaximum) * 100}%`,
                                  height: `${(subject.pending / chartMaximum) * 100}%`,
                                }}
                              />
                            </div>
                            {subject.total > 0 && (
                              <span
                                className="absolute rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-bold text-white"
                                style={{
                                  bottom: `calc(${(subject.total / chartMaximum) * 100}% + 8px)`,
                                }}
                              >
                                {subject.total}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="absolute inset-x-10 top-[264px] flex justify-around gap-5">
                        {workload.map((subject) => (
                          <div
                            key={subject.id}
                            className="min-w-16 flex-1 text-center"
                          >
                            <p className="truncate text-sm font-semibold text-gray-800">
                              {subject.icon && <span className="mr-1">{subject.icon}</span>}
                              {subject.name}
                            </p>
                            <p className="mt-1 text-[11px] text-gray-400">
                              {subject.total} {subject.total === 1 ? "task" : "tasks"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : activeStatistic === "progress" ? (
            <div className="mt-8">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Planned tasks
                  </p>
                  <p className="mt-2 text-3xl font-bold text-gray-950">
                    {totalTasks}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{periodBounds.label}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Completed
                  </p>
                  <p className="mt-2 text-3xl font-bold text-emerald-700">
                    {completedTasks}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Finished scheduled tasks
                  </p>
                </div>
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Pending
                  </p>
                  <p className="mt-2 text-3xl font-bold text-indigo-700">
                    {pendingTasks}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Scheduled tasks remaining
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 p-6 md:p-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      Completed versus pending
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Overall progress for tasks planned during {periodBounds.label}.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-violet-50 px-5 py-3 text-center">
                    <p className="text-3xl font-bold text-violet-700">
                      {completionPercentage}%
                    </p>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-500">
                      Complete
                    </p>
                  </div>
                </div>

                {totalTasks === 0 ? (
                  <div className="mt-8 flex min-h-56 items-center justify-center rounded-xl border border-dashed border-violet-200 bg-violet-50/30 px-6 text-center">
                    <div>
                      <p className="text-lg font-semibold text-gray-800">
                        No planned tasks in this period
                      </p>
                      <p className="mt-2 text-sm text-gray-500">
                        Schedule tasks for this {period === "weekly" ? "week" : "month"} to start tracking progress.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-10 overflow-hidden rounded-2xl bg-gray-100 shadow-inner">
                      <div className="flex h-20 w-full">
                        {completedTasks > 0 && (
                          <div
                            className="flex items-center justify-center bg-gradient-to-r from-emerald-400 to-emerald-500 px-3 text-sm font-bold text-white transition-all"
                            style={{ width: `${completionPercentage}%` }}
                            title={`${completedTasks} completed tasks`}
                          >
                            {completionPercentage >= 16 && `${completionPercentage}%`}
                          </div>
                        )}
                        {pendingTasks > 0 && (
                          <div
                            className="flex flex-1 items-center justify-center bg-gradient-to-r from-indigo-500 to-violet-500 px-3 text-sm font-bold text-white transition-all"
                            title={`${pendingTasks} pending tasks`}
                          >
                            {100 - completionPercentage >= 16 &&
                              `${100 - completionPercentage}%`}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
                        <div className="flex items-center gap-3">
                          <span className="h-4 w-4 rounded-md bg-emerald-400" />
                          <div>
                            <p className="font-semibold text-gray-900">Completed</p>
                            <p className="text-xs text-gray-500">
                              Tasks marked as finished
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-emerald-700">
                            {completionPercentage}%
                          </p>
                          <p className="text-xs text-gray-500">
                            {completedTasks} {completedTasks === 1 ? "task" : "tasks"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5">
                        <div className="flex items-center gap-3">
                          <span className="h-4 w-4 rounded-md bg-indigo-500" />
                          <div>
                            <p className="font-semibold text-gray-900">Pending</p>
                            <p className="text-xs text-gray-500">
                              Planned tasks still remaining
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-indigo-700">
                            {100 - completionPercentage}%
                          </p>
                          <p className="text-xs text-gray-500">
                            {pendingTasks} {pendingTasks === 1 ? "task" : "tasks"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="mt-6 rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3 text-xs leading-5 text-gray-600">
                  Only tasks whose planned dates overlap the selected period are included. Due dates do not affect this progress calculation.
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Pending deadlines
                  </p>
                  <p className="mt-2 text-3xl font-bold text-gray-950">
                    {deadlineTasks.length}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Incomplete tasks with due dates
                  </p>
                </div>
                <div className="rounded-2xl border border-red-100 bg-red-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Needs attention
                  </p>
                  <p className="mt-2 text-3xl font-bold text-red-700">
                    {urgentTaskCount}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Overdue or due today
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    No deadline
                  </p>
                  <p className="mt-2 text-3xl font-bold text-gray-700">
                    {pendingWithoutDeadline}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Pending tasks without due dates
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 p-6 md:p-8">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Deadline urgency
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Hover over or focus a block to see its tasks and exact due dates.
                  </p>
                </div>

                <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {urgencyBuckets.map((bucket, index) => (
                    <div
                      key={bucket.id}
                      className={`group relative rounded-2xl border p-5 outline-none transition hover:z-50 hover:-translate-y-1 hover:shadow-lg focus:z-50 focus:-translate-y-1 focus:ring-4 focus:ring-violet-100 ${bucket.cardClass}`}
                      tabIndex={0}
                      role="button"
                      aria-label={`${bucket.label}: ${bucket.tasks.length} tasks. Focus to view task details.`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={`h-3 w-3 rounded-full ${bucket.dotClass}`} />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                          {bucket.tasks.length === 1 ? "task" : "tasks"}
                        </span>
                      </div>
                      <p className="mt-5 text-sm font-bold text-gray-800">
                        {bucket.label}
                      </p>
                      <p className={`mt-1 text-5xl font-black ${bucket.numberClass}`}>
                        {bucket.tasks.length}
                      </p>
                      <p className="mt-3 text-xs text-gray-600">
                        {bucket.description}
                      </p>

                      <div
                        className={`pointer-events-none invisible absolute top-full z-50 mt-3 w-80 max-w-[calc(100vw-4rem)] rounded-2xl border border-gray-200 bg-white p-4 opacity-0 shadow-2xl transition group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus:pointer-events-auto group-focus:visible group-focus:opacity-100 ${
                          index === 0
                            ? "left-0"
                            : index === urgencyBuckets.length - 1
                              ? "right-0"
                              : "left-1/2 -translate-x-1/2"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                          <p className="font-semibold text-gray-900">
                            {bucket.label}
                          </p>
                          <span className={`h-2.5 w-2.5 rounded-full ${bucket.dotClass}`} />
                        </div>

                        {bucket.tasks.length === 0 ? (
                          <p className="py-5 text-center text-sm text-gray-500">
                            No tasks in this category.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-3">
                            {bucket.tasks.map((task) => (
                              <div
                                key={`${task.subjectName}-${task.id}`}
                                className="rounded-xl bg-gray-50 p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-gray-900">
                                      {task.title}
                                    </p>
                                    <p className="mt-1 truncate text-xs text-gray-500">
                                      {task.subjectIcon && (
                                        <span className="mr-1">{task.subjectIcon}</span>
                                      )}
                                      {task.subjectName}
                                    </p>
                                  </div>
                                </div>
                                <p className={`mt-2 text-xs font-semibold ${bucket.numberClass}`}>
                                  Due {formatDueDate(task.due_date)}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {deadlineTasks.length === 0 && (
                  <div className="mt-7 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 px-5 py-4 text-center text-sm text-emerald-700">
                    No incomplete tasks currently have deadlines.
                  </div>
                )}

                <div className="mt-7 rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3 text-xs leading-5 text-gray-600">
                  Completed tasks are excluded. This view uses task due dates and is independent of planned study dates.
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          className="mt-8 rounded-2xl border border-violet-100 bg-violet-50/70 p-5"
          data-tutorial="stats-ai"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600">
                AI Study Coach
              </p>
              <h3 className="mt-2 text-xl font-bold text-gray-950">
                Smart Study Suggestion
              </h3>
            </div>

            <button
              type="button"
              disabled={isGeneratingSummary}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleGenerateSummary}
            >
              {isGeneratingSummary
                ? "Generating…"
                : aiSummary
                  ? "Generate Again"
                  : "Generate Suggestion"}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-violet-100 bg-white p-4">
            {isGeneratingSummary ? (
              <div className="space-y-2" aria-label="Generating AI suggestion">
                <div className="h-3 w-full animate-pulse rounded-full bg-violet-100" />
                <div className="h-3 w-5/6 animate-pulse rounded-full bg-violet-100" />
                <div className="h-3 w-2/3 animate-pulse rounded-full bg-violet-100" />
              </div>
            ) : aiSummary ? (
              <p className="whitespace-pre-line text-sm leading-6 text-gray-700">
                {aiSummary}
              </p>
            ) : (
              <p className="text-sm leading-6 text-gray-500">
                Select Generate Suggestion when you want an AI response based
                on the currently displayed statistics.
              </p>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
