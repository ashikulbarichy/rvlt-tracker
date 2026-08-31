import React, { useEffect } from 'react';
import { X, Command, Keyboard } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface ShortcutGroup {
  category: string;
  items: {
    description: string;
    keys: string[];
  }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'General',
    items: [
      { description: 'Open search / Command menu', keys: ['⌘', 'K'] },
      { description: 'Toggle left sidebar', keys: ['⌘', 'B'] },
      { description: 'Open keyboard shortcuts', keys: ['?'] },
      { description: 'Close active modal / drawer', keys: ['Esc'] },
      { description: 'Toggle notification drawer', keys: ['⌘', 'Shift', 'N'] },
    ],
  },
  {
    category: 'Create & Actions',
    items: [
      { description: 'Create new issue', keys: ['C'] },
      { description: 'Create new test case', keys: ['T'] },
      { description: 'Submit modal / form', keys: ['⌘', 'Enter'] },
    ],
  },
  {
    category: 'Navigation',
    items: [
      { description: 'Go to Home / Inbox', keys: ['G', 'then', 'H'] },
      { description: 'Go to Issues', keys: ['G', 'then', 'I'] },
      { description: 'Go to Projects', keys: ['G', 'then', 'P'] },
      { description: 'Go to Test Cases', keys: ['G', 'then', 'T'] },
      { description: 'Go to Settings', keys: ['G', 'then', 'S'] },
    ],
  },
];

export const KeyboardShortcutsModal: React.FC = () => {
  const { isShortcutsModalOpen, setIsShortcutsModalOpen } = useApp();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isShortcutsModalOpen) {
        setIsShortcutsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isShortcutsModalOpen, setIsShortcutsModalOpen]);

  if (!isShortcutsModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
        onClick={() => setIsShortcutsModalOpen(false)}
      />

      {/* Modal Box */}
      <div className="relative w-full max-w-lg bg-bg-surface border border-border-strong rounded-lg shadow-2xl overflow-hidden font-sans z-10 animate-in fade-in-0 zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center space-x-2.5">
            <Keyboard className="w-4 h-4 text-accent-primary" />
            <h2 className="text-sm font-semibold text-text-primary">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={() => setIsShortcutsModalOpen(false)}
            className="text-text-tertiary hover:text-text-primary p-1 rounded hover:bg-bg-surface-hover transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.category} className="space-y-2.5">
              <h3 className="text-[11px] font-semibold tracking-wider uppercase text-text-tertiary">
                {group.category}
              </h3>
              <div className="space-y-1.5">
                {group.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-bg-surface-hover/50 transition-colors"
                  >
                    <span className="text-xs text-text-secondary">{item.description}</span>
                    <div className="flex items-center space-x-1">
                      {item.keys.map((k, kIdx) => {
                        if (k === 'then') {
                          return (
                            <span key={kIdx} className="text-[10px] text-text-tertiary px-0.5">
                              then
                            </span>
                          );
                        }
                        return (
                          <kbd
                            key={kIdx}
                            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-mono text-text-primary bg-bg-surface-raised border border-border-strong rounded shadow-sm"
                          >
                            {k}
                          </kbd>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div className="px-5 py-3 bg-bg-base border-t border-border flex items-center justify-between text-[11px] text-text-tertiary">
          <span>Shortcuts work when no text input is active</span>
          <kbd className="px-1.5 py-0.5 font-mono text-[10px] bg-bg-surface-raised border border-border rounded">Esc to close</kbd>
        </div>
      </div>
    </div>
  );
};
