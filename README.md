# ProjectForge — Frontend

React 19 + Vite single-page app built from the 15 ProjectForge screen designs. Deploys to Vercel with zero config.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview    # serve the build locally
```

Log in with **any email and a password of 6+ characters** (auth is mocked until the API is connected — see below).

## Deploy (Vercel)

Push this folder to the frontend branch. Vercel detects Vite automatically; `vercel.json` sets the build output to `dist/` and rewrites all routes to `index.html` so deep links such as `/tasks?task=t5` work on refresh.

If the repo root is not this folder (e.g. a monorepo with `/frontend`), set **Root Directory** in Vercel → Project → Settings.

## Routes

| Path | Screen |
|---|---|
| `/` | Landing |
| `/login`, `/signup`, `/reset-password` | Auth |
| `/dashboard` | Home |
| `/projects` | Projects + Kanban board |
| `/tasks` | Tasks board + details panel |
| `/charts` | Progress, time & estimate charts |
| `/cost` | Budgets & cost breakdown |
| `/people` | Team members |
| `/calendar` (`?view=month|week|day`) | Calendar (month & week designs) |
| `/time-tracking` | Timer, records, export |
| `/notifications` | Notifications |
| `/profile` | Profile & settings |

App routes require login. Old `*.html` links (e.g. `/dashboard.html`) redirect to the new routes.

## What works

- **Auth**: login / signup validation, reset-password confirmation, logout, protected routes
- **Tasks**: create, edit, delete, mark done/reopen, change status from the details panel, **drag & drop between columns** (Tasks and Projects boards)
- **Projects**: category filters, create/edit/delete projects (colour, budget, members, due date), per-column "Add task"
- **Dashboard**: live numbers from your data, Customize dialog (show/hide cards), every card links through
- **Calendar**: month / week / day views, prev/next/today, add/edit/delete events (click a day or time slot), task & project deadlines shown automatically, overlapping events side by side, **Export iCal** (.ics)
- **Time tracking**: live timer with start / pause / resume / stop / discard, manual entries, delete records, **real Excel (.xlsx) export** with selectable sheets, Google Sheets export (CSV + opens a new sheet)
- **Cost**: budgets vs actual spend (actual hours come from the time tracker), add/edit stages and rates, .xlsx export
- **People**: add/remove members, per-person task list
- **Notifications**: open (jumps to the task), mark read/unread, mark all read, dismiss, unread badge in the sidebar
- **Profile**: edit name/email (updates the sidebar), change password dialog, notification toggles, connection toggles, dashboard preferences, reset demo data
- Hover states on every interactive element (buttons, nav, cards, rows, chips, toggles…)

## Data & connecting the Node API

All data lives in React context (`src/lib/store.jsx`) and is saved to `localStorage`, so the app is fully usable before the backend exists. Sample data is in `src/lib/seed.js` (dates are relative to today).

Backend touchpoints are isolated in **`src/lib/api.js`** (login, signup, password reset/change, calendar connections). Replace the mock bodies with `fetch()` calls; the UI already awaits them and shows loading/error states. Put the API base URL in a Vercel env var:

```
VITE_API_URL=https://your-api.example.com
```

and read it with `import.meta.env.VITE_API_URL`. Google/Outlook "Connect" buttons currently toggle state only — they're where your OAuth flow plugs in.

## Structure

```
src/
  main.jsx            entry — providers + CSS
  App.jsx             routes, auth guard, page titles
  lib/                router, store, seed data, api mocks, date + export helpers, design tokens
  components/         AppLayout (sidebar), Board (drag & drop), forms (dialogs), ui (modal, toast, pill…)
  pages/              one file per screen
  styles/
    global.css        reset, dialogs, form controls
    pages/*.css       each screen's original CSS, scoped under .pg-<screen>
    app.css           styles for new interactive elements
    hover.css         hover / interaction polish
public/logo.png
```

No runtime dependencies beyond `react` and `react-dom`; routing, xlsx and iCal export are built in.
