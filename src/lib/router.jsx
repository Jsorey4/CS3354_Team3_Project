// Tiny dependency-free client router (History API).
// Vercel rewrites every path to index.html (see vercel.json), so deep links work.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const RouterContext = createContext(null);

const readLocation = () => ({
  pathname: window.location.pathname,
  search: window.location.search,
  hash: window.location.hash,
});

export function Router({ children }) {
  const [loc, setLoc] = useState(readLocation);

  useEffect(() => {
    const onPop = () => setLoc(readLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const current = window.location.pathname + window.location.search;
    if (to === current) return;
    if (replace) window.history.replaceState(null, '', to);
    else window.history.pushState(null, '', to);
    const next = readLocation();
    setLoc(next);
    if (!next.hash) window.scrollTo(0, 0);
  }, []);

  const value = useMemo(() => ({ ...loc, navigate }), [loc, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export const useLocation = () => useContext(RouterContext);
export const useNavigate = () => useContext(RouterContext).navigate;

export function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function Link({ to, onClick, children, ...rest }) {
  const navigate = useNavigate();
  const handle = (e) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={handle} {...rest}>
      {children}
    </a>
  );
}

export function Redirect({ to }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to, navigate]);
  return null;
}
