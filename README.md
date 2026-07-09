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

## Future Plans

In the future, Just Plan may be developed into installable versions for both laptops and tablets.

The core features would remain similar, such as task planning, scheduling, notes, statistics, and data backup. However, the note-taking experience may be optimised differently depending on the device.

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

## Getting Started

To run Just Plan locally, clone the repository and install the dependencies.

```bash
npm install
```

Then start the development server:

```bash
npm run dev
```

Open the app in your browser:

```txt
http://localhost:3000
```

---

## Build

To create a production build:

```bash
npm run build
```

To start the production build locally:

```bash
npm run start
```

---

## Environment Variables

Just Plan uses the Gemini API for AI study suggestions.

Create a `.env.local` file in the project root and add:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

The `.env.local` file should not be committed to GitHub.

For deployment on Vercel, the same environment variable should be added in the Vercel project settings.

---

## Backup and Restore

Just Plan includes an import and export feature to help users manage their data.

Users can export their data as a backup file and import it again later. This is especially useful when moving to another device or browser.

Because the app currently uses browser localStorage, users are encouraged to export backups regularly.

---

## Project Status

Just Plan is currently a hosted web application used for testing, feedback, and feature development.

The current version focuses on building a functional planner and note-taking experience while exploring different deployment and storage approaches.
