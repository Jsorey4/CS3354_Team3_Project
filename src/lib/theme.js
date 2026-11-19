// Design tokens from the ProjectForge design system.
export const TONES = {
  purple: { bg: '#2A2352', fg: '#C4B5FD', dot: '#A78BFA' },
  info: { bg: '#14304A', fg: '#7DC4F5', dot: '#7DC4F5' },
  blue: { bg: '#26305A', fg: '#8FA8FF', dot: '#8FA8FF' },
  gold: { bg: '#3A2E12', fg: '#F5B942', dot: '#F5B942' },
  pink: { bg: '#3E1E3A', fg: '#F472B6', dot: '#F472B6' },
  green: { bg: '#123A2E', fg: '#34D399', dot: '#34D399' },
  gray: { bg: '#2A3358', fg: '#B4BDD9', dot: '#8791B3' },
};

export const PROJECT_COLORS = {
  purple: { main: '#A78BFA', chip: 'chip-p', label: 'Purple' },
  blue: { main: '#8FA8FF', chip: 'chip-i', label: 'Blue' },
  green: { main: '#34D399', chip: 'chip-s', label: 'Green' },
  pink: { main: '#F472B6', chip: 'chip-k', label: 'Pink' },
  gold: { main: '#F5B942', chip: 'chip-g', label: 'Gold' },
};

export const CATEGORIES = ['School', 'Personal', 'Work'];
export const CATEGORY_TONE = { School: 'purple', Work: 'info', Personal: 'green' };

export const STATUSES = [
  { key: 'todo', label: 'To Do', boardLabel: 'To-do', dot: '#8791B3', tone: 'gray', pill: 'To do' },
  { key: 'progress', label: 'In Progress', boardLabel: 'In progress', dot: '#8FA8FF', tone: 'blue', pill: 'In progress' },
  { key: 'done', label: 'Done', boardLabel: 'Completed', dot: '#34D399', tone: 'green', pill: 'Done' },
];
export const statusInfo = (k) => STATUSES.find((s) => s.key === k) || STATUSES[0];

export const PRIORITIES = ['High', 'Medium', 'Low'];
export const PRIORITY_TONE = { High: 'pink', Medium: 'gold', Low: 'gray' };

export const AVATAR_CLASSES = ['av-p', 'av-i', 'av-w', 'av-s'];

export const NOTIF_TYPES = {
  assignment: { label: 'Assignment', tone: 'purple' },
  mention: { label: 'Mention', tone: 'info' },
  deadline: { label: 'Deadline', tone: 'gold' },
  update: { label: 'Update', tone: 'blue' },
};

export const EVENT_COLORS = {
  gold: { chip: 'chip-g', label: 'Gold' },
  purple: { chip: 'chip-p', label: 'Purple' },
  blue: { chip: 'chip-i', label: 'Blue' },
  green: { chip: 'chip-s', label: 'Green' },
  pink: { chip: 'chip-k', label: 'Pink' },
};

export const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

export const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
