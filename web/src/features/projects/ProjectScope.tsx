/**
 * @author Saaqib Shaik
 * @description Remembers which project the user is working in (Board, Costs, People, Performance and Time
 *   pages all follow it), keeps the user's project list fresh when projects are created, changed or deleted
 *   live, and offers a compact project switcher.
 * @traces SE-FR-16, SE-FR-18, SE-NFR-10
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRealtime } from '../../services/realtimeClient';
import type { Project } from '../../shared/types';
import { projectController } from './projectController';
import { sortByCardOrder } from './model';

const KEY = 'pf_current_project';

interface ProjectScopeState {
  projects: Project[];
  loading: boolean;
  currentProjectId: string | null;
  currentProject: Project | null;
  setCurrentProjectId: (id: string) => void;
  refresh: () => Promise<void>;
}

const ScopeContext = createContext<ProjectScopeState | null>(null);

export function ProjectScopeProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProjectId, setCurrent] = useState<string | null>(() => localStorage.getItem(KEY));
  const [params] = useSearchParams();

  const refresh = useCallback(async () => {
    try {
      setProjects(sortByCardOrder(await projectController.list()));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const fromUrl = params.get('project');
    if (fromUrl && fromUrl !== currentProjectId) {
      setCurrent(fromUrl);
      localStorage.setItem(KEY, fromUrl);
    }
  }, [params, currentProjectId]);

  useEffect(() => {
    if (loading) return;
    if (projects.length === 0) return;
    if (!currentProjectId || !projects.some((p) => p.id === currentProjectId)) {
      setCurrent(projects[0].id);
      localStorage.setItem(KEY, projects[0].id);
    }
  }, [projects, currentProjectId, loading]);

  const onChange = useCallback(() => void refresh(), [refresh]);
  useRealtime('project_created', onChange);
  useRealtime('project_updated', onChange);
  useRealtime('project_deleted', onChange);
  useRealtime('membership_changed', onChange);
  useRealtime('progress', (data: { project_id: string; overall_progress_pct: number; total_tasks: number; done_tasks: number }) =>
    setProjects((list) =>
      list.map((p) => (p.id === data.project_id ? { ...p, progress_pct: data.overall_progress_pct, task_count: data.total_tasks, done_count: data.done_tasks } : p)),
    ),
  );

  const setCurrentProjectId = useCallback((id: string) => {
    setCurrent(id);
    localStorage.setItem(KEY, id);
  }, []);

  const value = useMemo<ProjectScopeState>(
    () => ({
      projects,
      loading,
      currentProjectId,
      currentProject: projects.find((p) => p.id === currentProjectId) ?? null,
      setCurrentProjectId,
      refresh,
    }),
    [projects, loading, currentProjectId, setCurrentProjectId, refresh],
  );
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useProjectScope(): ProjectScopeState {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useProjectScope must be used inside <ProjectScopeProvider>');
  return ctx;
}

export function ProjectPicker({ className = '' }: { className?: string }) {
  const { projects, currentProjectId, setCurrentProjectId } = useProjectScope();
  if (projects.length === 0) return null;
  return (
    <label className={`flex items-center gap-2 text-sm ${className}`}>
      <span className="sr-only">Project</span>
      <select className="input w-auto min-w-[14rem] py-1.5" value={currentProjectId ?? ''} onChange={(e) => setCurrentProjectId(e.target.value)} aria-label="Current project">
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.my_role}
          </option>
        ))}
      </select>
    </label>
  );
}
