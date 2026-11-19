// Icons lifted from the mockups. Stroke uses currentColor unless a colour is passed.
const base = (size, color, width = 2) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: color || 'currentColor',
  strokeWidth: width,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
});

export const IconHome = ({ size = 20, color }) => (
  <svg {...base(size, color)}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" /></svg>
);
export const IconFolder = ({ size = 20, color }) => (
  <svg {...base(size, color)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>
);
export const IconTasks = ({ size = 20, color }) => (
  <svg {...base(size, color)}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m8 12 3 3 5-6" /></svg>
);
export const IconChart = ({ size = 20, color }) => (
  <svg {...base(size, color)}><path d="M3 3v18h18" /><path d="M7 16v-5M12 16V8M17 16v-3" /></svg>
);
export const IconDollar = ({ size = 20, color }) => (
  <svg {...base(size, color)}><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
);
export const IconPeople = ({ size = 20, color }) => (
  <svg {...base(size, color)}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);
export const IconCalendar = ({ size = 20, color }) => (
  <svg {...base(size, color)}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
);
export const IconClock = ({ size = 20, color }) => (
  <svg {...base(size, color)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IconBell = ({ size = 20, color }) => (
  <svg {...base(size, color)}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
);
export const IconPlus = ({ size = 16, color = '#0F1424' }) => (
  <svg {...base(size, color, 2.5)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconDownload = ({ size = 16, color = '#F1F4FF' }) => (
  <svg {...base(size, color, 2.2)}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
);
export const IconCheck = ({ size = 12, color = '#0F1424', width = 3.5 }) => (
  <svg {...base(size, color, width)}><path d="m5 12 5 5 9-10" /></svg>
);
export const IconCheckCircle = ({ size = 16, color = '#34D399' }) => (
  <svg {...base(size, color, 2.5)}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>
);
export const IconChevronDown = ({ size = 16, color = '#8791B3' }) => (
  <svg {...base(size, color, 2.2)}><path d="m6 9 6 6 6-6" /></svg>
);
export const IconChevronLeft = ({ size = 16, color }) => (
  <svg {...base(size, color, 2.2)}><path d="m15 18-6-6 6-6" /></svg>
);
export const IconChevronRight = ({ size = 16, color }) => (
  <svg {...base(size, color, 2.2)}><path d="m9 18 6-6-6-6" /></svg>
);
export const IconInfo = ({ size = 14, color = '#8791B3' }) => (
  <svg {...base(size, color)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
);
export const IconX = ({ size = 16, color }) => (
  <svg {...base(size, color, 2.2)}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const IconTrash = ({ size = 16, color }) => (
  <svg {...base(size, color)}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
);
export const IconPencil = ({ size = 16, color }) => (
  <svg {...base(size, color)}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
);
export const IconPlay = ({ size = 16, color = '#0F1424' }) => (
  <svg {...base(size, color)}><path d="m7 4 13 8-13 8V4Z" fill={color} /></svg>
);
