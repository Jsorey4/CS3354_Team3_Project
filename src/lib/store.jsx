// Global app state: one React context, persisted to localStorage.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createSeed } from './seed';
import { todayStr, weekStart, diffDays } from './date';
import { AVATAR_CLASSES } from './theme';

const KEY = 'projectforge:v1';
const StoreContext = createContext(null);

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 12);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 1) return s;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return createSeed();
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full / disabled */
  }
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(load);

  // Persist synchronously so a refresh right after an action never loses it.
  const update = useCallback((fn) => {
    setState((s) => {
      const d = structuredClone(s);
      fn(d);
      save(d);
      return d;
    });
  }, []);

  // Keep tabs in sync
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY && e.newValue) {
        try {
          setState(JSON.parse(e.newValue));
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const actions = useMemo(() => {
    const findTask = (d, id) => d.tasks.find((t) => t.id === id);
    const findProject = (d, id) => d.projects.find((p) => p.id === id);
    return {
      // ---- auth / user
      login: ({ email, name }) =>
        update((d) => {
          d.auth = { loggedIn: true };
          const me = d.people.find((p) => p.id === d.meId);
          if (name) me.name = name;
          else if (email !== d.user.email) {
            const local = email.split('@')[0].replace(/[._-]+/g, ' ');
            me.name = local.replace(/\b\w/g, (c) => c.toUpperCase());
          }
          d.user.email = email;
          me.email = email;
        }),
      logout: () => update((d) => void (d.auth = { loggedIn: false })),
      resetDemo: () => {
        const fresh = { ...createSeed(), auth: { loggedIn: true } };
        save(fresh);
        setState(fresh);
      },
      updateProfile: ({ name, email }) =>
        update((d) => {
          const me = d.people.find((p) => p.id === d.meId);
          me.name = name;
          me.email = email;
          d.user.email = email;
        }),
      setPref: (group, key, value) => update((d) => void (d.user[group][key] = value)),

      // ---- tasks
      addTask: (t) => {
        const id = uid();
        update((d) => {
          d.tasks.push({ id, tags: [], priority: 'Medium', status: 'todo', ...t, doneDate: t.status === 'done' ? todayStr() : undefined });
        });
        return id;
      },
      updateTask: (id, patch) =>
        update((d) => {
          const t = findTask(d, id);
          if (!t) return;
          if (patch.status && patch.status !== t.status) t.doneDate = patch.status === 'done' ? todayStr() : undefined;
          Object.assign(t, patch);
        }),
      deleteTask: (id) => update((d) => void (d.tasks = d.tasks.filter((t) => t.id !== id))),

      // ---- projects
      addProject: (p) => {
        const id = uid();
        update((d) => void d.projects.push({ id, stages: [], members: [], budget: 0, ...p }));
        return id;
      },
      updateProject: (id, patch) => update((d) => void Object.assign(findProject(d, id), patch)),
      deleteProject: (id) =>
        update((d) => {
          d.projects = d.projects.filter((p) => p.id !== id);
          d.tasks = d.tasks.filter((t) => t.projectId !== id);
          d.entries = d.entries.filter((e) => e.projectId !== id);
          d.events = d.events.filter((e) => e.projectId !== id);
          if (d.timer.projectId === id) d.timer = { active: false };
        }),
      saveStage: (projectId, stage) =>
        update((d) => {
          const p = findProject(d, projectId);
          const i = p.stages.findIndex((s) => s.id === stage.id);
          if (i >= 0) p.stages[i] = stage;
          else p.stages.push({ ...stage, id: uid() });
        }),
      deleteStage: (projectId, stageId) =>
        update((d) => {
          const p = findProject(d, projectId);
          p.stages = p.stages.filter((s) => s.id !== stageId);
          d.entries.forEach((e) => {
            if (e.stageId === stageId) e.stageId = null;
          });
        }),

      // ---- people
      addPerson: ({ name, email, projectIds }) =>
        update((d) => {
          const id = uid();
          d.people.push({ id, name, email, av: AVATAR_CLASSES[d.people.length % AVATAR_CLASSES.length] });
          projectIds.forEach((pid) => {
            const p = findProject(d, pid);
            if (p && !p.members.includes(id)) p.members.push(id);
          });
        }),
      removePerson: (id) =>
        update((d) => {
          d.people = d.people.filter((p) => p.id !== id);
          d.projects.forEach((p) => (p.members = p.members.filter((m) => m !== id)));
          d.tasks.forEach((t) => {
            if (t.assignee === id) t.assignee = null;
          });
        }),

      // ---- calendar
      saveEvent: (ev) =>
        update((d) => {
          const i = d.events.findIndex((e) => e.id === ev.id);
          if (i >= 0) d.events[i] = ev;
          else d.events.push({ ...ev, id: uid() });
        }),
      deleteEvent: (id) => update((d) => void (d.events = d.events.filter((e) => e.id !== id))),

      // ---- time tracking
      startTimer: ({ task, projectId, stageId }) =>
        update((d) => void (d.timer = { active: true, task, projectId, stageId, startedAt: Date.now(), accumulated: 0 })),
      pauseTimer: () =>
        update((d) => {
          if (!d.timer.startedAt) return;
          d.timer.accumulated += (Date.now() - d.timer.startedAt) / 1000;
          d.timer.startedAt = null;
        }),
      resumeTimer: () => update((d) => void (d.timer.startedAt = Date.now())),
      stopTimer: () =>
        update((d) => {
          const t = d.timer;
          if (!t.active) return;
          const secs = t.accumulated + (t.startedAt ? (Date.now() - t.startedAt) / 1000 : 0);
          const minutes = Math.max(1, Math.round(secs / 60));
          d.entries.push({ id: uid(), task: t.task, projectId: t.projectId, stageId: t.stageId || null, minutes, date: todayStr(), createdAt: Date.now() });
          d.timer = { active: false };
        }),
      discardTimer: () => update((d) => void (d.timer = { active: false })),
      addEntry: (e) => update((d) => void d.entries.push({ id: uid(), createdAt: Date.now(), ...e })),
      deleteEntry: (id) => update((d) => void (d.entries = d.entries.filter((e) => e.id !== id))),

      // ---- notifications
      markRead: (id) => update((d) => void (d.notifications.find((n) => n.id === id).read = true)),
      toggleRead: (id) =>
        update((d) => {
          const n = d.notifications.find((x) => x.id === id);
          n.read = !n.read;
        }),
      markAllRead: () => update((d) => d.notifications.forEach((n) => (n.read = true))),
      deleteNotification: (id) => update((d) => void (d.notifications = d.notifications.filter((n) => n.id !== id))),
    };
  }, [update]);

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);

// ---------------------------------------------------------------------------
// Selectors (pure helpers over state)
// ---------------------------------------------------------------------------
export const getMe = (s) => s.people.find((p) => p.id === s.meId);
export const getPerson = (s, id) => s.people.find((p) => p.id === id);
export const getProject = (s, id) => s.projects.find((p) => p.id === id);

export function projectStats(s, projectId) {
  const tasks = s.tasks.filter((t) => t.projectId === projectId);
  const done = tasks.filter((t) => t.status === 'done').length;
  return { total: tasks.length, done, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

export function taskStats(s) {
  const done = s.tasks.filter((t) => t.status === 'done').length;
  return { total: s.tasks.length, done, left: s.tasks.length - done, pct: s.tasks.length ? Math.round((done / s.tasks.length) * 100) : 0 };
}

export function projectMinutes(s, projectId) {
  return s.entries.filter((e) => e.projectId === projectId).reduce((a, e) => a + e.minutes, 0);
}

export function weekMinutes(s) {
  const ws = weekStart(todayStr());
  return s.entries.filter((e) => e.date >= ws && e.date <= todayStr()).reduce((a, e) => a + e.minutes, 0);
}

// Cost breakdown rows for a project
export function costBreakdown(s, project) {
  const rows = project.stages.map((st) => {
    const actMin = s.entries.filter((e) => e.projectId === project.id && e.stageId === st.id).reduce((a, e) => a + e.minutes, 0);
    const act = actMin / 60;
    return { ...st, act, estCost: st.rate * st.est, actCost: st.rate * act };
  });
  const unstagedMin = s.entries
    .filter((e) => e.projectId === project.id && !project.stages.some((st) => st.id === e.stageId))
    .reduce((a, e) => a + e.minutes, 0);
  const total = rows.reduce(
    (a, r) => ({ est: a.est + r.est, act: a.act + r.act, estCost: a.estCost + r.estCost, actCost: a.actCost + r.actCost }),
    { est: 0, act: 0, estCost: 0, actCost: 0 },
  );
  return { rows, unstaged: unstagedMin / 60, total: { ...total, act: total.act + unstagedMin / 60 } };
}

export function projectSpend(s, project) {
  return costBreakdown(s, project).total.actCost;
}

export function upcomingDeadlines(s, limit = 3) {
  const t = todayStr();
  return s.tasks
    .filter((x) => x.status !== 'done' && x.due && diffDays(x.due, t) >= 0)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
    .slice(0, limit);
}
