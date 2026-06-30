"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AppData, NoteMaterial, Subject } from "@/lib/types";
import { defaultData } from "@/lib/default-data";
import { loadData, saveData } from "@/lib/storage";
import {
  addMaterialNoteToSubject,
  addNoteToSubject,
  addTaskToSubject,
  deleteNoteFromSubject,
  deleteTaskFromSubject,
  toggleTaskCompleted,
  updateNoteTitle,
  updateNoteMaterials,
  updateSubjectName,
  updateTaskDetails,
} from "@/lib/study-actions";
import { storeMaterialFile } from "@/lib/material-storage";
import { TaskCard, type TaskEditValues } from "@/components/TaskCard";
import { NoteCard } from "@/components/NoteCard";
import { AppShell } from "@/components/AppShell";

export default function SubjectPage() {
  const params = useParams<{ subjectId: string }>();
  const subjectId = params.subjectId;

  const [data, setData] = useState<AppData>(defaultData);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskScheduleType, setTaskScheduleType] = useState<"single" | "range">("single");
  const [taskScheduledDate, setTaskScheduledDate] = useState("");
  const [taskScheduledStartDate, setTaskScheduledStartDate] = useState("");
  const [taskScheduledEndDate, setTaskScheduledEndDate] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [showNoteMenu, setShowNoteMenu] = useState(false);
  const [isImportingMaterial, setIsImportingMaterial] = useState(false);
  const [isEditingSubjectName, setIsEditingSubjectName] = useState(false);
  const [subjectNameDraft, setSubjectNameDraft] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const loadedData = loadData();
      setData(loadedData);

      const foundSubject = loadedData.subjects.find(
        (item) => item.id === subjectId
      );

      setSubject(foundSubject ?? null);
      setHasLoaded(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [subjectId]);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      saveData(data);

      const updatedSubject = data.subjects.find(
        (item) => item.id === subjectId
      );

      setSubject(updatedSubject ?? null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [data, hasLoaded, subjectId]);

  function handleAddTask() {
    if (!taskTitle.trim()) {
      return;
    }

    const updatedData = addTaskToSubject(
      data,
      subjectId,
      taskTitle.trim(),
      taskDueDate,
      taskScheduleType === "single" ? taskScheduledDate : "",
      taskScheduleType === "range" ? taskScheduledStartDate : "",
      taskScheduleType === "range" ? taskScheduledEndDate : ""
    );

    setData(updatedData);
    setTaskTitle("");
    setTaskDueDate("");
    setTaskScheduleType("single");
    setTaskScheduledDate("");
    setTaskScheduledStartDate("");
    setTaskScheduledEndDate("");
  }

  function handleToggleTask(taskId: string) {
  const updatedData = toggleTaskCompleted(data, subjectId, taskId);
  setData(updatedData);
}

function handleDeleteTask(taskId: string) {
  const updatedData = deleteTaskFromSubject(data, subjectId, taskId);
  setData(updatedData);
}

function handleSaveTask(taskId: string, values: TaskEditValues) {
  const updatedData = updateTaskDetails(data, subjectId, taskId, {
    title: values.title,
    due_date: values.dueDate,
    scheduled_date:
      values.scheduleType === "single" ? values.scheduledDate : "",
    scheduled_start_date:
      values.scheduleType === "range" ? values.scheduledStartDate : "",
    scheduled_end_date:
      values.scheduleType === "range" ? values.scheduledEndDate : "",
  });
  setData(updatedData);
}

function handleAddNote() {
  if (!noteTitle.trim()) {
    return;
  }

  const updatedData = addNoteToSubject(
    data,
    subjectId,
    noteTitle.trim()
  );

  setData(updatedData);
  setNoteTitle("");
}

function handleDeleteNote(noteId: string) {
  const updatedData = deleteNoteFromSubject(data, subjectId, noteId);
  setData(updatedData);
}

async function handleImportMaterialNote(file: File) {
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  const lowerName = file.name.toLowerCase();
  const allowedExtension =
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".doc") ||
    lowerName.endsWith(".docx");

  if (!allowedTypes.includes(file.type) && !allowedExtension) {
    window.alert("Please import a PDF or Word document.");
    return;
  }

  setIsImportingMaterial(true);

  try {
    const fileReference = await storeMaterialFile(file);
    const material: NoteMaterial = {
      id: `mat_${crypto.randomUUID().slice(0, 8)}`,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      fileReference,
      imported_at: new Date().toISOString(),
      highlights: [],
    };

    setData(addMaterialNoteToSubject(data, subjectId, material));
    setShowNoteMenu(false);
  } finally {
    setIsImportingMaterial(false);
  }
}

function handleSaveNoteTitle(noteId: string, title: string) {
  setData(updateNoteTitle(data, subjectId, noteId, title));
}

function handleSaveNoteMaterials(noteId: string, materials: NoteMaterial[]) {
  setData(updateNoteMaterials(data, subjectId, noteId, materials));
}

function handleSaveSubjectName() {
  const name = subjectNameDraft.trim();
  if (!name) return;

  setData(updateSubjectName(data, subjectId, name));
  setIsEditingSubjectName(false);
}

  if (!subject) {
  return (
    <AppShell>
      <section className="mx-auto max-w-4xl">
          <Link href="/" className="text-sm text-blue-600">
            ← Back to Home
          </Link>

          <div className="mt-6 rounded-xl border bg-white p-6">
            <h1 className="text-xl font-bold">Subject not found</h1>
            <p className="mt-2 text-gray-500">
              This subject may have been deleted.
            </p>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-blue-600">
          ← Back to Home
        </Link>

        <div
          className="mt-6 rounded-xl border bg-white p-6 shadow-sm"
          data-tutorial="subject-header"
        >
          {isEditingSubjectName ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                handleSaveSubjectName();
              }}
            >
              <span className="text-3xl">{subject.icon}</span>
              <input
                value={subjectNameDraft}
                onChange={(event) => setSubjectNameDraft(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-2xl font-bold outline-none"
                autoFocus
              />
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() => setIsEditingSubjectName(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!subjectNameDraft.trim()}
                className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-40"
              >
                Save
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-3xl font-bold">
                {subject.icon} {subject.name}
              </h1>
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-sm"
                onClick={() => {
                  setSubjectNameDraft(subject.name);
                  setIsEditingSubjectName(true);
                }}
              >
                Edit Name
              </button>
            </div>
          )}

          <p className="mt-2 text-gray-500">
            {subject.tasks.length} tasks · {subject.notes.length} notes
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div
            className="rounded-xl border bg-white p-6 shadow-sm"
            data-tutorial="subject-tasks"
          >
            <h2 className="text-xl font-semibold">Tasks</h2>

            <form
              className="mt-4 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                handleAddTask();
              }}
            >
              <input
                className="w-full rounded-lg border px-3 py-2 outline-none"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="Enter task title"
              />

              <label className="text-sm text-gray-600">
                Due date
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border px-3 py-2 outline-none"
                  value={taskDueDate}
                  onChange={(event) => setTaskDueDate(event.target.value)}
                />
              </label>

              <div data-tutorial="subject-task-dates">
                <p className="text-sm text-gray-600">When do you plan to do this?</p>

                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className={
                      taskScheduleType === "single"
                        ? "rounded-lg bg-black px-4 py-2 text-sm text-white"
                        : "rounded-lg border px-4 py-2 text-sm"
                    }
                    onClick={() => setTaskScheduleType("single")}
                  >
                    Specific day
                  </button>

                  <button
                    type="button"
                    className={
                      taskScheduleType === "range"
                        ? "rounded-lg bg-black px-4 py-2 text-sm text-white"
                        : "rounded-lg border px-4 py-2 text-sm"
                    }
                    onClick={() => setTaskScheduleType("range")}
                  >
                    Date range
                  </button>
                </div>
              </div>

              {taskScheduleType === "single" ? (
                <label className="text-sm text-gray-600">
                  Planned date
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border px-3 py-2 outline-none"
                    value={taskScheduledDate}
                    onChange={(event) => setTaskScheduledDate(event.target.value)}
                  />
                </label>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-sm text-gray-600">
                    Start date
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border px-3 py-2 outline-none"
                      value={taskScheduledStartDate}
                      onChange={(event) => setTaskScheduledStartDate(event.target.value)}
                    />
                  </label>

                  <label className="text-sm text-gray-600">
                    End date
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border px-3 py-2 outline-none"
                      value={taskScheduledEndDate}
                      onChange={(event) => setTaskScheduledEndDate(event.target.value)}
                    />
                  </label>
                </div>
              )}

              <button
                type="submit"
                className="rounded-lg bg-black px-4 py-2 text-white"
              >
                Add Task
              </button>
            </form>

            {subject.tasks.length === 0 ? (
              <p className="mt-4 text-gray-500">No tasks yet.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {subject.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    title={task.title}
                    completed={task.completed}
                    dueDate={task.due_date}
                    scheduledDate={task.scheduled_date}
                    scheduledStartDate={task.scheduled_start_date}
                    scheduledEndDate={task.scheduled_end_date}
                    onToggle={() => handleToggleTask(task.id)}
                    onDelete={() => handleDeleteTask(task.id)}
                    onSave={(values) => handleSaveTask(task.id, values)}
                  />  
                ))}
              </div>
            )}
          </div>

          <div
            className="rounded-xl border bg-white p-6 shadow-sm"
            data-tutorial="subject-notes"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Notes</h2>

              <div className="relative">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-1 text-sm"
                  onClick={() => setShowNoteMenu((current) => !current)}
                  aria-label="Open note options"
                  data-tutorial="subject-import-material"
                >
                  ...
                </button>

                {showNoteMenu && (
                  <div className="absolute right-0 top-9 z-50 w-52 rounded-xl border bg-white p-2 text-sm shadow-lg">
                    <label className="block cursor-pointer rounded-lg px-3 py-2 hover:bg-gray-50">
                      {isImportingMaterial
                        ? "Importing..."
                        : "Import PDF / Word"}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                        disabled={isImportingMaterial}
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;

                          await handleImportMaterialNote(file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>

            <form
              className="mt-4 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                handleAddNote();
              }}
            >
              <input
                className="w-full rounded-lg border px-3 py-2 outline-none"
                value={noteTitle}
                onChange={(event) => setNoteTitle(event.target.value)}
                placeholder="Enter note title"
              />

              <button
                type="submit"
                className="rounded-lg bg-black px-4 py-2 text-white"
              >
                Add
              </button>
            </form>

            {subject.notes.length === 0 ? (
              <p className="mt-4 text-gray-500">No notes yet.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {subject.notes.map((note) => (
                  <NoteCard
                    key={note.id}
                    subjectId={subjectId}
                    noteId={note.id}
                    title={note.title}
                    template={note.template}
                    materials={note.materials ?? []}
                    onSaveTitle={(title) =>
                      handleSaveNoteTitle(note.id, title)
                    }
                    onSaveMaterials={(materials) =>
                      handleSaveNoteMaterials(note.id, materials)
                    }
                    onDelete={() => handleDeleteNote(note.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

