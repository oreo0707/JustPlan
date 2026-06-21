import type { AppData, Note, NoteObject, NoteTemplate, Subject } from "./types";

function generateId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function addSubject(
  data: AppData,
  name: string,
  icon = ""
): AppData {
  const newSubject: Subject = {
    id: generateId("subj"),
    name,
    icon,
    tasks: [],
    notes: [],
  };

  return {
    ...data,
    subjects: [...data.subjects, newSubject],
  };
}

export function deleteSubject(
  data: AppData,
  subjectId: string
): AppData {
  const subjectToDelete = data.subjects.find(
    (subject) => subject.id === subjectId
  );

  if (!subjectToDelete) {
    return data;
  }

  return {
    ...data,
    subjects: data.subjects.filter(
      (subject) => subject.id !== subjectId
    ),
    recently_deleted: {
      ...data.recently_deleted,
      subjects: [
        ...data.recently_deleted.subjects,
        subjectToDelete,
      ],
    },
  };
}

export function updateSubjectName(
  data: AppData,
  subjectId: string,
  name: string
): AppData {
  return {
    ...data,
    subjects: data.subjects.map((subject) =>
      subject.id === subjectId ? { ...subject, name } : subject
    ),
  };
}

export function addTaskToSubject(
  data: AppData,
  subjectId: string,
  title: string,
  dueDate = "",
  scheduledDate = "",
  scheduledStartDate = "",
  scheduledEndDate = ""
): AppData {
  const newTask = {
    id: generateId("task"),
    title,
    description: "",
    due_date: dueDate,
    scheduled_date: scheduledDate,
    scheduled_start_date: scheduledStartDate,
    scheduled_end_date: scheduledEndDate,
    completed: false,
    important: false,
    created_at: new Date().toISOString(),
    position: 0,
  };

  return {
    ...data,
    subjects: data.subjects.map((subject) => {
      if (subject.id !== subjectId) {
        return subject;
      }

      return {
        ...subject,
        tasks: [...subject.tasks, newTask],
      };
    }),
  };
}

export function toggleTaskCompleted(
  data: AppData,
  subjectId: string,
  taskId: string
): AppData {
  return {
    ...data,
    subjects: data.subjects.map((subject) => {
      if (subject.id !== subjectId) {
        return subject;
      }

      return {
        ...subject,
        tasks: subject.tasks.map((task) => {
          if (task.id !== taskId) {
            return task;
          }

          return {
            ...task,
            completed: !task.completed,
          };
        }),
      };
    }),
  };
}

export function updateTaskDetails(
  data: AppData,
  subjectId: string,
  taskId: string,
  updates: {
    title: string;
    due_date: string;
    scheduled_date: string;
    scheduled_start_date: string;
    scheduled_end_date: string;
  }
): AppData {
  return {
    ...data,
    subjects: data.subjects.map((subject) => {
      if (subject.id !== subjectId) return subject;

      return {
        ...subject,
        tasks: subject.tasks.map((task) =>
          task.id === taskId ? { ...task, ...updates } : task
        ),
      };
    }),
  };
}

// export function deleteTaskFromSubject(
//   data: AppData,
//   subjectId: string,
//   taskId: string
// ): AppData {
//   return {
//     ...data,
//     subjects: data.subjects.map((subject) => {
//       if (subject.id !== subjectId) {
//         return subject;
//       }

//       const taskToDelete = subject.tasks.find((task) => task.id === taskId);

//       return {
//         ...subject,
//         tasks: subject.tasks.filter((task) => task.id !== taskId),
//       };
//     }),
//   };
// }

export function deleteTaskFromSubject(
  data: AppData,
  subjectId: string,
  taskId: string
): AppData {
  return {
    ...data,
    subjects: data.subjects.map((subject) => {
      if (subject.id !== subjectId) {
        return subject;
      }

      return {
        ...subject,
        tasks: subject.tasks.filter((task) => task.id !== taskId),
      };
    }),
  };
}

export function addNoteToSubject(
  data: AppData,
  subjectId: string,
  title: string
): AppData {
  const newNote : Note = {
    id: generateId("note"),
    title,
    content: "",
    template: data.settings.default_note_template,
    objects: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    position: 0,
  };

  return {
    ...data,
    subjects: data.subjects.map((subject) => {
      if (subject.id !== subjectId) {
        return subject;
      }

      return {
        ...subject,
        notes: [...subject.notes, newNote],
      };
    }),
  };
}

export function deleteNoteFromSubject(
  data: AppData,
  subjectId: string,
  noteId: string
): AppData {
  return {
    ...data,
    subjects: data.subjects.map((subject) => {
      if (subject.id !== subjectId) {
        return subject;
      }

      return {
        ...subject,
        notes: subject.notes.filter((note) => note.id !== noteId),
      };
    }),
  };
}

export function updateNoteTitle(
  data: AppData,
  subjectId: string,
  noteId: string,
  title: string
): AppData {
  return {
    ...data,
    subjects: data.subjects.map((subject) => {
      if (subject.id !== subjectId) return subject;

      return {
        ...subject,
        notes: subject.notes.map((note) =>
          note.id === noteId
            ? { ...note, title, updated_at: new Date().toISOString() }
            : note
        ),
      };
    }),
  };
}

export function updateNoteContent(
  data: AppData,
  subjectId: string,
  noteId: string,
  content: string
): AppData {
  return {
    ...data,
    subjects: data.subjects.map((subject) => {
      if (subject.id !== subjectId) {
        return subject;
      }

      return {
        ...subject,
        notes: subject.notes.map((note) => {
          if (note.id !== noteId) {
            return note;
          }

          return {
            ...note,
            content,
            updated_at: new Date().toISOString(),
          };
        }),
      };
    }),
  };
}

export function updateNoteTemplate(
  data: AppData,
  subjectId: string,
  noteId: string,
  template: NoteTemplate
): AppData {
  return {
    ...data,
    subjects: data.subjects.map((subject) => {
      if (subject.id !== subjectId) {
        return subject;
      }

      return {
        ...subject,
        notes: subject.notes.map((note) => {
          if (note.id !== noteId) {
            return note;
          }

          return {
            ...note,
            template,
            updated_at: new Date().toISOString(),
          };
        }),
      };
    }),
  };
}

export function updateNoteObjects(
  data: AppData,
  subjectId: string,
  noteId: string,
  objects: NoteObject[]
): AppData {
  return {
    ...data,
    subjects: data.subjects.map((subject) => {
      if (subject.id !== subjectId) {
        return subject;
      }

      return {
        ...subject,
        notes: subject.notes.map((note) => {
          if (note.id !== noteId) {
            return note;
          }

          return {
            ...note,
            objects,
            updated_at: new Date().toISOString(),
          };
        }),
      };
    }),
  };
}

export function updateSettings(
  data: AppData,
  settings: Partial<AppData["settings"]>
): AppData {
  return {
    ...data,
    settings: {
      ...data.settings,
      ...settings,
    },
  };
}
