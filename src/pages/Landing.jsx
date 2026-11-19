import { Link } from '../lib/router';
import { useStore } from '../lib/store';
import { Logo } from '../components/ui';

const scrollTo = (id) => (e) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const FEATURES = [
  { title: 'Project details', text: 'Keep goals, tasks and status for every project in one organized place.', bg: '#2A2352', stroke: '#A78BFA', icon: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />, to: '/projects' },
  { title: 'Deadlines', text: 'See what is due and when, with calendar views and timely reminders.', bg: '#3A2E12', stroke: '#F5B942', icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>, to: '/calendar' },
  { title: 'Team', text: 'Assign tasks, mention teammates and see who is working on what.', bg: '#14304A', stroke: '#7DC4F5', icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>, to: '/people' },
  { title: 'Costs', text: 'Track estimated versus actual spending and stay within budget.', bg: '#123A2E', stroke: '#34D399', icon: <><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>, to: '/cost' },
  { title: 'Charts', text: 'Understand progress and time spent at a glance with clear visual reports.', bg: '#3E1E3A', stroke: '#F472B6', icon: <><path d="M3 3v18h18" /><path d="M7 16v-5M12 16V8M17 16v-3" /></>, to: '/charts' },
  { title: 'AI assistant', text: 'Turn an idea into a task plan you can review, edit and start from.', bg: '#26305A', stroke: '#8FA8FF', icon: <><path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9L11 3Z" /><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" /></>, to: '/tasks' },
];

export default function Landing() {
  const { state } = useStore();
  const loggedIn = state.auth.loggedIn;
  const appLink = (to) => (loggedIn ? to : '/signup');

  return (
    <div className="pf pg-landing">
      <header className="header">
        <Link className="logo" to="/">
          <Logo className="logo-img" />
          <span className="logo-text">ProjectForge</span>
        </Link>
        <nav className="nav">
          <a href="#features" onClick={scrollTo('features')}>Features</a>
          <a href="#mission" onClick={scrollTo('mission')}>Mission</a>
        </nav>
        <div className="header-actions">
          {loggedIn ? (
            <Link className="btn btn-primary" to="/dashboard">Open dashboard</Link>
          ) : (
            <>
              <Link className="btn btn-ghost" to="/login">Log in</Link>
              <Link className="btn btn-primary" to="/signup">Sign up</Link>
            </>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="badge"><span className="badge-dot" />Built for student &amp; team projects</div>
          <h1>Forge great projects, <span>together.</span></h1>
          <p>ProjectForge brings project details, deadlines, team members, costs, charts and an AI assistant into one clear workspace, so your team always knows what&apos;s next.</p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" to="/signup">Sign up free</Link>
            <Link className="btn btn-secondary btn-lg" to="/login">Log in</Link>
          </div>
          <div className="hero-note">No credit card required.</div>
        </div>
        <Link className="mock" to={loggedIn ? '/dashboard' : '/login'} aria-label="Open the dashboard">
          <div className="mock-bar">
            <div className="dot" style={{ background: '#F87171' }} />
            <div className="dot" style={{ background: '#FBBF24' }} />
            <div className="dot" style={{ background: '#34D399' }} />
          </div>
          <div className="mock-body">
            <div className="mock-side">
              <div className="logo">
                <Logo className="logo-img" />
                <span className="logo-text">ProjectForge</span>
              </div>
              {['Home', 'Projects', 'Tasks', 'Charts', 'Cost', 'People', 'Calendar'].map((x, i) => (
                <div key={x} className={`side-item${i === 0 ? ' active' : ''}`}><span className="side-ic" />{x}</div>
              ))}
            </div>
            <div className="mock-main">
              <div className="mock-title">Good morning, Jordan</div>
              <div className="mock-sub">Tasks due today</div>
              <div className="mock-stats">
                <div className="stat"><div className="stat-label">Tasks done</div><div className="stat-value">64%</div><div className="progress"><div className="progress-fill" style={{ width: '64%' }} /></div></div>
                <div className="stat"><div className="stat-label">Time tracked</div><div className="stat-value">12h 30m</div></div>
                <div className="stat"><div className="stat-label">Budget used</div><div className="stat-value">48%</div><div className="progress"><div className="progress-fill" style={{ width: '48%', background: '#34D399' }} /></div></div>
              </div>
              <div className="mock-row">
                <div className="card-sm" style={{ width: 210 }}>
                  <h4>Upcoming deadlines</h4>
                  <div className="task"><span className="task-box" />Lab report<span className="pill" style={{ background: '#3A2E12', color: '#F5B942' }}>Tue</span></div>
                  <div className="task"><span className="task-box" />Mockup<span className="pill" style={{ background: '#14304A', color: '#7DC4F5' }}>Thu</span></div>
                  <div className="task"><span className="task-box done" />Science fair<span className="pill" style={{ background: '#123A2E', color: '#34D399' }}>Done</span></div>
                </div>
                <div className="card-sm" style={{ flex: 1 }}>
                  <h4>Task progress</h4>
                  <div className="bars">
                    {[40, 62, 90, 55, 72, 48].map((h, i) => (
                      <div key={i} className={`bar${i === 2 || i === 5 ? ' hi' : ''}`} style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Link>
      </section>

      <section className="mission" id="mission">
        <div className="eyebrow">Our mission</div>
        <h2>Make project management simple, visible and shared by everyone on the team.</h2>
        <p>We believe good work happens when everyone can see the plan. ProjectForge turns scattered notes, spreadsheets and chats into a single place to organize, track and deliver projects on time and on budget.</p>
      </section>

      <section className="features" id="features">
        <div className="section-head">
          <div className="eyebrow">Features</div>
          <h2>Everything your project needs</h2>
          <p>Six essentials, designed to work together from the first task to the final delivery.</p>
        </div>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <Link key={f.title} className="feature" to={appLink(f.to)}>
              <div className="f-icon" style={{ background: f.bg }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={f.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg>
              </div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="cta-wrap">
        <div className="cta">
          <div>
            <h2>Ready to forge your next project?</h2>
            <p>Create your account and set up your first project in minutes.</p>
          </div>
          <div className="cta-actions">
            <Link className="btn btn-primary btn-lg" to="/signup">Sign up</Link>
            <Link className="btn btn-outline-white btn-lg" to="/login">Log in</Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <Link className="logo" to="/">
          <Logo className="logo-img" />
          <span className="logo-text">ProjectForge</span>
        </Link>
        <div className="footer-links">
          <a href="#features" onClick={scrollTo('features')}>Features</a>
          <a href="#mission" onClick={scrollTo('mission')}>Mission</a>
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign up</Link>
        </div>
        <div className="footer-copy">© {new Date().getFullYear()} ProjectForge</div>
      </footer>
    </div>
  );
}
