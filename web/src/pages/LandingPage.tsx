/**
 * @author eLeet Coderz (Team 3) - matches landing.html (the wireframe's AI-assistant copy is replaced: no
 *   requirement defines an AI assistant, so it is out of scope per the team README)
 * @description The public home page: header with Features / Mission links, the "Forge great projects,
 *   together." hero with a preview of the app, the mission statement, the six-feature grid, the sign-up
 *   call to action and the footer.
 * @traces SE-FR-16, SE-FR-21, SE-FR-26, SE-FR-01, SE-FR-04, SE-FR-19, SE-NFR-05
 */
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { Icon } from '../shared/ui';

const FEATURES = [
  { icon: 'folder', tone: 'bg-accent-deep text-accent', title: 'Project details', text: 'Keep goals, tasks and status for every project in one organized place.' },
  { icon: 'calendar', tone: 'bg-warn/15 text-warn', title: 'Deadlines', text: 'See what is due and when, with calendar views, soft deadlines and timely reminders.' },
  { icon: 'users', tone: 'bg-info/15 text-info', title: 'Team', text: 'Assign tasks, mention teammates and see who is working on what.' },
  { icon: 'dollar', tone: 'bg-ok/15 text-ok', title: 'Costs', text: 'Track bids, budgets, stage costs and expenses to the cent and stay within budget.' },
  { icon: 'chart', tone: 'bg-danger/15 text-danger', title: 'Charts', text: 'Understand progress and time spent at a glance with clear visual reports.' },
  { icon: 'clock', tone: 'bg-brand/15 text-brand', title: 'Time tracking', text: 'Start, pause and stop a timer on your tasks and compare estimated with actual hours.' },
];

const MOCK_NAV = ['Home', 'Projects', 'Tasks', 'Charts', 'Cost', 'People', 'Calendar'];

function Brand({ size = 'h-9', text = 'text-[22px]' }: { size?: string; text?: string }) {
  return (
    <span className="flex items-center gap-3">
      <img src="/logo.png" alt="" className={`mx-[5.5px] block w-auto ${size}`} />
      <span className={`font-bold tracking-[-0.02em] text-gold ${text}`}>ProjectForge</span>
    </span>
  );
}

function AppPreview() {
  return (
    <div className="w-full max-w-[648px] shrink-0 overflow-hidden rounded-card border border-line bg-surface-2 shadow-pop" aria-hidden>
      <div className="flex h-10 items-center gap-2 border-b border-line bg-surface-2 px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#F87171]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FBBF24]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#34D399]" />
      </div>
      <div className="flex h-[440px]">
        <div className="hidden w-40 border-r border-line bg-surface-2 px-3 py-4 sm:block">
          <div className="mb-5 flex items-center gap-2 px-1">
            <img src="/logo.png" alt="" className="h-6 w-auto" />
            <span className="text-[15px] font-bold text-gold">ProjectForge</span>
          </div>
          {MOCK_NAV.map((item, i) => (
            <div key={item} className={`mb-0.5 flex h-8 items-center gap-2 rounded-lg px-2 text-xs ${i === 0 ? 'bg-accent-deep font-semibold text-accent-tint' : 'font-medium text-nav'}`}>
              <span className={`h-3 w-3 rounded-[3px] ${i === 0 ? 'bg-accent' : 'bg-line-strong'}`} />
              {item}
            </div>
          ))}
        </div>
        <div className="flex-1 bg-canvas p-5">
          <p className="text-[15px] font-bold text-ink">Good morning, Jordan</p>
          <p className="mt-0.5 text-[11px] text-muted">Tasks due today</p>
          <div className="mt-4 flex gap-3">
            {[['Tasks done', '64%', 'bg-brand', 64], ['Time tracked', '12h 30m', '', 0], ['Budget used', '48%', 'bg-ok', 48]].map(([label, value, bar, pct]) => (
              <div key={label as string} className="flex-1 rounded-btn border border-line bg-surface p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-muted">{label}</p>
                <p className="mt-1 text-xl font-bold text-ink">{value}</p>
                {bar ? <div className="mt-1.5 h-1.5 rounded-full bg-line"><div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${pct}%` }} /></div> : null}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-3">
            <div className="flex-1 rounded-btn border border-line bg-surface p-3.5">
              <p className="mb-3 text-xs font-bold text-ink">Upcoming deadlines</p>
              {[['Lab report', 'Tue', 'bg-warn/15 text-warn', false], ['Mockup', 'Thu', 'bg-info/15 text-info', false], ['Science fair', 'Done', 'bg-ok/15 text-ok', true]].map(([name, pill, tone, done]) => (
                <div key={name as string} className="mb-2.5 flex items-center gap-2 text-[11px] text-body">
                  <span className={`h-3 w-3 rounded border-[1.5px] ${done ? 'border-ok bg-ok' : 'border-line-strong'}`} />
                  {name}
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{pill}</span>
                </div>
              ))}
            </div>
            <div className="flex-1 rounded-btn border border-line bg-surface p-3.5">
              <p className="mb-3 text-xs font-bold text-ink">Task progress</p>
              <div className="flex h-[110px] items-end gap-2.5">
                {[30, 50, 100, 45, 70, 40].map((h, i) => (
                  <div key={i} className={`flex-1 rounded-t ${i === 2 || i === 5 ? 'bg-accent' : 'bg-line-strong'}`} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { user } = useAuth();
  const primaryTo = user ? '/dashboard' : '/signup';
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-20 items-center justify-between border-b border-line bg-canvas px-6 lg:px-[120px]">
        <Link to="/" aria-label="ProjectForge home"><Brand /></Link>
        <nav className="hidden items-center gap-9 md:flex" aria-label="Sections">
          <a href="#features" className="text-[15px] font-medium text-body hover:text-ink">Features</a>
          <a href="#mission" className="text-[15px] font-medium text-body hover:text-ink">Mission</a>
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <Link to="/dashboard" className="btn-primary">Open dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn text-ink hover:bg-surface">Log in</Link>
              <Link to="/signup" className="btn-primary">Sign up</Link>
            </>
          )}
        </div>
      </header>

      <section className="flex flex-col items-center justify-between gap-12 bg-surface-2 px-6 py-20 lg:flex-row lg:px-[120px] lg:pb-[104px] lg:pt-24">
        <div className="w-full max-w-[520px] shrink-0">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-deep px-3.5 py-1.5 text-[13px] font-semibold text-accent-tint">
            <span className="h-2 w-2 rounded-full bg-accent" /> Built for student &amp; team projects
          </span>
          <h1 className="mt-6 text-5xl font-extrabold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[56px]">
            Forge great projects, <span className="text-gold">together.</span>
          </h1>
          <p className="mt-6 text-lg leading-[1.65] text-body">
            ProjectForge brings project details, deadlines, team members, costs, hours and charts into one clear workspace, so your team always knows what's next.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to={primaryTo} className="btn-primary h-[52px] rounded-xl px-7 text-base">{user ? 'Go to your dashboard' : 'Sign up free'}</Link>
            <Link to="/login" className="btn-secondary h-[52px] rounded-xl px-7 text-base">Log in</Link>
          </div>
          <p className="mt-5 text-sm text-muted">No credit card required.</p>
        </div>
        <AppPreview />
      </section>

      <section id="mission" className="bg-canvas px-6 py-[104px] text-center lg:px-[240px]">
        <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-accent">Our mission</p>
        <h2 className="mx-auto mt-4 max-w-[760px] text-[40px] font-extrabold leading-[1.2] tracking-[-0.02em]">Make project management simple, visible and shared by everyone on the team.</h2>
        <p className="mx-auto mt-5 max-w-[880px] text-[19px] leading-[1.7] text-body">
          We believe good work happens when everyone can see the plan. ProjectForge turns scattered notes, spreadsheets and chats into a single place to organize, track and deliver projects on time and on budget.
        </p>
      </section>

      <section id="features" className="bg-surface-2 px-6 py-24 lg:px-[120px]">
        <div className="text-center">
          <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-accent">Features</p>
          <h2 className="mt-4 text-[40px] font-extrabold tracking-[-0.02em]">Everything your project needs</h2>
          <p className="mx-auto mt-4 max-w-[560px] text-lg text-body">Six essentials, designed to work together from the first task to the final delivery.</p>
        </div>
        <div className="mx-auto mt-14 grid max-w-[1200px] gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card px-6 py-7">
              <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${f.tone}`}><Icon name={f.icon} className="h-5 w-5" /></span>
              <h3 className="mt-5 text-[19px] font-bold">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-[1.6] text-body">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-canvas px-6 py-24 lg:px-[120px]">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-8 rounded-[24px] border border-[#4B3F96] bg-[#2D2766] px-10 py-14 md:flex-row md:items-center lg:px-[72px] lg:py-16">
          <div className="max-w-[620px]">
            <h2 className="text-4xl font-extrabold leading-[1.2] tracking-[-0.02em] text-[#F1F4FF]">Ready to forge your next project?</h2>
            <p className="mt-3 text-[17px] text-[#CFCBF2]">Create your account and set up your first project in minutes.</p>
          </div>
          <div className="flex gap-3">
            <Link to={primaryTo} className="btn-primary">{user ? 'Open dashboard' : 'Sign up'}</Link>
            <Link to="/login" className="btn border-[#8A7FD6] text-[#F1F4FF] hover:bg-white/5">Log in</Link>
          </div>
        </div>
      </section>

      <footer className="flex flex-col items-center justify-between gap-6 border-t border-line bg-canvas px-6 py-10 md:flex-row lg:px-[120px]">
        <Brand size="h-[30px]" text="text-lg" />
        <nav className="flex gap-8 text-sm text-body" aria-label="Footer">
          <a href="#features" className="hover:text-ink">Features</a>
          <a href="#mission" className="hover:text-ink">Mission</a>
          <Link to="/login" className="hover:text-ink">Log in</Link>
          <Link to="/signup" className="hover:text-ink">Sign up</Link>
        </nav>
        <p className="text-sm text-muted">© 2026 ProjectForge · CS 3354 Team 3</p>
      </footer>
    </div>
  );
}
