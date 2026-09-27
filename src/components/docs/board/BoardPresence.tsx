import React, { useSyncExternalStore } from 'react';
import { Check, CloudOff, Eye, Loader2 } from 'lucide-react';
import type { BoardPeer } from './boardTypes';
import type { LinkStatus, SaveState } from './boardSync';

export interface PresenceState {
  peers: BoardPeer[];
  following: string | null;
  link: LinkStatus;
  save: SaveState;
  saveMessage?: string;
  canEdit: boolean;
}

/**
 * A minimal external store.
 *
 * The presence UI renders inside Excalidraw's top-right slot, and Excalidraw re-renders
 * whenever its props change. Passing peers as props would re-render the whole canvas on
 * every join, leave and save; a store lets only this slot update.
 */
export function createPresenceStore(initial: PresenceState) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (patch: Partial<PresenceState>) => {
      state = { ...state, ...patch };
      listeners.forEach(l => l());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type PresenceStore = ReturnType<typeof createPresenceStore>;

const MAX_AVATARS = 5;

function avatarFor(peer: BoardPeer): string {
  return (
    peer.avatarUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(peer.name)}&background=282828&color=FFFFFF&rounded=true`
  );
}

export const BoardPresence: React.FC<{
  store: PresenceStore;
  onFollow: (clientId: string | null) => void;
}> = ({ store, onFollow }) => {
  const { peers, following, link, save, saveMessage, canEdit } = useSyncExternalStore(store.subscribe, store.get);

  // One avatar per person even with several tabs open; following picks their first tab.
  const people = [...new Map(peers.map(p => [p.userId, p])).values()];
  const shown = people.slice(0, MAX_AVATARS);
  const extra = people.length - shown.length;

  return (
    <div className="board-presence flex items-center gap-2">
      <span
        className="flex items-center gap-1 text-[11px] whitespace-nowrap"
        title={save === 'error' ? saveMessage : undefined}
        style={{ color: save === 'error' ? '#e03131' : '#868e96' }}
      >
        {link === 'offline' && (<><CloudOff className="w-3 h-3" />Offline</>)}
        {link !== 'offline' && canEdit && save === 'saving' && (<><Loader2 className="w-3 h-3 animate-spin" />Saving</>)}
        {link !== 'offline' && canEdit && save === 'saved' && (<><Check className="w-3 h-3" />Saved</>)}
        {canEdit && save === 'error' && 'Not saved'}
        {!canEdit && (<><Eye className="w-3 h-3" />View only</>)}
      </span>

      {shown.length > 0 && (
        <div className="flex items-center -space-x-1.5">
          {shown.map(peer => {
            const isFollowed = following !== null && peers.some(p => p.clientId === following && p.userId === peer.userId);
            return (
              <button
                key={peer.userId}
                type="button"
                onClick={() => onFollow(isFollowed ? null : peer.clientId)}
                title={isFollowed ? `Stop following ${peer.name}` : `Follow ${peer.name}`}
                className="relative rounded-full focus:outline-none"
                style={{ boxShadow: `0 0 0 2px ${isFollowed ? peer.color.stroke : '#ffffff'}` }}
              >
                <img
                  src={avatarFor(peer)}
                  alt={peer.name}
                  className="w-7 h-7 rounded-full object-cover"
                  style={{ outline: `2px solid ${peer.color.stroke}`, outlineOffset: '-2px' }}
                />
              </button>
            );
          })}
          {extra > 0 && (
            <span className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 text-[10px] font-semibold flex items-center justify-center ring-2 ring-white">
              +{extra}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
