import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapIcon, Filter, Check, Plus, Crosshair, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useProjects } from '../../hooks/useProjects';
import { useTeams } from '../../hooks/useTeams';
import { useRoadmapItems } from '../../hooks/useRoadmapItems';
import { RoadmapItem } from '../../types/database';
import { SidebarToggle } from '../layout/SidebarToggle';
import { ConfirmModal } from '../common/ConfirmModal';
import { RoadmapItemModal } from './RoadmapItemModal';
import { RoadmapTimeline, computeTimelineRange, isScheduled } from './RoadmapTimeline';
import { diffInDays, startOfToday, TimeTier } from '../../lib/time';

type Zoom = 'month' | 'quarter' | 'annual';

const ZOOM_LEVELS: Zoom[] = ['month', 'quarter', 'annual'];

/**
 * Quarters and years follow the fiscal calendar (1 July - 30 June), so the
 * axis tiers are fiscal ones, not calendar ones. Months stay on the axis at
 * every zoom; `rangeTier` is what the visible window snaps outward to.
 */
const ZOOM_CONFIG: Record<Zoom, { pxPerDay: number; tiers: TimeTier[]; rangeTier: TimeTier }> = {
  month: { pxPerDay: 6, tiers: ['quarter', 'month'], rangeTier: 'month' },
  quarter: { pxPerDay: 2.2, tiers: ['year', 'quarter', 'month'], rangeTier: 'year' },
  annual: { pxPerDay: 1, tiers: ['year', 'quarter', 'month'], rangeTier: 'year' },
};

const PREFS_KEY = 'rvlt-roadmap-view-prefs';

interface RoadmapPrefs {
  zoom: Zoom;
  collapsedProjectIds: string[];
}

const loadPrefs = (): RoadmapPrefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        zoom: ZOOM_LEVELS.includes(parsed.zoom) ? parsed.zoom : 'month',
        collapsedProjectIds: Array.isArray(parsed.collapsedProjectIds) ? parsed.collapsedProjectIds : [],
      };
    }
  } catch {
    // Corrupt or unavailable storage just falls back to defaults.
  }
  return { zoom: 'month', collapsedProjectIds: [] };
};

export const RoadmapView: React.FC = () => {
  const { currentWorkspace, currentUser, userRole } = useApp();
  const isAdmin = userRole === 'admin' || currentWorkspace?.created_by === currentUser?.id;

  const { projects, isLoading: isLoadingProjects } = useProjects({ workspaceId: currentWorkspace?.id });
  const { teams } = useTeams(currentWorkspace?.id);
  const {
    roadmapItems,
    isLoading: isLoadingItems,
    createRoadmapItemAsync,
    updateRoadmapItemAsync,
    toggleRoadmapItemDone,
    reorderRoadmapItems,
    deleteRoadmapItemAsync,
  } = useRoadmapItems({ workspaceId: currentWorkspace?.id });

  const initialPrefs = useRef(loadPrefs()).current;
  const [zoom, setZoom] = useState<Zoom>(initialPrefs.zoom);
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<string[]>(initialPrefs.collapsedProjectIds);

  const [selectedTeamId, setSelectedTeamId] = useState<string>('all');
  const [isTeamMenuOpen, setIsTeamMenuOpen] = useState(false);
  const teamMenuRef = useRef<HTMLDivElement>(null);

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null);
  const [modalProjectId, setModalProjectId] = useState<string | undefined>(undefined);

  const [itemPendingDelete, setItemPendingDelete] = useState<RoadmapItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isUnscheduledOpen, setIsUnscheduledOpen] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ zoom, collapsedProjectIds }));
    } catch {
      // Storage being unavailable must not break the view.
    }
  }, [zoom, collapsedProjectIds]);

  useEffect(() => {
    if (!isTeamMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (teamMenuRef.current && !teamMenuRef.current.contains(e.target as Node)) {
        setIsTeamMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isTeamMenuOpen]);

  const visibleProjects = useMemo(() => {
    const list = projects || [];
    const scoped = selectedTeamId === 'all' ? list : list.filter(p => p.team_id === selectedTeamId);
    return [...scoped].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, selectedTeamId]);

  const visibleProjectIds = useMemo(() => new Set(visibleProjects.map(p => p.id)), [visibleProjects]);

  const visibleItems = useMemo(
    () => (roadmapItems || []).filter(i => visibleProjectIds.has(i.project_id)),
    [roadmapItems, visibleProjectIds]
  );

  const scheduledItems = useMemo(() => visibleItems.filter(isScheduled), [visibleItems]);
  const unscheduledItems = useMemo(() => visibleItems.filter(i => !isScheduled(i)), [visibleItems]);

  const { pxPerDay, tiers, rangeTier } = ZOOM_CONFIG[zoom];

  // Only scheduled tasks appear on the track, so only they define the window.
  const { rangeStart, rangeEnd } = useMemo(
    () => computeTimelineRange(scheduledItems, rangeTier),
    [scheduledItems, rangeTier]
  );

  const itemsByProject = useMemo(() => {
    const grouped: Record<string, RoadmapItem[]> = {};
    for (const project of visibleProjects) grouped[project.id] = [];
    for (const item of scheduledItems) {
      if (grouped[item.project_id]) grouped[item.project_id].push(item);
    }
    return grouped;
  }, [visibleProjects, scheduledItems]);

  const scrollToToday = () => {
    const container = scrollRef.current;
    if (!container) return;
    const offset = diffInDays(rangeStart, startOfToday()) * pxPerDay;
    container.scrollTo({ left: Math.max(0, offset - 120), behavior: 'smooth' });
  };

  const openCreateModal = (projectId?: string) => {
    setEditingItem(null);
    setModalProjectId(projectId);
    setIsItemModalOpen(true);
  };

  const openEditModal = (item: RoadmapItem) => {
    setEditingItem(item);
    setModalProjectId(item.project_id);
    setIsItemModalOpen(true);
  };

  const handleToggleCollapse = (projectId: string) => {
    setCollapsedProjectIds(prev =>
      prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId]
    );
  };

  const handleReorder = (orderedIds: string[]) => {
    reorderRoadmapItems(orderedIds.map((id, index) => ({ id, position: index })));
  };

  const handleConfirmDelete = async () => {
    if (!itemPendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteRoadmapItemAsync(itemPendingDelete.id);
      setItemPendingDelete(null);
    } catch (err) {
      console.error('Failed to delete roadmap task:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const isLoading = isLoadingProjects || isLoadingItems;
  const doneCount = visibleItems.filter(i => i.is_completed).length;

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative font-sans">
      {/* Toolbar */}
      <div className="px-3 sm:px-6 py-2.5 sm:py-3 bg-transparent flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <SidebarToggle />
          <div className="flex items-center space-x-2">
            <MapIcon className="w-4 h-4 text-accent-primary" />
            <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
              Roadmap
            </span>
          </div>
          <span className="text-[11px] text-text-tertiary font-mono">
            {doneCount}/{visibleItems.length} done
          </span>

          {/* Team filter */}
          <div className="relative" ref={teamMenuRef}>
            <button
              onClick={() => setIsTeamMenuOpen(!isTeamMenuOpen)}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-bg-surface-raised hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary border border-transparent text-xs transition-colors"
            >
              <Filter className="w-3 h-3" />
              <span>
                {selectedTeamId === 'all'
                  ? 'All Teams'
                  : teams?.find(t => t.id === selectedTeamId)?.name || 'Team'}
              </span>
            </button>
            {isTeamMenuOpen && (
              <div className="absolute left-0 mt-1 w-44 bg-bg-surface-raised border border-transparent rounded-md shadow-lg py-1 z-30">
                <button
                  onClick={() => { setSelectedTeamId('all'); setIsTeamMenuOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-bg-surface-hover ${selectedTeamId === 'all' ? 'text-accent-primary font-medium' : 'text-text-secondary'}`}
                >
                  <span>All Teams</span>
                  {selectedTeamId === 'all' && <Check className="w-3.5 h-3.5" />}
                </button>
                {(teams || []).map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedTeamId(t.id); setIsTeamMenuOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-bg-surface-hover ${selectedTeamId === t.id ? 'text-accent-primary font-medium' : 'text-text-secondary'}`}
                  >
                    <span className="truncate">{t.name}</span>
                    {selectedTeamId === t.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={scrollToToday}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-bg-surface-raised hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary text-xs transition-colors"
            title="Scroll to today"
          >
            <Crosshair className="w-3 h-3" />
            <span className="hidden sm:inline">Today</span>
          </button>

          {/* Zoom */}
          <div className="flex items-center rounded-full bg-bg-surface-raised p-0.5">
            {ZOOM_LEVELS.map(z => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium capitalize transition-colors ${
                  zoom === z ? 'bg-bg-surface-hover text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
                }`}
                title={`${z} view`}
              >
                {z}
              </button>
            ))}
          </div>

          {isAdmin && (
            <button
              onClick={() => openCreateModal()}
              disabled={visibleProjects.length === 0}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-accent-primary hover:bg-accent-primary-hover text-button-text text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Task</span>
              <span className="sm:hidden">New</span>
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex-1 p-12 text-center text-xs text-text-secondary">Loading roadmap...</div>
      ) : visibleProjects.length === 0 ? (
        <div className="flex-1 p-12 text-center space-y-3">
          <MapIcon className="w-8 h-8 text-text-tertiary mx-auto" />
          <h3 className="text-sm font-semibold text-text-primary font-karla">Nothing to plan yet</h3>
          <p className="text-xs text-text-secondary max-w-sm mx-auto">
            The roadmap groups planning tasks under projects. Create a project first,
            then add the tasks you intend to ship.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 px-3 sm:px-6 pb-3 sm:pb-4">
          <RoadmapTimeline
            projects={visibleProjects}
            itemsByProject={itemsByProject}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            pxPerDay={pxPerDay}
            tiers={tiers}
            isAdmin={isAdmin}
            collapsedProjectIds={collapsedProjectIds}
            onToggleCollapse={handleToggleCollapse}
            onToggleDone={item => toggleRoadmapItemDone({ id: item.id, is_completed: !item.is_completed })}
            onEdit={openEditModal}
            onDelete={setItemPendingDelete}
            onReorder={handleReorder}
            onAddToProject={openCreateModal}
            scrollRef={scrollRef}
          />

          {/* Unscheduled tray — tasks with no dates would otherwise be invisible */}
          {unscheduledItems.length > 0 && (
            <div className="shrink-0 mt-2 border-t border-border pt-2">
              <button
                onClick={() => setIsUnscheduledOpen(!isUnscheduledOpen)}
                className="flex items-center space-x-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider hover:text-text-secondary transition-colors"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${isUnscheduledOpen ? '' : '-rotate-90'}`} />
                <span>Unscheduled ({unscheduledItems.length})</span>
              </button>

              {isUnscheduledOpen && (
                <div className="mt-1.5 max-h-32 overflow-y-auto no-scrollbar scrollbar-none space-y-0.5">
                  {unscheduledItems.map(item => {
                    const project = visibleProjects.find(p => p.id === item.project_id);
                    return (
                      <div
                        key={item.id}
                        className="group flex items-center space-x-2 px-2 py-1 rounded-sm hover:bg-bg-surface-raised/60"
                      >
                        <span
                          className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center ${
                            item.is_completed
                              ? 'bg-status-success/15 text-status-success'
                              : 'border border-border-strong text-transparent'
                          }`}
                        >
                          <Check className="w-2.5 h-2.5" />
                        </span>
                        <span className={`text-xs truncate ${item.is_completed ? 'text-text-secondary' : 'text-text-primary'}`}>
                          {item.title}
                        </span>
                        <span className="text-[10px] text-text-tertiary truncate shrink-0">
                          {project?.name}
                        </span>
                        {isAdmin && (
                          <span className="flex items-center shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditModal(item)}
                              className="p-1 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover"
                              title="Schedule this task"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setItemPendingDelete(item)}
                              className="p-1 rounded-full text-text-tertiary hover:text-status-error hover:bg-bg-surface-hover"
                              title="Delete task"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 pl-3 text-[10px] text-text-tertiary">
            <span className="flex items-center space-x-1.5">
              <span className="w-4 h-2 rounded-full bg-accent-primary" />
              <span>Planned</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-4 h-2 rounded-full bg-status-error/20 border border-status-error/40" />
              <span>Past target</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-4 h-2 rounded-full bg-bg-surface-hover" />
              <span>Done</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rotate-45 bg-accent-primary" />
              <span>Milestone (target date only)</span>
            </span>
          </div>
        </div>
      )}

      <RoadmapItemModal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        projects={visibleProjects}
        item={editingItem}
        defaultProjectId={modalProjectId}
        onCreate={createRoadmapItemAsync}
        onUpdate={updateRoadmapItemAsync}
      />

      <ConfirmModal
        isOpen={!!itemPendingDelete}
        title="Delete roadmap task"
        message={`"${itemPendingDelete?.title || ''}" will be removed from the roadmap. This cannot be undone.`}
        confirmText="Delete"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setItemPendingDelete(null)}
      />
    </div>
  );
};
