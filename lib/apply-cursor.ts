// import type { AppData } from "./types";

// const cursorClasses = [
//   "cursor-y2k-arrow",
//   "cursor-heart",
//   "cursor-cute-pointer",
// ];

// export function applyCursorStyle(
//   cursorStyle: AppData["settings"]["cursor_style"]
// ) {
//   if (typeof document === "undefined") {
//     return;
//   }

//   document.body.classList.remove(...cursorClasses);

//   if (cursorStyle !== "default") {
//     document.body.classList.add(`cursor-${cursorStyle}`);
//   }
// }

import type { AppData } from "./types";

const cursorClasses = [
  "cursor-y2k-arrow",
  "cursor-heart",
  "cursor-cute-pointer",
  "cursor-star",
];

export function applyCursorStyle(
  cursorStyle: AppData["settings"]["cursor_style"]
) {
  if (typeof document === "undefined") {
    return;
  }

  document.body.classList.remove(...cursorClasses);

  if (cursorStyle !== "default") {
    document.body.classList.add(`cursor-${cursorStyle}`);
  }

  console.log("Applied cursor:", cursorStyle);
  console.log("Body classes:", document.body.className);
}