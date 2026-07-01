import type {
  AppData,
  Note,
  NoteMaterial,
  NoteObject,
  NoteTemplate,
  Subject,
} from "./types";

function generateId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function removeMaterialFileExtension(fileName: string) {
  return fileName.replace(/\.(pdf|docx?)$/i, "");
}

function stripDeletedNoteMetadata(note: Note): Note {
  const nextNote = { ...note };
  delete nextNote.deleted_at;
  delete nextNote.deleted_from_subject_id;
  delete nextNote.deleted_from_subject_name;
  return nextNote;
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
    materials: [],
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
  const subjectToUpdate = data.subjects.find(
    (subject) => subject.id === subjectId
  );
  const noteToDelete = subjectToUpdate?.notes.find(
    (note) => note.id === noteId
  );
  const deletedNote = noteToDelete
    ? {
        ...noteToDelete,
        deleted_at: new Date().toISOString(),
        deleted_from_subject_id: subjectId,
        deleted_from_subject_name: subjectToUpdate?.name ?? "",
      }
    : null;

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
    recently_deleted: deletedNote
      ? {
          ...data.recently_deleted,
          notes: [
            deletedNote,
            ...data.recently_deleted.notes.filter(
              (note) => note.id !== noteId
            ),
          ],
        }
      : data.recently_deleted,
  };
}

export function recoverDeletedNotes(
  data: AppData,
  noteIds: string[]
): AppData {
  const selectedIds = new Set(noteIds);
  const notesToRecover = data.recently_deleted.notes.filter((note) =>
    selectedIds.has(note.id)
  );

  if (!notesToRecover.length) return data;

  const existingSubjectIds = new Set(data.subjects.map((subject) => subject.id));
  const orphanedNotes = notesToRecover.filter(
    (note) =>
      !note.deleted_from_subject_id ||
      !existingSubjectIds.has(note.deleted_from_subject_id)
  );
  const recoveredSubject =
    orphanedNotes.length > 0
      ? {
          id: generateId("subj"),
          name: "Recovered Notes",
          icon: "",
          tasks: [],
          notes: orphanedNotes.map(
            (note) => ({
              ...stripDeletedNoteMetadata(note),
              updated_at: new Date().toISOString(),
            })
          ),
        }
      : null;

  return {
    ...data,
    subjects: [
      ...data.subjects.map((subject) => {
      const notesForSubject = notesToRecover.filter(
        (note) => note.deleted_from_subject_id === subject.id
      );

      if (!notesForSubject.length) return subject;

      return {
        ...subject,
        notes: [
          ...subject.notes,
          ...notesForSubject.map(
            (note) => ({
              ...stripDeletedNoteMetadata(note),
              updated_at: new Date().toISOString(),
            })
          ),
        ],
      };
      }),
      ...(recoveredSubject ? [recoveredSubject] : []),
    ],
    recently_deleted: {
      ...data.recently_deleted,
      notes: data.recently_deleted.notes.filter(
        (note) => !selectedIds.has(note.id)
      ),
    },
  };
}

export function permanentlyDeleteNotes(
  data: AppData,
  noteIds: string[]
): AppData {
  const selectedIds = new Set(noteIds);

  return {
    ...data,
    recently_deleted: {
      ...data.recently_deleted,
      notes: data.recently_deleted.notes.filter(
        (note) => !selectedIds.has(note.id)
      ),
    },
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

export function addMaterialNoteToSubject(
  data: AppData,
  subjectId: string,
  material: NoteMaterial
): AppData {
  const newNote: Note = {
    id: generateId("note"),
    title: removeMaterialFileExtension(material.name),
    content: "",
    template: data.settings.default_note_template,
    objects: [],
    materials: [material],
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

export function updateNotePages(
  data: AppData,
  subjectId: string,
  noteId: string,
  updates: {
    objects?: NoteObject[];
    page_count?: number;
    page_bookmarks?: number[];
  }
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
            ...updates,
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

export function updateNoteMaterials(
  data: AppData,
  subjectId: string,
  noteId: string,
  materials: NoteMaterial[]
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
            materials,
            updated_at: new Date().toISOString(),
          };
        }),
      };
    }),
  };
}
