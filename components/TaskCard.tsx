"use client";

import { useState } from "react";

type TaskScheduleType = "single" | "range";

export type TaskEditValues = {
  title: string;
  dueDate: string;
  scheduleType: TaskScheduleType;
  scheduledDate: string;
  scheduledStartDate: string;
  scheduledEndDate: string;
};

type TaskCardProps = {
  title: string;
  completed: boolean;
  dueDate?: string;
  scheduledDate?: string;
  scheduledStartDate?: string;
  scheduledEndDate?: string;
  onToggle: () => void;
  onDelete: () => void;
  onSave: (values: TaskEditValues) => void;
};

export function TaskCard({
  title,
  completed,
  dueDate = "",
  scheduledDate = "",
  scheduledStartDate = "",
  scheduledEndDate = "",
  onToggle,
  onDelete,
  onSave,
}: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<TaskEditValues>({
    title,
    dueDate,
    scheduleType:
      scheduledStartDate || scheduledEndDate ? "range" : "single",
    scheduledDate,
    scheduledStartDate,
    scheduledEndDate,
  });

  function beginEditing() {
    setDraft({
      title,
      dueDate,
      scheduleType:
        scheduledStartDate || scheduledEndDate ? "range" : "single",
      scheduledDate,
      scheduledStartDate,
      scheduledEndDate,
    });
    setIsEditing(true);
  }

  const rangeIsValid =
    draft.scheduleType !== "range" ||
    (!draft.scheduledStartDate && !draft.scheduledEndDate) ||
    Boolean(
      draft.scheduledStartDate &&
        draft.scheduledEndDate &&
        draft.scheduledStartDate <= draft.scheduledEndDate
    );

  if (isEditing) {
    return (
      <form
        className="rounded-xl border bg-gray-50 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.title.trim() || !rangeIsValid) return;

          onSave({ ...draft, title: draft.title.trim() });
          setIsEditing(false);
        }}
      >
        <div className="grid gap-3">
          <label className="text-xs font-semibold text-gray-600">
            Task name
            <input
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
            />
          </label>

          <label className="text-xs font-semibold text-gray-600">
            Due date
            <input
              type="date"
              value={draft.dueDate}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dueDate: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
            />
          </label>

          <div>
            <p className="text-xs font-semibold text-gray-600">Planned dates</p>
            <div className="mt-1 flex gap-2">
              {(["single", "range"] as TaskScheduleType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={
                    draft.scheduleType === type
                      ? "rounded-lg bg-black px-3 py-1.5 text-xs text-white"
                      : "rounded-lg border bg-white px-3 py-1.5 text-xs"
                  }
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      scheduleType: type,
                    }))
                  }
                >
                  {type === "single" ? "Specific day" : "Date range"}
                </button>
              ))}
            </div>
          </div>

          {draft.scheduleType === "single" ? (
            <label className="text-xs font-semibold text-gray-600">
              Planned date
              <input
                type="date"
                value={draft.scheduledDate}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    scheduledDate: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
              />
            </label>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-gray-600">
                Start date
                <input
                  type="date"
                  value={draft.scheduledStartDate}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      scheduledStartDate: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
                />
              </label>
              <label className="text-xs font-semibold text-gray-600">
                End date
                <input
                  type="date"
                  min={draft.scheduledStartDate || undefined}
                  value={draft.scheduledEndDate}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      scheduledEndDate: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
                />
              </label>
            </div>
          )}

          {!rangeIsValid && (
            <p className="text-xs font-medium text-red-600">
              Choose both range dates and make sure the end is not before the start.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border bg-white px-3 py-1.5 text-sm"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!draft.title.trim() || !rangeIsValid}
              className="rounded-lg bg-black px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save Changes
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-gray-50 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <input type="checkbox" checked={completed} onChange={onToggle} />

        <div className="min-w-0">
          <p
            className={
              completed
                ? "truncate font-medium text-gray-400 line-through"
                : "truncate font-medium"
            }
          >
            {title}
          </p>
          <p className="text-sm text-gray-500">
            {completed ? "Completed" : "Not completed"}
          </p>
          {scheduledDate && (
            <p className="text-xs text-gray-500">Planned: {scheduledDate}</p>
          )}
          {scheduledStartDate && scheduledEndDate && (
            <p className="text-xs text-gray-500">
              Planned: {scheduledStartDate} to {scheduledEndDate}
            </p>
          )}
          {dueDate && <p className="text-xs text-gray-500">Due: {dueDate}</p>}
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          className="rounded-lg border px-3 py-1 text-sm"
          onClick={beginEditing}
        >
          Edit
        </button>
        <button
          type="button"
          className="rounded-lg border px-3 py-1 text-sm text-red-500"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
