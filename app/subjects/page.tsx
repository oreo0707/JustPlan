"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SubjectCard } from "@/components/SubjectCard";
import type { AppData } from "@/lib/types";
import { defaultData } from "@/lib/default-data";
import { loadData, saveData } from "@/lib/storage";
import { addSubject, deleteSubject } from "@/lib/study-actions";

export default function SubjectsPage() {
  const [data, setData] = useState<AppData>(defaultData);
  const [subjectName, setSubjectName] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const loadedData = loadData();
      setData(loadedData);
      setHasLoaded(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    saveData(data);
  }, [data, hasLoaded]);

  function handleAddSubject() {
    if (!subjectName.trim()) return;

    const updatedData = addSubject(data, subjectName.trim());
    setData(updatedData);
    setSubjectName("");
  }

  function handleDeleteSubject(subjectId: string) {
    const updatedData = deleteSubject(data, subjectId);
    setData(updatedData);
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold">Subjects</h1>
        <p className="mt-2 text-gray-600">
          Manage your subjects, notes, and tasks.
        </p>

        <form
          data-tutorial="subjects-add"
          className="mt-6 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            handleAddSubject();
          }}
        >
          <input
            className="w-full rounded-lg border bg-white px-4 py-2 outline-none"
            value={subjectName}
            onChange={(event) => setSubjectName(event.target.value)}
            placeholder="Add a new subject"
          />

          <button
            type="submit"
            className="rounded-lg bg-black px-4 py-2 text-white"
          >
            Add
          </button>
        </form>

        <div className="mt-8 grid gap-3" data-tutorial="subjects-list">
          {data.subjects.length === 0 && (
            <div className="rounded-xl border border-dashed bg-white p-6 text-center text-gray-500">
              No subjects yet. Add your first subject.
            </div>
          )}

          {data.subjects.map((subject) => (
            <SubjectCard
              key={subject.id}
              id={subject.id}
              name={subject.name}
              icon={subject.icon}
              taskCount={subject.tasks.filter((task) => !task.completed).length}
              noteCount={subject.notes.length}
              onDelete={() => handleDeleteSubject(subject.id)}
            />
          ))}
        </div>
      </section>
    </AppShell>
  );
}
