// Date helpers. Dates are stored as local "YYYY-MM-DD" strings.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');

export const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayStr = () => toStr(new Date());
export const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return toStr(d);
};
export const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 86400000); // a - b
export const weekStart = (s) => addDays(s, -parse(s).getDay());
export const fmtShort = (s) => {
  const d = parse(s);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};
export const fmtRange = (a, b) => {
  const da = parse(a), db = parse(b);
  if (da.getMonth() === db.getMonth()) return `${MONTHS[da.getMonth()]} ${da.getDate()} – ${db.getDate()}, ${db.getFullYear()}`;
  return `${fmtShort(a)} – ${fmtShort(b)}, ${db.getFullYear()}`;
};

export function dueLabel(due) {
  const d = diffDays(due, todayStr());
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d < 0) return `Overdue · ${fmtShort(due)}`;
  return `Due ${fmtShort(due)}`;
}

// Short label + colour key used by deadline pills
export function duePill(due) {
  const d = diffDays(due, todayStr());
  if (d < 0) return { label: 'Overdue', tone: 'pink' };
  if (d === 0) return { label: 'Today', tone: 'gold' };
  if (d === 1) return { label: 'Tmrw', tone: 'info' };
  return { label: fmtShort(due), tone: 'purple' };
}

export const minutesToHm = (m) => {
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
};
export const minutesToClock = (m) => `${Math.floor(m / 60)}:${pad(Math.round(m % 60))}`;
export const secondsToTimer = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(Math.floor(s % 60))}`;

export const fmtTime = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)}`;
};
export const fmtTimeRange = (a, b) => {
  const apA = Number(a.split(':')[0]) >= 12 ? 'PM' : 'AM';
  const apB = Number(b.split(':')[0]) >= 12 ? 'PM' : 'AM';
  return apA === apB ? `${fmtTime(a)} – ${fmtTime(b)} ${apB}` : `${fmtTime(a)} ${apA} – ${fmtTime(b)} ${apB}`;
};
export const timeToHours = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h + m / 60;
};

export function relativeTime(ts) {
  const now = Date.now();
  const diff = (now - ts) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  const d = new Date(ts);
  const t = todayStr();
  const ds = toStr(d);
  if (diff < 3 * 3600) return `${Math.floor(diff / 3600)} hr ago`;
  if (ds === t) {
    const hh = d.getHours(), mm = d.getMinutes();
    return `Today, ${hh % 12 || 12}:${pad(mm)} ${hh >= 12 ? 'PM' : 'AM'}`;
  }
  if (ds === addDays(t, -1)) return 'Yesterday';
  return fmtShort(ds);
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
