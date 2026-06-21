export type Task = {
  id: string;
  title: string;
  description: string;

  due_date: string;

  scheduled_date: string;
  scheduled_start_date?: string;
  scheduled_end_date?: string;

  completed: boolean;
  important: boolean;
  created_at: string;
  position: number;
};

export type NoteTemplate = "plain" | "lined" | "grid" | "dots";

export type Note = {
  id: string;
  title: string;
  content: string;
  template: NoteTemplate;
  objects: NoteObject[];
  created_at: string;
  updated_at: string;
  position: number;
};

export type NoteObjectType =
  | "sticker"
  | "image"
  | "rectangle"
  | "circle"
  | "triangle"
  | "line"
  | "textbox";

export type ShapeVertex = {
  x: number;
  y: number;
};

export type NoteObject = {
  id: string;
  type: NoteObjectType;
  src?: string;

  x: number;
  y: number;
  width: number;
  height: number;
  originalWidth?: number;
  originalHeight?: number;

  // Absolute second endpoint used by freely adjustable line objects.
  endX?: number;
  endY?: number;
  vertices?: ShapeVertex[];

  color?: string;
  filled?: boolean;

  text?: string;
  fontSize?: number;
  fontFamily?: string;

  flipX?: boolean;
  flipY?: boolean;
};

export type TextBox = {
  id: string;
  type: "textbox";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  fontSize: number;
  fontFamily: string;
}


export type Subject = {
  id: string;
  name: string;
  icon: string;
  tasks: Task[];
  notes: Note[];
};

export type Settings = {
  theme: "light" | "dark";
  cursor_style: "default" | "y2k-arrow" | "heart" | "cute-pointer" | "star" ;
  default_font_size: number;
  default_font_family: string;
  default_note_template: NoteTemplate;
  app_background_color: string;
  app_surface_color: string;
  app_accent_color: string;
  app_text_color: string;
  saved_app_color_template: {
    name: string;
    colors: {
      app_background_color: string;
      app_surface_color: string;
      app_accent_color: string;
      app_text_color: string;
    };
  } | null;
  tutorial_shown: boolean;
  home_schedule_note: string;
};

export type AppData = {
  subjects: Subject[];
  settings: Settings;
  recently_deleted: {
    tasks: Task[];
    notes: Note[];
    subjects: Subject[];
  };
};
