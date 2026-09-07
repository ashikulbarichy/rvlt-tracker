import React, { useState, useEffect, useCallback } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { RoadmapItem, Project } from '../../types/database';
import { CustomSelect } from '../common/CustomSelect';
import { DatePicker } from '../common/DatePicker';

interface RoadmapItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  /** Present when editing; omit to create. */
  item?: RoadmapItem | null;
  /** Pre-selected project for a fresh task. */
  defaultProjectId?: string;
  onCreate: (values: { project_id: string; title: string; start_date: string | null; target_date: string | null }) => Promise<unknown>;
  onUpdate: (values: { id: string; project_id: string; title: string; start_date: string | null; target_date: string | null }) => Promise<unknown>;
}

export const RoadmapItemModal: React.FC<RoadmapItemModalProps> = ({
  isOpen,
  onClose,
  projects,
  item,
  defaultProjectId,
  onCreate,
  onUpdate,
}) => {
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      const raf = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setIsVisible(false);
    const timer = setTimeout(() => setIsRendered(false), 220);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Seed the form each time the modal opens, so create and edit don't leak into each other.
  useEffect(() => {
    if (!isOpen) return;
    setTitle(item?.title || '');
    setProjectId(item?.project_id || defaultProjectId || projects[0]?.id || '');
    setStartDate(item?.start_date || '');
    setTargetDate(item?.target_date || '');
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [isOpen, item, defaultProjectId, projects]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 220);
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isRendered && !isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !projectId) return;

    if (startDate && targetDate && startDate > targetDate) {
      setErrorMessage('The start date must be on or before the target date.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const values = {
      project_id: projectId,
      title: title.trim(),
      start_date: startDate || null,
      target_date: targetDate || null,
    };

    try {
      if (item) {
        await onUpdate({ id: item.id, ...values });
      } else {
        await onCreate(values);
      }
      handleClose();
    } catch (err: any) {
      console.error('Failed to save roadmap task:', err);
      setErrorMessage(err?.message || 'Failed to save this task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const projectOptions = projects.map(p => ({ value: p.id, label: p.name }));

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-[1px] transition-opacity duration-200 ease-out font-sans ${isVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) handleClose();
      }}
    >
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
        <div className={`w-screen max-w-full sm:max-w-md bg-bg-surface border-l border-border shadow-2xl flex flex-col h-full overflow-hidden transform transition-transform duration-200 ease-out ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between shrink-0 bg-bg-surface">
            <h2 className="text-sm font-semibold text-text-primary">
              {item ? 'Edit Roadmap Task' : 'New Roadmap Task'}
            </h2>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 sm:p-6 bg-bg-surface overflow-y-auto no-scrollbar scrollbar-none flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              {errorMessage && (
                <div className="p-2.5 bg-status-error/10 border border-transparent rounded-sm text-xs text-status-error flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Title *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="What are we planning to ship?"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full text-xs bg-bg-surface-raised border border-transparent rounded-sm px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Project *</label>
                {projectOptions.length > 0 ? (
                  <CustomSelect
                    value={projectId}
                    options={projectOptions}
                    onChange={setProjectId}
                    size="sm"
                    className="w-full"
                  />
                ) : (
                  <p className="text-xs text-text-tertiary">
                    Create a project first — roadmap tasks live under one.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Start date</label>
                  <DatePicker value={startDate} onChange={setStartDate} placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Target date</label>
                  <DatePicker value={targetDate} onChange={setTargetDate} placeholder="Optional" />
                </div>
              </div>

              <p className="text-[11px] text-text-tertiary leading-relaxed">
                With both dates the task draws as a bar across the timeline. With
                only a target date it shows as a milestone marker. With neither it
                waits in Unscheduled until you give it dates.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-5">
              <button
                type="button"
                onClick={handleClose}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !title.trim() || !projectId}
                className="px-3.5 py-2 rounded-full bg-accent-primary hover:bg-accent-primary-hover text-button-text text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Saving...' : item ? 'Save changes' : 'Create task'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
