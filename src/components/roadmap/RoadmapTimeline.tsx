import React, { useMemo, useState } from 'react';
import { ChevronDown, Check, GripVertical, Pencil, Trash2, Plus } from 'lucide-react';
import { RoadmapItem, Project } from '../../types/database';
import {
  parseDateOnly,
  startOfToday,
  diffInDays,
  addMonths,
  startOfMonth,
  endOfMonth,
  eachTierBetween,
  tierStart,
  tierNext,
  tierLabel,
  fiscalYearStart,
  formatDateShort,
  TimeTier,
} from '../../lib/time';

/** Width of the sticky project/task name column, in px. */
export const NAME_COL_WIDTH = 220;

const ROW_HEIGHT = 34;
const GROUP_HEADER_HEIGHT = 38;
const AXIS_ROW_HEIGHT = 22;

export const isScheduled = (item: RoadmapItem) => !!(item.start_date || item.target_date);

const dayBefore = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);

/**
 * The visible window: the span of every scheduled task, snapped outward to
 * whole tier boundaries so the axis always starts and ends on a real month,
 * fiscal quarter, or fiscal year. Falls back to the current period when
 * nothing is scheduled yet.
 */
export function computeTimelineRange(items: RoadmapItem[], tier: TimeTier): { rangeStart: Date; rangeEnd: Date } {
  const dates = items
    .flatMap(i => [parseDateOnly(i.start_date), parseDateOnly(i.target_date)])
    .filter((d): d is Date => !!d);

  if (dates.length === 0) {
    const today = startOfToday();
    if (tier === 'month') {
      return { rangeStart: startOfMonth(addMonths(today, -3)), rangeEnd: endOfMonth(addMonths(today, 3)) };
    }
    // Coarser zooms open on the whole current fiscal year.
    const fyStart = fiscalYearStart(today);
    return { rangeStart: fyStart, rangeEnd: dayBefore(addMonths(fyStart, 12)) };
  }

  const min = new Date(Math.min(...dates.map(d => d.getTime())));
  const max = new Date(Math.max(...dates.map(d => d.getTime())));

  let rangeStart = tierStart(min, tier);
  let rangeEnd = dayBefore(tierNext(max, tier));

  // Snapping to a month is tight, so month zoom gets a month of padding.
  if (tier === 'month') {
    rangeStart = addMonths(rangeStart, -1);
    rangeEnd = endOfMonth(addMonths(rangeEnd, 1));
  }

  return { rangeStart, rangeEnd };
}

interface RoadmapTimelineProps {
  projects: Project[];
  itemsByProject: Record<string, RoadmapItem[]>;
  rangeStart: Date;
  rangeEnd: Date;
  pxPerDay: number;
  /** Axis rows, coarsest first. The last tier is the finest granularity shown. */
  tiers: TimeTier[];
  isAdmin: boolean;
  collapsedProjectIds: string[];
  onToggleCollapse: (projectId: string) => void;
  onToggleDone: (item: RoadmapItem) => void;
  onEdit: (item: RoadmapItem) => void;
  onDelete: (item: RoadmapItem) => void;
  onReorder: (orderedIds: string[]) => void;
  onAddToProject: (projectId: string) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}

export const RoadmapTimeline: React.FC<RoadmapTimelineProps> = ({
  projects,
  itemsByProject,
  rangeStart,
  rangeEnd,
  pxPerDay,
  tiers,
  isAdmin,
  collapsedProjectIds,
  onToggleCollapse,
  onToggleDone,
  onEdit,
  onDelete,
  onReorder,
  onAddToProject,
  scrollRef,
}) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const today = startOfToday();
  const totalDays = diffInDays(rangeStart, rangeEnd) + 1;
  const trackWidth = Math.max(totalDays * pxPerDay, 320);

  const tierCells = useMemo(
    () => tiers.map(tier => ({ tier, cells: eachTierBetween(rangeStart, rangeEnd, tier) })),
    [rangeStart, rangeEnd, tiers]
  );

  // 'Jul' needs ~24px; below that the month row falls back to initials.
  const compactMonths = pxPerDay * 28 < 34;

  const offsetOf = (date: Date) => diffInDays(rangeStart, date) * pxPerDay;

  /**
   * Cell box, clamped to the track. A coarser cell can start before the range
   * or end after it — a fiscal year is only partly covered when the plan
   * begins mid-year.
   */
  const cellBox = (cellStart: Date, tier: TimeTier) => {
    const left = Math.max(0, offsetOf(cellStart));
    const right = Math.min(trackWidth, offsetOf(tierNext(cellStart, tier)));
    return { left, width: Math.max(0, right - left) };
  };

  const axisHeight = tiers.length * AXIS_ROW_HEIGHT;

  const todayOffset = offsetOf(today);
  const isTodayVisible = today >= rangeStart && today <= rangeEnd;

  const handleDrop = (targetItem: RoadmapItem) => {
    setDragOverId(null);
    const draggedId = draggingId;
    setDraggingId(null);
    if (!draggedId || draggedId === targetItem.id) return;

    const lane = itemsByProject[targetItem.project_id] || [];
    const fromIndex = lane.findIndex(i => i.id === draggedId);
    const toIndex = lane.findIndex(i => i.id === targetItem.id);
    // Dragging across projects is not supported — a task belongs to its project.
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...lane];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    onReorder(reordered.map(i => i.id));
  };

  const renderBar = (item: RoadmapItem) => {
    const start = parseDateOnly(item.start_date);
    const target = parseDateOnly(item.target_date);
    const isOverdue = !item.is_completed && !!target && target < today;

    // A single date can't span anything, so it reads as a milestone marker.
    if (!start || !target) {
      const at = target || start;
      if (!at) return null;
      const left = offsetOf(at);
      return (
        <div className="absolute inset-y-0 flex items-center" style={{ left }}>
          <div
            className={`w-2.5 h-2.5 rotate-45 shrink-0 ${
              item.is_completed
                ? 'bg-bg-surface-hover'
                : isOverdue
                  ? 'bg-status-error'
                  : 'bg-accent-primary'
            }`}
            style={{ marginLeft: -5 }}
          />
          <span
            className={`ml-2 text-[10px] whitespace-nowrap ${
              item.is_completed
                ? 'text-text-tertiary'
                : isOverdue
                  ? 'text-status-error'
                  : 'text-text-secondary'
            }`}
          >
            {formatDateShort(item.target_date || item.start_date)}
          </span>
        </div>
      );
    }

    const left = offsetOf(start);
    const width = Math.max((diffInDays(start, target) + 1) * pxPerDay, 20);
    const rangeLabel = `${formatDateShort(item.start_date)} – ${formatDateShort(item.target_date)}`;

    return (
      <div className="absolute inset-y-0 flex items-center" style={{ left, width }}>
        <div
          className={`w-full h-5 rounded-full flex items-center px-2 overflow-hidden ${
            item.is_completed
              ? 'bg-bg-surface-hover'
              : isOverdue
                ? 'bg-status-error/20 border border-status-error/40'
                : 'bg-accent-primary'
          }`}
          title={`${item.title} · ${rangeLabel}`}
        >
          {width >= 96 && (
            <span
              className={`text-[10px] font-medium truncate ${
                item.is_completed
                  ? 'text-text-tertiary'
                  : isOverdue
                    ? 'text-status-error'
                    : 'text-button-text'
              }`}
            >
              {rangeLabel}
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderProjectSummaryBar = (items: RoadmapItem[]) => {
    const dates = items
      .flatMap(i => [parseDateOnly(i.start_date), parseDateOnly(i.target_date)])
      .filter((d): d is Date => !!d);
    if (dates.length === 0) return null;

    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    const left = offsetOf(min);
    const width = Math.max((diffInDays(min, max) + 1) * pxPerDay, 8);

    return (
      <div className="absolute inset-y-0 flex items-center" style={{ left, width }}>
        <div className="w-full h-1.5 rounded-full bg-border-strong" />
      </div>
    );
  };

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto no-scrollbar scrollbar-none relative"
    >
      <div className="relative" style={{ width: NAME_COL_WIDTH + trackWidth }}>
        {/* Gridlines + today marker, behind everything, spanning full content height */}
        <div
          className="absolute top-0 bottom-0 z-0 pointer-events-none"
          style={{ left: NAME_COL_WIDTH, width: trackWidth }}
        >
          {/* Finest tier first, so quarter and year boundaries paint over month ones */}
          {[...tierCells].reverse().map(({ tier, cells }) =>
            cells.map(cell => {
              const left = offsetOf(cell);
              if (left <= 0) return null;
              return (
                <div
                  key={`grid-${tier}-${cell.toISOString()}`}
                  className={`absolute top-0 bottom-0 w-px ${tier === 'month' ? 'bg-border' : 'bg-border-strong'}`}
                  style={{ left }}
                />
              );
            })
          )}
          {isTodayVisible && (
            <div
              className="absolute top-0 bottom-0 w-px bg-accent-primary"
              style={{ left: todayOffset }}
            />
          )}
        </div>

        {/* Date axis: one row per tier, coarsest at the top, months at the bottom */}
        <div className="sticky top-0 z-30 flex bg-bg-surface" style={{ height: axisHeight }}>
          <div
            className="sticky left-0 z-40 shrink-0 bg-bg-surface flex items-end px-3 pb-1.5"
            style={{ width: NAME_COL_WIDTH }}
          >
            <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
              Project / Task
            </span>
          </div>
          <div className="relative shrink-0" style={{ width: trackWidth }}>
            {tierCells.map(({ tier, cells }, rowIndex) => {
              const isCoarsest = rowIndex === 0;
              const isMonthRow = tier === 'month';
              return cells.map(cell => {
                const { left, width } = cellBox(cell, tier);
                if (width <= 0) return null;
                const label = tierLabel(cell, tier, {
                  // Only the top row spells out the fiscal year, and only when
                  // there is no dedicated year row above it.
                  showYear: isCoarsest && tier !== 'year',
                  compact: isMonthRow && compactMonths,
                });
                // A narrow cell can't fit its label without spilling into the next.
                if (width < 14) return null;
                return (
                  <div
                    key={`label-${tier}-${cell.toISOString()}`}
                    className={`absolute flex items-center overflow-hidden ${compactMonths && isMonthRow ? 'justify-center' : 'pl-2'}`}
                    style={{ left, width, top: rowIndex * AXIS_ROW_HEIGHT, height: AXIS_ROW_HEIGHT }}
                  >
                    <span
                      className={`text-[10px] whitespace-nowrap ${
                        isCoarsest
                          ? 'font-semibold text-text-secondary'
                          : isMonthRow
                            ? 'font-medium text-text-tertiary'
                            : 'font-medium text-text-secondary'
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                );
              });
            })}
          </div>
        </div>

        {/* Swimlanes */}
        <div className="relative z-10 pb-6">
          {projects.map(project => {
            const items = itemsByProject[project.id] || [];
            const isCollapsed = collapsedProjectIds.includes(project.id);
            const doneCount = items.filter(i => i.is_completed).length;

            return (
              <div key={project.id}>
                {/* Project header row */}
                <div className="flex" style={{ height: GROUP_HEADER_HEIGHT }}>
                  <div
                    className="sticky left-0 z-20 shrink-0 bg-bg-surface flex items-center px-3 group"
                    style={{ width: NAME_COL_WIDTH }}
                  >
                    <button
                      onClick={() => onToggleCollapse(project.id)}
                      className="flex items-center space-x-1.5 min-w-0 flex-1 text-left"
                      title={isCollapsed ? 'Expand' : 'Collapse'}
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 shrink-0 text-text-tertiary transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                      />
                      <span className="text-xs font-semibold text-text-primary truncate">
                        {project.name}
                      </span>
                    </button>
                    <span className="text-[10px] text-text-tertiary shrink-0 ml-1.5 tabular-nums">
                      {doneCount}/{items.length}
                    </span>
                    {isAdmin && (
                      <button
                        onClick={() => onAddToProject(project.id)}
                        className="ml-1 p-1 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title={`Add task to ${project.name}`}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="relative shrink-0" style={{ width: trackWidth }}>
                    {renderProjectSummaryBar(items)}
                  </div>
                </div>

                {/* Task rows */}
                {!isCollapsed && items.length === 0 && (
                  <div className="flex" style={{ height: ROW_HEIGHT }}>
                    <div
                      className="sticky left-0 z-20 shrink-0 bg-bg-surface flex items-center pl-8 pr-3"
                      style={{ width: NAME_COL_WIDTH }}
                    >
                      <span className="text-[11px] text-text-tertiary italic">No tasks yet</span>
                    </div>
                    <div className="relative shrink-0" style={{ width: trackWidth }} />
                  </div>
                )}

                {!isCollapsed &&
                  items.map(item => (
                    <div
                      key={item.id}
                      className={`flex group transition-colors ${
                        draggingId === item.id ? 'opacity-40' : ''
                      } ${dragOverId === item.id ? 'bg-bg-surface-hover/60' : 'hover:bg-bg-surface-raised/40'}`}
                      style={{ height: ROW_HEIGHT }}
                      draggable={isAdmin}
                      onDragStart={e => {
                        if (!isAdmin) return;
                        setDraggingId(item.id);
                        e.dataTransfer.setData('text/plain', item.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverId(null);
                      }}
                      onDragOver={e => {
                        if (!isAdmin || !draggingId) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDragEnter={e => {
                        if (!isAdmin || !draggingId) return;
                        e.preventDefault();
                        setDragOverId(item.id);
                      }}
                      onDragLeave={e => {
                        if (e.currentTarget === e.target) setDragOverId(null);
                      }}
                      onDrop={e => {
                        if (!isAdmin) return;
                        e.preventDefault();
                        handleDrop(item);
                      }}
                    >
                      <div
                        className="sticky left-0 z-20 shrink-0 bg-bg-surface flex items-center pl-3 pr-2"
                        style={{ width: NAME_COL_WIDTH }}
                      >
                        {isAdmin ? (
                          <GripVertical className="w-3 h-3 shrink-0 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                        ) : (
                          <span className="w-3 shrink-0" />
                        )}

                        {isAdmin ? (
                          <button
                            onClick={() => onToggleDone(item)}
                            className={`ml-1.5 w-4 h-4 rounded-full shrink-0 flex items-center justify-center transition-colors ${
                              item.is_completed
                                ? 'bg-status-success/15 text-status-success'
                                : 'border border-border-strong text-transparent hover:border-text-secondary'
                            }`}
                            title={item.is_completed ? 'Mark as not done' : 'Mark as done'}
                          >
                            <Check className="w-2.5 h-2.5" />
                          </button>
                        ) : (
                          <span
                            className={`ml-1.5 w-4 h-4 rounded-full shrink-0 flex items-center justify-center ${
                              item.is_completed
                                ? 'bg-status-success/15 text-status-success'
                                : 'border border-border-strong text-transparent'
                            }`}
                          >
                            <Check className="w-2.5 h-2.5" />
                          </span>
                        )}

                        <span
                          className={`ml-2 text-xs truncate min-w-0 flex-1 ${
                            item.is_completed ? 'text-text-secondary' : 'text-text-primary'
                          }`}
                          title={item.title}
                        >
                          {item.title}
                        </span>

                        {isAdmin && (
                          <span className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity bg-bg-surface pl-1">
                            <button
                              onClick={() => onEdit(item)}
                              className="p-1 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover"
                              title="Edit task"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => onDelete(item)}
                              className="p-1 rounded-full text-text-tertiary hover:text-status-error hover:bg-bg-surface-hover"
                              title="Delete task"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </span>
                        )}
                      </div>

                      <div className="relative shrink-0" style={{ width: trackWidth }}>
                        {renderBar(item)}
                      </div>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
