import React, { useState } from 'react';
import { Check, ListChecks, Plus, X } from 'lucide-react';
import type { AcceptanceCriterion } from '../../types/database';

interface AcceptanceCriteriaProps {
  criteria: AcceptanceCriterion[];
  /** Saves the whole list; rejects when the database refuses. */
  onChange: (next: AcceptanceCriterion[]) => Promise<void>;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** The checklist that says when a ticket is done. */
export const AcceptanceCriteria: React.FC<AcceptanceCriteriaProps> = ({ criteria, onChange }) => {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const done = criteria.filter(c => c.done).length;

  const save = async (next: AcceptanceCriterion[]) => {
    setSaving(true);
    setError(null);
    try {
      await onChange(next);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the acceptance criteria.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    if (await save([...criteria, { id: newId(), text, done: false }])) setDraft('');
  };

  const commitEdit = async (id: string) => {
    const text = editText.trim();
    setEditing(null);
    const current = criteria.find(c => c.id === id);
    if (!current || text === current.text) return;
    await save(text ? criteria.map(c => (c.id === id ? { ...c, text } : c)) : criteria.filter(c => c.id !== id));
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-text-primary uppercase tracking-wider">
          <ListChecks className="w-3.5 h-3.5 text-accent-primary" />
          Acceptance criteria
        </h3>
        {criteria.length > 0 && (
          <span className={`text-[11px] tabular-nums ${done === criteria.length ? 'text-status-success' : 'text-text-tertiary'}`}>
            {done}/{criteria.length} met
          </span>
        )}
      </div>

      {criteria.length > 0 && (
        <div className="w-full h-1 bg-bg-surface-hover rounded-full overflow-hidden">
          <div className="h-full bg-accent-primary transition-all" style={{ width: `${(done / criteria.length) * 100}%` }} />
        </div>
      )}

      <ul className="space-y-1">
        {criteria.map(c => (
          <li key={c.id} className="group flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-bg-surface-hover/60">
            <button
              type="button"
              role="checkbox"
              aria-checked={c.done}
              disabled={saving}
              onClick={() => save(criteria.map(x => (x.id === c.id ? { ...x, done: !x.done } : x)))}
              className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                c.done ? 'bg-accent-primary border-accent-primary text-button-text' : 'border-border-strong hover:border-text-secondary'
              }`}
            >
              {c.done && <Check className="w-3 h-3" />}
            </button>
            {editing === c.id ? (
              <input
                autoFocus
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onBlur={() => void commitEdit(c.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
                className="flex-1 min-w-0 bg-transparent text-xs text-text-primary border-b border-border focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => { setEditing(c.id); setEditText(c.text); }}
                className={`flex-1 min-w-0 text-left text-xs break-words focus:outline-none ${c.done ? 'text-text-tertiary line-through' : 'text-text-primary'}`}
              >
                {c.text}
              </button>
            )}
            <button
              type="button"
              title="Remove"
              disabled={saving}
              onClick={() => save(criteria.filter(x => x.id !== c.id))}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 text-text-tertiary hover:text-status-error transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <form
        onSubmit={e => { e.preventDefault(); void add(); }}
        className="flex items-center gap-2 px-2"
      >
        <Plus className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={criteria.length === 0 ? 'Add a criterion: "Given…, when…, then…"' : 'Add another'}
          disabled={saving}
          className="flex-1 min-w-0 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary py-1 focus:outline-none"
        />
      </form>

      {error && <p className="text-[11px] text-status-error px-2">{error}</p>}
    </div>
  );
};
