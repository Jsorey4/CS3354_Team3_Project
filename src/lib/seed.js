// Demo data that mirrors the ProjectForge mockups.
// Dates are relative to "today" so the demo always looks current.
import { addDays, todayStr, weekStart } from './date';

export function createSeed() {
  const T = todayStr();
  const d = (n) => addDays(T, n);
  const ws = weekStart(T);
  // a date inside the current week, k days ago (never before Sunday)
  const w = (k) => (addDays(T, -k) < ws ? ws : addDays(T, -k));
  const now = Date.now();
  const at = (minsAgo) => now - minsAgo * 60000;
  const todayAt = (h, m = 0) => {
    const x = new Date();
    x.setHours(h, m, 0, 0);
    return Math.min(x.getTime(), now - 2 * 3600 * 1000 - 60000);
  };

  return {
    version: 1,
    auth: { loggedIn: false },
    meId: 'jd',
    user: {
      email: 'jordan@email.com',
      notifPrefs: { assignments: true, mentions: true, deadlines: true, updates: false },
      dashPrefs: { deadlines: true, progress: true, projects: true, time: true, cost: true },
      connections: { google: true, outlook: false, email: true },
    },
    people: [
      { id: 'jd', name: 'Jordan Diaz', av: 'av-p', email: 'jordan@email.com' },
      { id: 'ak', name: 'Alex Kim', av: 'av-i', email: 'alex@email.com' },
      { id: 'mr', name: 'Maya Rivera', av: 'av-w', email: 'maya@email.com' },
      { id: 'sl', name: 'Sam Lee', av: 'av-s', email: 'sam@email.com' },
    ],
    projects: [
      {
        id: 'sf', name: 'Science fair', category: 'School', color: 'purple', due: d(18), budget: 2000,
        members: ['jd', 'ak', 'mr'],
        stages: [
          { id: 'sf-r', name: 'Research', rate: 30, est: 8 },
          { id: 'sf-e', name: 'Experiments', rate: 35, est: 16 },
          { id: 'sf-w', name: 'Report writing', rate: 30, est: 10 },
          { id: 'sf-p', name: 'Presentation', rate: 40, est: 6 },
        ],
      },
      {
        id: 'wr', name: 'Website redesign', category: 'Work', color: 'blue', due: d(33), budget: 3000,
        members: ['jd', 'sl'],
        stages: [
          { id: 'wr-d', name: 'Discovery', rate: 35, est: 8 },
          { id: 'wr-g', name: 'Design', rate: 40, est: 12 },
          { id: 'wr-b', name: 'Build', rate: 35, est: 10 },
        ],
      },
    ],
    tasks: [
      { id: 't1', title: 'Write abstract', projectId: 'sf', status: 'todo', due: d(10), assignee: 'ak', priority: 'Medium', tags: ['writing'] },
      { id: 't2', title: 'Build display board', projectId: 'sf', status: 'todo', due: d(13), assignee: 'mr', priority: 'Medium', tags: ['design'] },
      { id: 't3', title: 'Prepare presentation slides', projectId: 'sf', status: 'todo', due: d(15), assignee: 'jd', priority: 'High', tags: ['slides'] },
      { id: 't4', title: 'Rehearse talk', projectId: 'sf', status: 'todo', due: d(17), assignee: 'jd', priority: 'Low', tags: ['presentation'] },
      { id: 't5', title: 'Lab report', projectId: 'sf', status: 'progress', due: d(0), assignee: 'jd', priority: 'High', tags: ['report', 'lab'] },
      { id: 't6', title: 'Homepage mockup', projectId: 'wr', status: 'progress', due: d(1), assignee: 'sl', priority: 'High', tags: ['design'] },
      { id: 't7', title: 'Run experiment trials', projectId: 'sf', status: 'progress', due: d(4), assignee: 'mr', priority: 'Medium', tags: ['lab'] },
      { id: 't8', title: 'Analyze results', projectId: 'sf', status: 'progress', due: d(7), assignee: 'ak', priority: 'Medium', tags: ['data'] },
      { id: 't9', title: 'Choose topic', projectId: 'sf', status: 'done', due: d(-25), doneDate: d(-25), assignee: 'jd', priority: 'Medium', tags: ['planning'] },
      { id: 't10', title: 'Write hypothesis', projectId: 'sf', status: 'done', due: d(-19), doneDate: d(-19), assignee: 'ak', priority: 'Medium', tags: ['writing'] },
      { id: 't11', title: 'Gather materials', projectId: 'sf', status: 'done', due: d(-12), doneDate: d(-12), assignee: 'mr', priority: 'Low', tags: ['lab'] },
      { id: 't13', title: 'Order supplies', projectId: 'sf', status: 'done', due: d(-16), doneDate: d(-16), assignee: 'mr', priority: 'Medium', tags: ['lab'] },
      { id: 't14', title: 'Safety approval', projectId: 'sf', status: 'done', due: d(-9), doneDate: d(-9), assignee: 'ak', priority: 'High', tags: ['admin'] },
      { id: 't15', title: 'Set up apparatus', projectId: 'sf', status: 'done', due: d(-3), doneDate: d(-3), assignee: 'mr', priority: 'Medium', tags: ['lab'] },
      { id: 't16', title: 'Stakeholder interviews', projectId: 'wr', status: 'done', due: d(-28), doneDate: d(-27), assignee: 'sl', priority: 'Medium', tags: ['research'] },
      { id: 't17', title: 'Style guide', projectId: 'wr', status: 'done', due: d(-11), doneDate: d(-12), assignee: 'jd', priority: 'Medium', tags: ['design'] },
      { id: 't18', title: 'Build components', projectId: 'wr', status: 'todo', due: d(21), assignee: 'sl', priority: 'Medium', tags: ['dev'] },
      { id: 't19', title: 'Launch checklist', projectId: 'wr', status: 'todo', due: d(31), assignee: 'jd', priority: 'Low', tags: ['launch'] },
      { id: 't12', title: 'Submit proposal', projectId: 'sf', status: 'done', due: d(-5), doneDate: d(-5), assignee: 'jd', priority: 'High', tags: ['admin'] },
    ],
    // minutes per entry; totals match the Cost & Charts mockups
    entries: [
      { id: 'e1', task: 'Literature review', projectId: 'sf', stageId: 'sf-r', minutes: 240, date: d(-30), createdAt: at(43200) },
      { id: 'e2', task: 'Background reading', projectId: 'sf', stageId: 'sf-r', minutes: 330, date: d(-24), createdAt: at(34560) },
      { id: 'e3', task: 'Set up apparatus', projectId: 'sf', stageId: 'sf-e', minutes: 300, date: d(-14), createdAt: at(20160) },
      { id: 'e4', task: 'Pilot trials', projectId: 'sf', stageId: 'sf-e', minutes: 350, date: d(-9), createdAt: at(12960) },
      { id: 'e5', task: 'Run experiment trials', projectId: 'sf', stageId: 'sf-e', minutes: 240, date: w(1), createdAt: at(1500) },
      { id: 'e6', task: 'Collect samples', projectId: 'sf', stageId: 'sf-e', minutes: 130, date: w(0), createdAt: at(60) },
      { id: 'e7', task: 'Draft methods section', projectId: 'sf', stageId: 'sf-w', minutes: 200, date: d(-11), createdAt: at(15840) },
      { id: 'e8', task: 'Lab report outline', projectId: 'sf', stageId: 'sf-w', minutes: 200, date: d(-8), createdAt: at(11520) },
      { id: 'e9', task: 'Analyze results', projectId: 'sf', stageId: 'sf-w', minutes: 170, date: w(2), createdAt: at(2900) },
      { id: 'e10', task: 'Outline talk', projectId: 'sf', stageId: 'sf-p', minutes: 180, date: d(-10), createdAt: at(14400) },
      { id: 'e11', task: 'Design slides', projectId: 'sf', stageId: 'sf-p', minutes: 195, date: d(-12), createdAt: at(17280) },
      { id: 'e12', task: 'Stakeholder interviews', projectId: 'wr', stageId: 'wr-d', minutes: 240, date: d(-35), createdAt: at(50400) },
      { id: 'e13', task: 'Project brief', projectId: 'wr', stageId: 'wr-d', minutes: 180, date: d(-20), createdAt: at(28800) },
      { id: 'e14', task: 'Moodboard', projectId: 'wr', stageId: 'wr-g', minutes: 240, date: d(-16), createdAt: at(23040) },
      { id: 'e15', task: 'Style guide', projectId: 'wr', stageId: 'wr-g', minutes: 240, date: d(-13), createdAt: at(18720) },
      { id: 'e16', task: 'Wireframes', projectId: 'wr', stageId: 'wr-g', minutes: 120, date: w(3), createdAt: at(4300) },
      { id: 'e17', task: 'Homepage mockup', projectId: 'wr', stageId: 'wr-g', minutes: 90, date: w(0), createdAt: at(120) },
      { id: 'e18', task: 'Set up repo', projectId: 'wr', stageId: 'wr-b', minutes: 180, date: d(-12), createdAt: at(17000) },
      { id: 'e19', task: 'Component library', projectId: 'wr', stageId: 'wr-b', minutes: 300, date: d(-9), createdAt: at(12900) },
    ],
    timer: { active: true, task: 'Draft brief', projectId: 'wr', stageId: 'wr-d', startedAt: now, accumulated: 2530 },
    events: [
      { id: 'ev1', title: 'Team sync', date: weekDay(ws, 3, T), allDay: false, start: '10:00', end: '11:00', color: 'gold' },
      { id: 'ev2', title: 'Advisor', date: weekDay(ws, 5, T), allDay: false, start: '14:00', end: '15:30', color: 'gold' },
    ],
    notifications: [
      { id: 'n1', type: 'assignment', parts: [{ b: 'Maya Rivera' }, ' assigned you ', { b: 'Prepare presentation slides' }], taskId: 't3', at: at(5), read: false },
      { id: 'n2', type: 'mention', parts: [{ b: 'Sam Lee' }, ' mentioned you in ', { b: 'Homepage mockup' }], taskId: 't6', at: at(60), read: false },
      { id: 'n3', type: 'deadline', parts: [{ b: 'Lab report' }, ' is due today'], taskId: 't5', at: todayAt(8), read: false },
      { id: 'n4', type: 'update', parts: [{ b: 'Alex Kim' }, ' moved ', { b: 'Analyze results' }, ' to In progress'], taskId: 't8', at: at(60 * 26), read: false },
      { id: 'n5', type: 'update', parts: [{ b: 'Maya Rivera' }, ' completed ', { b: 'Gather materials' }], taskId: 't11', at: at(60 * 24 * 12), read: true },
    ],
  };
}

// Day `dow` of the current week, but never in the past (so seeded events are upcoming).
function weekDay(ws, dow, T) {
  const x = addDays(ws, dow);
  return x < T ? addDays(x, 7) : x;
}
