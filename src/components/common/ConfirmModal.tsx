import React, { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  icon?: 'trash' | 'warning' | 'alert';
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  variant = 'danger',
  icon = 'trash',
  isLoading = false,
  onConfirm,
  onCancel
}) => {
  const [isRendered, setIsRendered] = useState(false);
  const [isAnimated, setIsAnimated] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      const raf = requestAnimationFrame(() => {
        setIsAnimated(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setIsAnimated(false);
      const timer = setTimeout(() => {
        setIsRendered(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isRendered && !isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-4 transition-opacity duration-150 ease-out font-sans ${
        isAnimated ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onCancel();
      }}
    >
      <div
        className={`w-full max-w-md bg-bg-surface border border-border rounded-lg shadow-xl overflow-hidden transform transition-all duration-150 ease-out ${
          isAnimated ? 'scale-100 translate-y-0' : 'scale-95 translate-y-2'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Icon and Close Button */}
        <div className="p-5 pb-4 flex items-start justify-between">
          <div className="flex items-start space-x-3.5">
            <div
              className={`p-2 rounded-md shrink-0 ${
                variant === 'danger'
                  ? 'bg-status-error/15 text-status-error border border-status-error/30'
                  : 'bg-status-warning/15 text-status-warning border border-status-warning/30'
              }`}
            >
              {icon === 'trash' ? (
                <Trash2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-text-primary leading-none">
                {title}
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed pt-1">
                {message}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover transition-colors -mr-1 -mt-1 disabled:opacity-50"
            title="Cancel (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Buttons Footer */}
        <div className="px-5 py-3.5 bg-bg-surface-raised/50 border-t border-border flex items-center justify-end space-x-2.5">
          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="px-3 py-1.5 rounded bg-bg-surface hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary border border-border text-xs font-medium transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors shadow-xs disabled:opacity-50 flex items-center space-x-1.5 ${
              variant === 'danger'
                ? 'bg-status-error text-bg-base hover:bg-status-error/90'
                : 'bg-accent-primary text-bg-base hover:bg-accent-primary-hover'
            }`}
          >
            {isLoading ? 'Deleting...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
