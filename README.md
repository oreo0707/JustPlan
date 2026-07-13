# Just Plan

Just Plan is a cozy study planner and note-taking web application built with Next.js, React, and TypeScript. The app helps users organise subjects, manage tasks, create notes, customise their note-taking workspace, and track their progress through statistics in one place.

It is designed for users who struggle with packed schedules and want a simple way to plan their workload, track deadlines, and manage study or work notes.

The app is currently hosted online. Users do not need an account, and the app can be opened through a browser link without installing software. This makes the app easier to test and access during the current development stage. However, user data is stored locally in the browser using localStorage instead of a cloud database.

---

## Live Demo

The hosted version of Just Plan can be accessed here:

```txt
https://just-plan-two.vercel.app
```

---

## Main Features

* Create and manage subjects
* Add planned tasks for specific dates or date ranges
* Add optional task due dates
* View weekly and monthly schedules
* Track today’s tasks and upcoming deadlines
* Create typed or handwritten notes
* Customise note templates, fonts, cursors, and themes
* Import study materials such as PDF files
* View workload and deadline statistics
* Generate AI study suggestions
* Export and import user data for backup or device transfer
* Export and import individual editable notes between devices
* Replay tutorials to learn how to use the app

---

## Screens

Just Plan consists of four main screens:

* Home Page
* Subject Page
* Stats Page
* Settings Page

When the user launches the web application, the user is guided by a tutorial system that introduces each component on the current page during exploration. Tutorials can also be replayed from the Settings Page.

---

## Home Page

The Home Page gives users an overview of their schedule and upcoming work.

Features include:

* Weekly and monthly schedule views
* Planned tasks displayed on the schedule
* Today’s Task panel to show tasks planned for the current day
* Due Soon panel to show tasks that are due within the next three days

---

## Subject Page

The Subject Page allows users to organise their work by subject or category.

Features include:

* Create subjects
* Add tasks and notes under each subject
* Plan tasks for a specific day or a range of days
* Add optional due dates to tasks
* Display created tasks in the Home Page schedule
* Import study materials such as PDF files into a subject

### Note-Taking

Notes can be created using either text mode or draw mode.

Text mode is designed for users who prefer typing notes with a keyboard. Draw mode is designed for users who prefer handwritten notes using a tablet or stylus.

Note-taking features include:

* Add textboxes, images, shapes, and stickers
* Use pencil, eraser, and highlighter tools
* Adjust pen, eraser, and highlighter size
* Choose note templates such as blank, line, dot, and grid
* Use a side page panel to bookmark, add, clear, cut, copy, or duplicate pages
* Use a selection box to move, resize, duplicate, cut, copy, or delete multiple objects
* Print note pages

---

## Stats Page

The Stats Page summarises the user’s progress and workload.

There are three categories:

* Subject Workload: Shows each subject’s workload, including total tasks, completed tasks, pending tasks, and the busiest subject.
* Planned Task Progress: Shows the total number of planned tasks, completed tasks, and pending tasks.
* Deadline Urgency Breakdown: Shows overdue tasks, tasks due today, tasks due this week, and tasks due later.

Each category includes an AI coach that provides suggestions to help users manage workload and meet deadlines.

---

## AI Coach

Just Plan uses the Gemini API to generate study suggestions based on the user’s task statistics.

During local development, API limits and credit usage were encountered, so Ollama was added as a local fallback model in case Gemini fails. This improves reliability during development, but local AI performance may depend on the user’s device and the model being used.

For the hosted version, AI availability depends on the configured API service and quota.

---

## Settings Page

The Settings Page allows users to customise the web application according to their preferences.

Features include:

* Choose between light, dark, and colour themes
* Choose custom cursor styles
* Set default font size and font family
* Set default pen, eraser, and highlighter size
* Set default note template
* Replay tutorials
* Export and import data
* Reset data
* Send feedback to the developer

---

## Current Deployment Approach

Just Plan is currently deployed as a hosted web application.

Online hosting was chosen for the current stage because it allows users to access the app easily without installing software. It also makes testing easier because the developer can deploy updates quickly, and testers can access the latest version through a browser link.

Online hosting was also chosen because Just Plan supports both text-based note-taking and tablet-based drawing. By hosting it as a web app, users can access the same application from laptops, desktops, or tablets through a browser link. This makes it easier to test both keyboard typing and stylus writing workflows.

---

## Desktop/Laptop and Tablet Note-Taking Support

Just Plan supports both desktop/laptop users and tablet users. Instead of disabling features based on device type, the app keeps both text mode and draw mode available so users can choose the workflow that fits them best.

This design decision was made because different devices support different interaction styles. Desktop and laptop users usually rely on a keyboard, mouse, or trackpad, while tablet users may use a stylus and touchscreen gestures.

### Shared Note-Taking Features

Both desktop/laptop and tablet users can use the main note-taking features, including:

* Add images, textboxes, shapes, and stickers
* Type text directly onto the note page
* Use selection tools such as rectangle selection or freeform/draw selection
* Draw on the note page
* Move, resize, duplicate, cut, copy, or delete selected objects

### Desktop/Laptop Experience

For desktop and laptop users, text mode is recommended because it works better with keyboard and mouse interaction.

Desktop/laptop usage is better suited for:

* Typing structured notes
* Editing textboxes
* Selecting and arranging objects using a mouse or trackpad
* Managing note content on a more spacious screen layout
* Using the note editor with less visual crowding

Draw mode is still available on desktop/laptop because some users may have touchscreen laptops, drawing tablets, or may still want to draw simple diagrams using a mouse. However, the drawing experience is mainly optimised for tablet and stylus usage.

### Tablet Experience

For tablet users, draw mode is recommended because it works better with stylus-based writing and touchscreen interaction.

Tablet usage is better suited for:

* Writing handwritten notes with a stylus
* Drawing diagrams or annotations directly on the note page
* Using the stylus for writing or drawing
* Using finger touch to adjust, select, or manipulate objects
* A more natural handwritten note-taking workflow

A shape detection feature was also implemented for tablet-based drawing. This allows users to draw a rough shape, and the system can convert it into a cleaner standard shape based on what the user intended to draw.

This feature was prioritised for tablet usage because stylus input makes freehand drawing more natural. On desktop or laptop, users usually rely on a mouse cursor for both drawing and selection, which can make gesture-based shape detection harder to control. However, draw mode is not disabled on desktop/laptop because some users may still use touchscreen laptops or external drawing tablets.

### Design Decision

Text mode and draw mode are both available across devices instead of being strictly disabled. This gives users more flexibility while still providing recommended workflows for different device types.

In summary:

* Desktop/laptop users are recommended to use text mode for typing, selection, and object arrangement.
* Tablet users are recommended to use draw mode for handwriting, drawing, and stylus-based note-taking.
* Both modes remain accessible so users can switch depending on their device and personal workflow.

---

## Data Storage

Just Plan currently uses browser localStorage to store user data.

This means subjects, tasks, notes, settings, and other saved data are stored locally in the user’s browser. No account is required, and user data is not stored in a central cloud database.

To support data transfer and backup, Just Plan includes import and export features. Users are encouraged to export backups regularly to prevent data loss.

---

## Current Limitations

As Just Plan uses browser localStorage and is currently hosted online, there are several limitations:

* Users need an internet connection to access the hosted web application.
* User data is tied to the same browser and device.
* If the user clears browser data, saved subjects, tasks, and notes may be removed.
* Data does not sync automatically across different devices.
* Users need to use the import and export feature when moving data to a new device.
* AI suggestions depend on external API availability and may be affected by API limits or credit usage.

These limitations are acknowledged as part of the current development stage. The current approach was chosen to make the app easier to test, update, and access across multiple devices.

---

## Backup and Restore

Just Plan includes import and export features to help users manage and transfer their data.

Users can export their full app data as a backup file and import it again later. This is useful when moving to another device or browser. Since the app currently uses browser localStorage, users are encouraged to export backups regularly to prevent data loss.

To further address the limitations of localStorage, Just Plan also supports exporting individual notes as editable note files. Unlike a full backup import, importing an editable note does not replace the user’s entire app data. Instead, users can transfer a specific note between devices and continue editing it after import.

For example, a user who uses both a tablet and a laptop can export a handwritten note from the tablet and import it into the laptop through the note import function in the subject’s note section. The imported note remains editable, allowing the user to continue making changes on the laptop.

Similarly, a user can export a typed note from a desktop or laptop, transfer it to a tablet, import it into a subject, and continue editing the note using tablet-based writing or drawing tools.

This allows users to move individual notes between devices without needing to reset or replace all existing data.

---

## Future Plans

In the future, Just Plan may be developed into installable versions for both laptops and tablets.

The core features would remain similar, such as task planning, scheduling, notes, statistics, and data backup. However, the note-taking experience, UI, and other features may be optimised differently depending on the device.

The laptop version would focus more on keyboard and mouse interactions, while the tablet version would focus more on stylus-based writing. Future versions would aim to improve offline access, provide a more app-like experience, and support better device-specific usability.

Possible future improvements include:

* Installable laptop version
* Tablet-optimised version
* Improved offline support
* More reliable local-first storage
* Better device-specific note-taking experience
* Optional cloud sync
* Improved AI fallback system
* More advanced statistics and study insights

---

## Tech Stack

* Next.js
* React
* TypeScript
* Tailwind CSS
* Gemini API
* Ollama
* Browser localStorage
* Vercel

---

## Using the Hosted App

Normal users and testers can access Just Plan through the live demo link without installing any dependencies or creating an account.

The app runs in the browser, and user data is stored locally using browser localStorage.

---

## Development Notes

This project is built with Next.js, React, TypeScript, and Tailwind CSS. Normal users do not need to install dependencies because the app is accessed through the hosted Vercel link.

---

## Project Status

Just Plan is currently a hosted web application used for testing, feedback, and feature development.

The current version focuses on building a functional planner and note-taking experience while exploring different deployment and storage approaches.

---

## Inspiration

Just Plan is inspired by productivity and note-taking applications, including Notability. The project takes inspiration from common note-taking workflows, including typed notes, handwritten notes, drawing tools, highlighting, page-based note organisation, and tablet-friendly stylus interaction.

All implementation, interface design, and feature development were created independently for learning and portfolio purposes.

---

## License

This project is currently not open source. All rights are reserved by the developer.
