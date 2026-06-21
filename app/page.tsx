"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import type { AppData } from "@/lib/types";
import { defaultData } from "@/lib/default-data";
import { loadData, saveData } from "@/lib/storage";
import {
  getDaysUntil,
  getMonthDays,
  getTodayDateString,
  getWeekDays,
} from "@/lib/date-utils";

type ScheduleView = "weekly" | "monthly";

export default function HomePage() {
  const [data, setData] = useState<AppData>(defaultData);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [scheduleView, setScheduleView] = useState<ScheduleView>("weekly");
  const [weeklyNote, setWeeklyNote] = useState("");

  const today = getTodayDateString();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const loadedData = loadData();
      setData(loadedData);
      setWeeklyNote(loadedData.settings.home_schedule_note ?? "");
      setHasLoaded(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;

    saveData({
      ...data,
      settings: {
        ...data.settings,
        home_schedule_note: weeklyNote,
      },
    });
  }, [data, weeklyNote, hasLoaded]);

  const allTasks = useMemo(() => {
    return data.subjects.flatMap((subject) =>
      subject.tasks.map((task) => ({
        ...task,
        subjectId: subject.id,
        subjectName: subject.name,
      }))
    );
  }, [data.subjects]);

  const pendingTasks = allTasks.filter((task) => !task.completed);

  const dueSoonTasks = pendingTasks
    .filter((task) => {
      if (!task.due_date) return false;

      const daysUntil = getDaysUntil(task.due_date);
      return daysUntil >= 0 && daysUntil <= 3;
    })
    .sort((a, b) => getDaysUntil(a.due_date) - getDaysUntil(b.due_date));

  function getTasksForDate(dateString: string) {
    return pendingTasks.filter((task) => {
      if (task.scheduled_date === dateString) {
        return true;
      }

      if (task.scheduled_start_date && task.scheduled_end_date) {
        return (
          dateString >= task.scheduled_start_date &&
          dateString <= task.scheduled_end_date
        );
      }

      return false;
    });
  }

  const todayTasks = getTasksForDate(today);

  const weekDays = getWeekDays(new Date());
  const monthDays = getMonthDays(new Date());

  return (
    <AppShell>
      <section className="mx-auto max-w-6xl space-y-8 pb-12">
        <div data-tutorial="home-overview">
          <h1 className="text-3xl font-bold text-gray-950">Home</h1>
          <p className="mt-2 text-gray-600">
            View your study schedule, today&apos;s tasks, and upcoming deadlines.
          </p>
        </div>

        <section
          data-tutorial="home-schedule"
          className="rounded-xl border bg-white p-6 shadow-sm"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Schedule</h2>
              <p className="text-sm text-gray-500">
                Tasks are shown based on when you plan to do them.
              </p>
            </div>

            <div className="flex rounded-lg border bg-gray-50 p-1">
              <button
                className={
                  scheduleView === "weekly"
                    ? "rounded-md bg-black px-4 py-2 text-sm text-white"
                    : "rounded-md px-4 py-2 text-sm text-gray-600"
                }
                onClick={() => setScheduleView("weekly")}
              >
                Weekly
              </button>

              <button
                className={
                  scheduleView === "monthly"
                    ? "rounded-md bg-black px-4 py-2 text-sm text-white"
                    : "rounded-md px-4 py-2 text-sm text-gray-600"
                }
                onClick={() => setScheduleView("monthly")}
              >
                Monthly
              </button>
            </div>
          </div>

          {scheduleView === "weekly" ? (
            <div className="mt-6 grid grid-cols-4 gap-3">
              {weekDays.map((day) => {
                const tasks = getTasksForDate(day.dateString);

                return (
                  <div
                    key={day.dateString}
                    className="min-h-36 rounded-xl border bg-gray-50 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{day.label}</p>
                      <p className="text-sm text-gray-500">{day.dayNumber}</p>
                    </div>

                    <div className="mt-3 space-y-2">
                      {tasks.map((task) => (
                        <div
                          key={task.id}
                          className="rounded-md bg-white px-2 py-1 text-xs shadow-sm"
                        >
                          <p className="font-medium">{task.title}</p>
                          <p className="text-gray-500">{task.subjectName}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              <div className="min-h-36 rounded-xl border bg-gray-50 p-3">
                <p className="font-semibold">Weekly Note</p>

                <textarea
                  className="mt-3 h-24 w-full resize-none rounded-lg border bg-white p-2 text-sm outline-none"
                  value={weeklyNote}
                  onChange={(event) => setWeeklyNote(event.target.value)}
                  placeholder="Write a note for this week..."
                />
              </div>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-7 gap-2">
              {monthDays.map((day) => {
                const tasks = getTasksForDate(day.dateString);

                return (
                  <div
                    key={day.dateString}
                    className="min-h-28 rounded-lg border bg-gray-50 p-2"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">{day.label}</p>
                      <p className="text-xs text-gray-500">{day.dayNumber}</p>
                    </div>

                    <div className="mt-2 space-y-1">
                      {tasks.map((task) => (
                        <div
                          key={task.id}
                          className="truncate rounded bg-white px-2 py-1 text-xs shadow-sm"
                        >
                          {task.title}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section
          data-tutorial="home-tasks"
          className="rounded-xl border bg-white p-6 shadow-sm"
        >
          <h2 className="text-xl font-semibold text-gray-900">Today&apos;s Tasks</h2>
          <p className="text-sm text-gray-500">
            Tasks planned specifically for today or within a planned range that includes today.
          </p>

          {todayTasks.length === 0 ? (
            <p className="mt-4 text-gray-500">No tasks planned for today.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {todayTasks.map((task) => {
                const isSpecificallyPlannedToday =
                  task.scheduled_date === today;

                return (
                  <div
                    key={task.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-gray-50 p-3"
                  >
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-gray-500">
                        {task.subjectName}
                      </p>
                    </div>
                    <span
                      className="app-theme-accent-badge rounded-full border px-2.5 py-1 text-xs font-medium"
                    >
                      {isSpecificallyPlannedToday
                        ? "Planned today"
                        : "Ongoing planned range"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section
          data-tutorial="home-due-soon"
          className="rounded-xl border bg-white p-6 shadow-sm"
        >
          <h2 className="text-xl font-semibold text-gray-900">Due Soon</h2>
          <p className="text-sm text-gray-500">
            Tasks due within the next 3 days.
          </p>

          {dueSoonTasks.length === 0 ? (
            <p className="mt-4 text-gray-500">No tasks due soon.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {dueSoonTasks.map((task) => {
                const daysUntil = getDaysUntil(task.due_date);

                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded-lg border bg-gray-50 p-3"
                  >
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-gray-500">
                        {task.subjectName}
                      </p>
                    </div>

                    <p className="text-sm font-medium">
                      {daysUntil === 0
                        ? "Due today"
                        : `${daysUntil} day${daysUntil === 1 ? "" : "s"} left`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </AppShell>
  );
}
