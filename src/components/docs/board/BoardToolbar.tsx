import React, { useEffect, useRef, useState } from 'react';
import {
  StickyNote, Stamp, Ticket, MessageCircle, Vote, Timer, LayoutGrid, MessageSquareText, Radio,
} from 'lucide-react';
import { STICKY_COLORS } from './boardTemplates';

export type BoardMode =
  | { kind: 'none' }
  | { kind: 'sticky'; color: string }
  | { kind: 'stamp'; emoji: string }
  | { kind: 'comment' }
  | { kind: 'vote' };

export const STAMPS = ['👍', '❤️', '🔥', '⭐', '✅', '❓', '🎉', '👀', '💯', '🚀'];

const TIMER_PRESETS = [1, 3, 5, 10, 15];

interface BoardToolbarProps {
  theme: 'light' | 'dark';
  canEdit: boolean;
  mode: BoardMode;
  onMode: (mode: BoardMode) => void;
  onTicket: () => void;
  onTidy: () => void;
  onChat: () => void;
  presenting: boolean;
  onTogglePresent: () => void;

  // Timer
  timerRemaining: number | null;
  timerPaused: boolean;
  onTimerStart: (seconds: number) => void;
  onTimerPause: () => void;
  onTimerResume: () => void;
  onTimerAdd: (seconds: number) => void;
  onTimerStop: () => void;

  // Voting
  votingOpen: boolean;
  votesLeft: number;
  votesPerPerson: number;
  hasResults: boolean;
  onStartVoting: (votesPerPerson: number) => void;
  onEndVoting: () => void;
  onClearVotes: () => void;
}

type Panel = 'sticky' | 'stamp' | 'timer' | 'vote' | null;

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The FigJam-style tools Excalidraw does not have, in a floating bar at the bottom of
 * the canvas. Excalidraw's own toolbar (shapes, arrows, text, images, frames) stays at
 * the top; this adds stickies, stamps, ticket cards, comments, voting, the timer, image
 * tidying, cursor chat and spotlight.
 */
export const BoardToolbar: React.FC<BoardToolbarProps> = props => {
  const { theme, canEdit, mode, onMode } = props;
  const [panel, setPanel] = useState<Panel>(null);
  const [votesPerPerson, setVotesPerPerson] = useState(3);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panel) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPanel(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [panel]);

  const dark = theme === 'dark';
  const surface = dark ? 'bg-[#232329] border-[#3a3a40] text-gray-100' : 'bg-white border-gray-200 text-gray-800';
  const idle = dark ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-gray-100';
  const active = dark ? 'bg-[#4C8DFF]/25 text-white' : 'bg-[#e7efff] text-[#1c5fd6]';

  const button = (
    key: string,
    label: string,
    Icon: typeof StickyNote,
    isActive: boolean,
    onClick: () => void,
    badge?: string
  ) => (
    <button
      key={key}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      onClick={onClick}
      className={`relative shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition-colors focus:outline-none ${isActive ? active : idle}`}
    >
      <Icon className="w-[18px] h-[18px]" />
      {badge && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#ff503c] text-white text-[9px] font-semibold flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  );

  const togglePanel = (p: Exclude<Panel, null>) => setPanel(prev => (prev === p ? null : p));
  const popover = `absolute bottom-full mb-2 left-1/2 -translate-x-1/2 border rounded-xl shadow-xl p-2 ${surface}`;

  return (
    <div ref={ref} className="relative pointer-events-auto">
      <div className={`flex items-center gap-0.5 border rounded-xl shadow-lg px-1.5 py-1 max-w-[calc(100vw-24px)] overflow-x-auto no-scrollbar ${surface}`}>
        {canEdit && button('sticky', 'Sticky note', StickyNote, mode.kind === 'sticky' || panel === 'sticky', () => togglePanel('sticky'))}
        {canEdit && button('stamp', 'Stamp', Stamp, mode.kind === 'stamp' || panel === 'stamp', () => togglePanel('stamp'))}
        {canEdit && button('ticket', 'Add a ticket card', Ticket, false, () => { setPanel(null); props.onTicket(); })}
        {button('comment', 'Comment (click the canvas to pin one)', MessageCircle, mode.kind === 'comment',
          () => { setPanel(null); onMode(mode.kind === 'comment' ? { kind: 'none' } : { kind: 'comment' }); })}
        {button('vote', 'Voting', Vote, mode.kind === 'vote' || panel === 'vote', () => togglePanel('vote'),
          props.votingOpen ? String(props.votesLeft) : undefined)}
        {button('timer', 'Timer', Timer, panel === 'timer' || props.timerRemaining !== null, () => togglePanel('timer'))}
        {canEdit && button('tidy', 'Tidy images into a grid', LayoutGrid, false, () => { setPanel(null); props.onTidy(); })}
        <span className={`w-px h-6 mx-1 shrink-0 ${dark ? 'bg-white/10' : 'bg-gray-200'}`} />
        {button('chat', 'Cursor chat (/)', MessageSquareText, false, () => { setPanel(null); props.onChat(); })}
        {button('present', props.presenting ? 'Stop spotlight' : 'Spotlight me: everyone follows your view',
          Radio, props.presenting, () => { setPanel(null); props.onTogglePresent(); })}
      </div>

      {panel === 'sticky' && (
        <div className={popover}>
          <p className="px-1 pb-1.5 text-[11px] opacity-70 whitespace-nowrap">Pick a colour, then click the canvas</p>
          <div className="flex gap-1.5">
            {STICKY_COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                onClick={() => { onMode({ kind: 'sticky', color: c.value }); setPanel(null); }}
                className="w-7 h-7 rounded-md border border-black/10 hover:scale-110 transition-transform focus:outline-none"
                style={{ background: c.value }}
              />
            ))}
          </div>
        </div>
      )}

      {panel === 'stamp' && (
        <div className={popover}>
          <p className="px-1 pb-1.5 text-[11px] opacity-70 whitespace-nowrap">Click the canvas to stamp. Esc to stop.</p>
          <div className="grid grid-cols-5 gap-1">
            {STAMPS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => { onMode({ kind: 'stamp', emoji }); setPanel(null); }}
                className={`w-9 h-9 text-xl rounded-md focus:outline-none ${idle}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {panel === 'timer' && (
        <div className={`${popover} w-56`}>
          {props.timerRemaining !== null ? (
            <div className="space-y-2">
              <p className="text-center text-2xl font-semibold tabular-nums">{formatClock(props.timerRemaining)}</p>
              {canEdit ? (
                <div className="grid grid-cols-3 gap-1 text-xs">
                  {props.timerPaused
                    ? <button type="button" onClick={props.onTimerResume} className={`py-1.5 rounded-md ${idle}`}>Resume</button>
                    : <button type="button" onClick={props.onTimerPause} className={`py-1.5 rounded-md ${idle}`}>Pause</button>}
                  <button type="button" onClick={() => props.onTimerAdd(60)} className={`py-1.5 rounded-md ${idle}`}>+1 min</button>
                  <button type="button" onClick={props.onTimerStop} className={`py-1.5 rounded-md text-[#e03131] ${dark ? 'hover:bg-white/10' : 'hover:bg-red-50'}`}>Stop</button>
                </div>
              ) : (
                <p className="text-[11px] text-center opacity-70">An editor runs the timer.</p>
              )}
            </div>
          ) : canEdit ? (
            <div>
              <p className="px-1 pb-1.5 text-[11px] opacity-70">Start a timer for everyone</p>
              <div className="grid grid-cols-5 gap-1">
                {TIMER_PRESETS.map(min => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => { props.onTimerStart(min * 60); setPanel(null); }}
                    className={`py-1.5 text-xs rounded-md ${idle}`}
                  >
                    {min}m
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] opacity-70 p-1">No timer running. An editor can start one.</p>
          )}
        </div>
      )}

      {panel === 'vote' && (
        <div className={`${popover} w-60 space-y-2`}>
          {props.votingOpen ? (
            <>
              <p className="text-xs">
                <span className="font-semibold">{props.votesLeft}</span> of {props.votesPerPerson} votes left.
                Click a sticky or shape to vote; Shift+click takes one back.
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onMode(mode.kind === 'vote' ? { kind: 'none' } : { kind: 'vote' })}
                  className={`flex-1 py-1.5 text-xs rounded-md ${mode.kind === 'vote' ? active : idle}`}
                >
                  {mode.kind === 'vote' ? 'Voting on' : 'Vote'}
                </button>
                {canEdit && (
                  <button type="button" onClick={() => { props.onEndVoting(); setPanel(null); }}
                    className={`flex-1 py-1.5 text-xs rounded-md ${idle}`}>
                    End voting
                  </button>
                )}
              </div>
            </>
          ) : canEdit ? (
            <>
              <label className="flex items-center justify-between text-xs gap-2">
                Votes per person
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={votesPerPerson}
                  onChange={e => setVotesPerPerson(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  className={`w-16 rounded-md border px-2 py-1 text-xs ${dark ? 'bg-black/20 border-white/10' : 'bg-white border-gray-200'}`}
                />
              </label>
              <button
                type="button"
                onClick={() => { props.onStartVoting(votesPerPerson); setPanel(null); }}
                className="w-full py-1.5 text-xs rounded-md bg-[#4C8DFF] text-white hover:opacity-90"
              >
                Start voting
              </button>
              {props.hasResults && (
                <button type="button" onClick={() => { props.onClearVotes(); setPanel(null); }}
                  className={`w-full py-1.5 text-xs rounded-md ${idle}`}>
                  Clear results
                </button>
              )}
            </>
          ) : (
            <p className="text-[11px] opacity-70">
              {props.hasResults ? 'Voting has ended; results are shown on the board.' : 'No vote running. An editor can start one.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
