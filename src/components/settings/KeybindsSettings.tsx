import React from 'react';
import { Keyboard, Command } from 'lucide-react';

interface ShortcutGroup {
  category: string;
  items: {
    description: string;
    keys: string[];
  }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'General & Modal Controls',
    items: [
      { description: 'Open global search / Command menu', keys: ['⌘', 'K'] },
      { description: 'Toggle left sidebar', keys: ['⌘', 'B'] },
      { description: 'Open keyboard shortcuts sheet', keys: ['?'] },
      { description: 'Close modal, drawer, or dropdown', keys: ['Esc'] },
      { description: 'Submit active form / modal', keys: ['⌘', 'Enter'] },
    ],
  },
  {
    category: 'Issue & Test Case Actions',
    items: [
      { description: 'Create new issue', keys: ['C'] },
      { description: 'Create new test case', keys: ['T'] },
      { description: 'Submit comment on open issue', keys: ['⌘', 'Enter'] },
    ],
  },
  {
    category: 'Fast Navigation (Sequential)',
    items: [
      { description: 'Go to Home / Inbox', keys: ['G', 'then', 'H'] },
      { description: 'Go to Issues', keys: ['G', 'then', 'I'] },
      { description: 'Go to Projects', keys: ['G', 'then', 'P'] },
      { description: 'Go to Test Cases', keys: ['G', 'then', 'T'] },
      { description: 'Go to Settings', keys: ['G', 'then', 'S'] },
    ],
  },
];

export const KeybindsSettings: React.FC = () => {
  return (
    <div className="max-w-xl font-sans space-y-6">
      <div>
        <div className="mb-3">
          <div className="flex items-center space-x-2">
            <Keyboard className="w-4 h-4 text-text-secondary" />
            <h2 className="text-sm font-karla font-semibold text-text-primary">Keyboard Shortcuts</h2>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            Default keyboard shortcuts to navigate and manage tasks faster.
          </p>
        </div>

        <div className="bg-bg-surface-raised border border-transparent rounded-md p-4 space-y-6 shadow-sm">
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
                            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-mono text-text-primary bg-bg-surface-raised border border-transparent-strong rounded-sm shadow-sm"
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

          <div className="pt-3 border-t border-border flex items-center justify-between text-[11px] text-text-tertiary">
            <span>Custom keybinding configuration will be available in a future update.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
