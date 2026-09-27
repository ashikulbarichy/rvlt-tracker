import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CaptureUpdateAction, Excalidraw, FONT_FAMILY, MainMenu, exportToBlob,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { AlertTriangle, ExternalLink, Loader2, MessageCircle, Radio } from 'lucide-react';

import { Doc, Ticket } from '../../../types/database';
import { useBoardComments, BoardThread } from '../../../hooks/useBoardComments';
import { useBoardSession, tallyVotes, timerRemaining } from '../../../hooks/useBoardSession';
import { useBoardTickets } from '../../../hooks/useBoardTickets';
import type { MentionablePerson } from '../extensions/mentionItems';
import { BoardSync, LinkStatus } from './boardSync';
import { uploadBoardThumbnail } from './boardFiles';
import { BoardPresence, createPresenceStore } from './BoardPresence';
import { BoardToolbar, BoardMode, formatClock } from './BoardToolbar';
import { BoardCommentPopover } from './BoardCommentPopover';
import { BoardTicketPicker } from './BoardTicketPicker';
import {
  STICKY_SIZE, buildTemplateElements, stampSkeleton, stickySkeleton, ticketCardSkeleton, toElements,
} from './boardTemplates';
import type { BoardTemplateId } from './boardTemplateMeta';
import {
  BoardPeer, Collaborators, ExcalidrawAPI, PointerUpdate, RemotePointer, SceneElement, ViewTransform,
  colorForUser, customDataOf, sceneToScreen, screenToScene,
} from './boardTypes';

export interface BoardCanvasProps {
  doc: Doc;
  canEdit: boolean;
  me: { id: string; name: string; avatarUrl: string | null };
  people: MentionablePerson[];
  templateId: BoardTemplateId | null;
  onTemplateConsumed: () => void;
  /** Plain text from the board's text, for the docs search index. */
  onSearchText: (text: string) => void;
  onOpenTicket: (ticket: Ticket) => void;
}

type Theme = 'light' | 'dark';

const THEME_KEY = 'board-theme';
const SEARCH_TEXT_MS = 3000;
const THUMBNAIL_MS = 30_000;
const CHAT_TTL_MS = 8000;

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

// Excalidraw's own menus. No "open file" or "save to disk": the board lives in the
// database, and a loaded file would silently overwrite everyone's work. The background
// colour is left out too -- it is per-viewer state and would look shared when it is not.
const UI_OPTIONS = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    export: false as const,
    saveAsImage: true,
    toggleTheme: true,
    clearCanvas: false,
    changeViewBackgroundColor: false,
  },
};

interface HostProps {
  canEdit: boolean;
  theme: Theme;
  name: string;
  onApi: (api: ExcalidrawAPI) => void;
  onChange: () => void;
  onPointerUpdate: (payload: PointerUpdate) => void;
  onScrollChange: () => void;
}

/**
 * Excalidraw itself, isolated behind memo with only stable props. Everything that
 * changes often -- cursors, overlays, the toolbar -- lives in the parent, so a peer
 * moving their mouse re-renders the overlay and never the canvas component.
 */
const CanvasHost = React.memo(function CanvasHost({
  canEdit, theme, name, onApi, onChange, onPointerUpdate, onScrollChange,
}: HostProps) {
  const initialData = useMemo(
    () => ({
      appState: {
        viewBackgroundColor: '#ffffff',
        // Clean, FigJam-like defaults instead of Excalidraw's hand-drawn ones.
        currentItemRoughness: 0,
        currentItemFontFamily: FONT_FAMILY.Nunito,
        currentItemStrokeWidth: 1,
        currentItemRoundness: 'round' as const,
      },
    }),
    []
  );

  return (
    <Excalidraw
      excalidrawAPI={onApi}
      initialData={initialData}
      theme={theme}
      viewModeEnabled={!canEdit}
      isCollaborating
      name={name}
      onChange={onChange}
      onPointerUpdate={onPointerUpdate}
      onScrollChange={onScrollChange}
      UIOptions={UI_OPTIONS}
    >
      <MainMenu>
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.ToggleTheme />
        <MainMenu.DefaultItems.Help />
      </MainMenu>
    </Excalidraw>
  );
});

/** Topmost element under a scene point, resolving bound text to its container. */
function hitTest(elements: readonly SceneElement[], x: number, y: number): SceneElement | null {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i];
    if (el.isDeleted || el.type === 'frame' || el.type === 'selection') continue;
    const x1 = Math.min(el.x, el.x + el.width);
    const x2 = Math.max(el.x, el.x + el.width);
    const y1 = Math.min(el.y, el.y + el.height);
    const y2 = Math.max(el.y, el.y + el.height);
    if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
      const containerId = (el as { containerId?: string | null }).containerId;
      if (containerId) return elements.find(e => e.id === containerId && !e.isDeleted) || el;
      return el;
    }
  }
  return null;
}

/** A short two-tone chime for the end of the timer. Silent if audio is unavailable. */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.25 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.45);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // No audio: the timer pill still shows 0:00.
  }
}

export const BoardCanvas: React.FC<BoardCanvasProps> = ({
  doc, canEdit, me, people, templateId, onTemplateConsumed, onSearchText, onOpenTicket,
}) => {
  const [api, setApi] = useState<ExcalidrawAPI | null>(null);
  const syncRef = useRef<BoardSync | null>(null);
  const clientId = useMemo(
    () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    []
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const [theme, setTheme] = useState<Theme>(readTheme);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [peers, setPeers] = useState<BoardPeer[]>([]);
  const peersRef = useRef<BoardPeer[]>([]);
  const pointersRef = useRef(new Map<string, RemotePointer>());
  const [chats, setChats] = useState<Record<string, { text: string; at: number }>>({});
  const [view, setView] = useState<ViewTransform>({ scrollX: 0, scrollY: 0, zoom: 1, width: 0, height: 0 });
  const [sceneTick, setSceneTick] = useState(0);
  const [pointerTick, setPointerTick] = useState(0);
  const [mode, setMode] = useState<BoardMode>({ kind: 'none' });
  const [following, setFollowing] = useState<string | null>(null);
  const followingRef = useRef<string | null>(null);
  const [spotlightBy, setSpotlightBy] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const presentingRef = useRef(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState<{ x: number; y: number } | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [ticketPickerOpen, setTicketPickerOpen] = useState(false);
  const [myChat, setMyChat] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const applyingFollowRef = useRef(false);
  const dirtyRef = useRef(false);
  const lastSearchTextRef = useRef<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const collabRafRef = useRef<number | null>(null);
  const templateRef = useRef(templateId);
  templateRef.current = templateId;

  const onSearchTextRef = useRef(onSearchText);
  onSearchTextRef.current = onSearchText;
  const onTemplateConsumedRef = useRef(onTemplateConsumed);
  onTemplateConsumedRef.current = onTemplateConsumed;

  const presence = useMemo(
    () => createPresenceStore({ peers: [], following: null, link: 'connecting', save: 'idle', canEdit }),
    // One store per mounted board; canEdit updates flow through set() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  useEffect(() => presence.set({ canEdit }), [presence, canEdit]);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(current => (current === message ? null : current)), 3500);
  }, []);

  // ---------------------------------------------------------------------------
  // Comments, session, tickets
  // ---------------------------------------------------------------------------

  const { threads, addComment, setResolved, deleteComment, refetch: refetchComments } =
    useBoardComments(doc.id, () => syncRef.current?.notifyChanged('comments'));

  const {
    session, votes, updateSession, setMyVotes, clearVotes, refetchSession, refetchVotes, error: sessionError,
  } = useBoardSession(doc.id, me.id, kind => syncRef.current?.notifyChanged(kind));

  const tally = useMemo(() => tallyVotes(votes, me.id), [votes, me.id]);
  const votesPerPerson = session?.votes_per_person ?? 3;

  // My votes as I have clicked them, ahead of the server. Two quick clicks must count
  // as two even though the refetch after the first has not landed yet; the writes are
  // queued so they also reach the database in click order. Resynced from the server
  // whenever its answer arrives.
  const myVotesRef = useRef(new Map<string, number>());
  const [myVotesTick, setMyVotesTick] = useState(0);
  const voteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingVoteWrites = useRef(0);
  useEffect(() => {
    if (pendingVoteWrites.current > 0) return;
    myVotesRef.current = new Map(tally.mine);
    setMyVotesTick(t => t + 1);
  }, [tally]);
  const myVotes = useMemo(
    () => new Map(myVotesRef.current),
    // myVotesTick is the signal that the ref changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myVotesTick]
  );
  const myVotesUsed = [...myVotes.values()].reduce((sum, n) => sum + n, 0);
  const votesLeft = Math.max(0, votesPerPerson - myVotesUsed);

  // Everyone enters voting mode when a vote opens, and leaves it when it closes.
  const votingOpen = !!session?.voting_open;
  useEffect(() => {
    setMode(m => (votingOpen ? (m.kind === 'none' ? { kind: 'vote' } : m) : m.kind === 'vote' ? { kind: 'none' } : m));
  }, [votingOpen]);

  // ---------------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------------

  const [now, setNow] = useState(Date.now());
  const remaining = timerRemaining(session, now);
  const timerPaused = session?.timer_paused_remaining !== null && session?.timer_paused_remaining !== undefined;
  const prevRemainingRef = useRef<number | null>(null);

  useEffect(() => {
    if (!session?.timer_ends_at) return;
    const t = setInterval(() => startTransition(() => setNow(Date.now())), 250);
    return () => clearInterval(t);
  }, [session?.timer_ends_at]);

  useEffect(() => {
    const prev = prevRemainingRef.current;
    if (prev !== null && prev > 0 && remaining === 0 && !timerPaused) {
      chime();
      flash("Time's up");
    }
    prevRemainingRef.current = remaining;
  }, [remaining, timerPaused, flash]);

  const runSession = useCallback(
    (patch: Parameters<typeof updateSession>[0]) =>
      updateSession(patch).catch((err: unknown) =>
        flash((err as { message?: string } | null)?.message || 'That did not save.')
      ),
    [updateSession, flash]
  );

  // ---------------------------------------------------------------------------
  // Collaborators on the canvas
  // ---------------------------------------------------------------------------

  const pushCollaborators = useCallback(() => {
    if (collabRafRef.current !== null) return;
    collabRafRef.current = requestAnimationFrame(() => {
      collabRafRef.current = null;
      if (!api) return;
      const map = new Map();
      for (const peer of peersRef.current) {
        const p = pointersRef.current.get(peer.clientId);
        map.set(peer.clientId, {
          id: peer.userId,
          socketId: peer.clientId,
          username: peer.name,
          avatarUrl: peer.avatarUrl ?? undefined,
          color: peer.color,
          pointer: p ? { x: p.x, y: p.y, tool: p.tool } : undefined,
          button: p?.button,
          selectedElementIds: p ? Object.fromEntries(p.selectedElementIds.map(id => [id, true])) : undefined,
        });
      }
      // Low priority, like everything driven by other people. React Router runs page
      // changes as transitions, and an urgent update restarts a transition; cursors
      // arriving 25 times a second would otherwise keep a sidebar click from ever landing.
      startTransition(() => {
        api.updateScene({ collaborators: map as unknown as Collaborators });
        setPointerTick(t => t + 1);
      });
    });
  }, [api]);

  // ---------------------------------------------------------------------------
  // Follow and spotlight
  // ---------------------------------------------------------------------------

  const follow = useCallback((target: string | null) => {
    followingRef.current = target;
    setFollowing(target);
    presence.set({ following: target });
    if (target) syncRef.current?.requestViewport(target);
  }, [presence]);

  const sendMyViewport = useCallback(() => {
    if (!api || !syncRef.current) return;
    const s = api.getAppState();
    syncRef.current.sendViewport({
      scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value, width: s.width, height: s.height,
    });
  }, [api]);

  const togglePresent = useCallback(() => {
    const next = !presentingRef.current;
    presentingRef.current = next;
    setPresenting(next);
    syncRef.current?.sendSpotlight(next);
    if (next) {
      sendMyViewport();
      flash('Everyone is now following your view');
    }
  }, [sendMyViewport, flash]);

  // ---------------------------------------------------------------------------
  // Sync lifecycle
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!api) return;

    const peer: BoardPeer = {
      clientId,
      userId: me.id,
      name: me.name,
      avatarUrl: me.avatarUrl,
      color: colorForUser(me.id),
      canEdit,
    };

    const sync = new BoardSync(api, doc.id, peer, {
      onLoaded: count => {
        setLoaded(true);
        const tpl = templateRef.current;
        if (count === 0 && tpl && tpl !== 'blank' && canEdit) {
          const elements = buildTemplateElements(tpl);
          api.updateScene({
            elements: [...api.getSceneElementsIncludingDeleted(), ...elements],
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
          });
          api.scrollToContent(elements, { fitToViewport: true, viewportZoomFactor: 0.75 });
        } else if (count > 0) {
          api.scrollToContent(api.getSceneElements(), { fitToViewport: true, viewportZoomFactor: 0.8 });
        }
        if (tpl) onTemplateConsumedRef.current();
      },
      onLoadError: message => setLoadError(message),
      onPeers: list => {
        peersRef.current = list;
        setPeers(list);
        presence.set({ peers: list });
        // Drop cursors of people who left.
        for (const id of [...pointersRef.current.keys()]) {
          if (!list.some(p => p.clientId === id)) pointersRef.current.delete(id);
        }
        if (followingRef.current && !list.some(p => p.clientId === followingRef.current)) follow(null);
        pushCollaborators();
      },
      onPointer: (id, pointer) => {
        pointersRef.current.set(id, pointer);
        pushCollaborators();
      },
      onChat: (id, text) => {
        setChats(prev => {
          const next = { ...prev };
          if (text) next[id] = { text, at: Date.now() };
          else delete next[id];
          return next;
        });
      },
      onViewport: (id, vp) => {
        if (followingRef.current !== id) return;
        const mine = api.getAppState();
        const centerX = vp.width / (2 * vp.zoom) - vp.scrollX;
        const centerY = vp.height / (2 * vp.zoom) - vp.scrollY;
        applyingFollowRef.current = true;
        api.updateScene({
          appState: {
            scrollX: mine.width / (2 * vp.zoom) - centerX,
            scrollY: mine.height / (2 * vp.zoom) - centerY,
            zoom: { value: vp.zoom as typeof mine.zoom.value },
          },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        window.setTimeout(() => { applyingFollowRef.current = false; }, 80);
      },
      onSpotlight: (id, on) => {
        if (on) {
          setSpotlightBy(id);
          follow(id);
        } else {
          setSpotlightBy(current => (current === id ? null : current));
          if (followingRef.current === id) follow(null);
        }
      },
      onHello: () => {
        if (presentingRef.current) {
          syncRef.current?.sendSpotlight(true);
          sendMyViewport();
        }
      },
      onViewportWanted: () => sendMyViewport(),
      onChanged: kind => {
        if (kind === 'comments') void refetchComments();
        if (kind === 'session') { void refetchSession(); void refetchVotes(); }
        if (kind === 'votes') void refetchVotes();
      },
      onLink: (status: LinkStatus) => presence.set({ link: status }),
      onSave: (state, message) => presence.set({ save: state, saveMessage: message }),
      onLocalEdit: () => {
        dirtyRef.current = true;
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
          const text = api
            .getSceneElements()
            .filter(el => el.type === 'text')
            .map(el => (el as { text?: string }).text || '')
            .filter(Boolean)
            .join('\n');
          if (text !== lastSearchTextRef.current) {
            lastSearchTextRef.current = text;
            onSearchTextRef.current(text);
          }
        }, SEARCH_TEXT_MS);
      },
    });

    syncRef.current = sync;
    sync.start();

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      sync.stop();
      syncRef.current = null;
    };
    // The sync is rebuilt only for a different board, API instance or permission level.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, doc.id, canEdit, clientId]);

  // Warn before closing the tab with shapes still unsaved.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (syncRef.current?.hasUnsavedChanges) {
        void syncRef.current.flushPersist();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Board thumbnail, for the embed card in pages. Editors only; every 30s while edited.
  useEffect(() => {
    if (!api || !canEdit) return;
    const make = async () => {
      if (!dirtyRef.current) return;
      const elements = api.getSceneElements();
      if (elements.length === 0) return;
      dirtyRef.current = false;
      try {
        const blob = await exportToBlob({
          elements,
          appState: { ...api.getAppState(), exportBackground: true, viewBackgroundColor: '#ffffff' },
          files: api.getFiles(),
          mimeType: 'image/png',
          maxWidthOrHeight: 960,
        });
        await uploadBoardThumbnail(doc.id, blob);
      } catch (err: unknown) {
        // A thumbnail is a nicety; the board itself is saved separately.
        console.warn('[board] thumbnail', (err as { message?: string } | null)?.message);
      }
    };
    const t = setInterval(() => void make(), THUMBNAIL_MS);
    return () => {
      clearInterval(t);
      void make();
    };
  }, [api, canEdit, doc.id]);

  // Cursor chat bubbles fade after a few quiet seconds.
  useEffect(() => {
    if (Object.keys(chats).length === 0) return;
    const t = setInterval(() => {
      setChats(prev => {
        const cutoff = Date.now() - CHAT_TTL_MS;
        const next = Object.fromEntries(Object.entries(prev).filter(([, c]) => c.at > cutoff));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [chats]);

  // ---------------------------------------------------------------------------
  // Excalidraw callbacks (stable)
  // ---------------------------------------------------------------------------

  const handleApi = useCallback((instance: ExcalidrawAPI) => setApi(instance), []);

  const sceneVersionRef = useRef(-1);
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  apiRef.current = api;

  const handleChange = useCallback(() => {
    const instance = apiRef.current;
    if (!instance) return;
    syncRef.current?.detectLocalChanges();

    const s = instance.getAppState();
    if (s.theme !== undefined) {
      const t = s.theme === 'dark' ? 'dark' : 'light';
      setTheme(prev => {
        if (prev !== t) {
          try { localStorage.setItem(THEME_KEY, t); } catch { /* per-viewer nicety */ }
        }
        return t;
      });
    }

    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const st = instance.getAppState();
      // Overlays only need to move when the view or the shapes change; onChange also
      // fires for selection, hover and cursor state.
      let version = 0;
      for (const el of instance.getSceneElementsIncludingDeleted()) version += el.version;
      const sceneChanged = version !== sceneVersionRef.current;
      sceneVersionRef.current = version;
      startTransition(() => {
        setView(prev =>
          prev.scrollX === st.scrollX && prev.scrollY === st.scrollY && prev.zoom === st.zoom.value &&
          prev.width === st.width && prev.height === st.height
            ? prev
            : { scrollX: st.scrollX, scrollY: st.scrollY, zoom: st.zoom.value, width: st.width, height: st.height }
        );
        if (sceneChanged) setSceneTick(t => t + 1);
      });
    });
  }, []);

  const handlePointerUpdate = useCallback((payload: PointerUpdate) => {
    const instance = apiRef.current;
    if (!instance) return;
    lastPointerRef.current = { x: payload.pointer.x, y: payload.pointer.y };
    if (peersRef.current.length === 0) return;
    syncRef.current?.sendPointer({
      x: payload.pointer.x,
      y: payload.pointer.y,
      tool: payload.pointer.tool === 'laser' ? 'laser' : 'pointer',
      button: payload.button === 'down' ? 'down' : 'up',
      selectedElementIds: Object.keys(instance.getAppState().selectedElementIds || {}),
    });
  }, []);

  const handleScrollChange = useCallback(() => {
    // Panning yourself ends a follow -- unless it was the follow that moved the view.
    if (followingRef.current && !applyingFollowRef.current) {
      followingRef.current = null;
      setFollowing(null);
      presence.set({ following: null });
    }
    if (peersRef.current.length > 0) sendMyViewport();
  }, [presence, sendMyViewport]);


  // ---------------------------------------------------------------------------
  // Tools
  // ---------------------------------------------------------------------------

  const insertSkeletons = useCallback(
    (skeletons: Parameters<typeof toElements>[0], select: boolean) => {
      if (!api) return [];
      const elements = toElements(skeletons);
      const selectable = elements.filter(e => !(e as { containerId?: string | null }).containerId);
      api.updateScene({
        elements: [...api.getSceneElementsIncludingDeleted(), ...elements],
        appState: select
          ? { selectedElementIds: Object.fromEntries(selectable.map(e => [e.id, true as const])) }
          : undefined,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      return elements;
    },
    [api]
  );

  /** The view as Excalidraw has it right now -- not the render-throttled copy in state. */
  const liveView = useCallback((): ViewTransform => {
    if (!api) return view;
    const s = api.getAppState();
    return { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value, width: s.width, height: s.height };
  }, [api, view]);

  const viewportCenter = useCallback(() => {
    if (!api) return { x: 0, y: 0 };
    const s = api.getAppState();
    return screenToScene(
      { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value, width: s.width, height: s.height },
      s.width / 2,
      s.height / 2
    );
  }, [api]);

  const castVote = useCallback(
    (elementId: string, remove: boolean) => {
      const mine = myVotesRef.current;
      const current = mine.get(elementId) || 0;
      const next = remove ? current - 1 : current + 1;
      if (next < 0) return;
      const used = [...mine.values()].reduce((sum, n) => sum + n, 0);
      if (!remove && used >= votesPerPerson) {
        flash(`You've used all ${votesPerPerson} votes. Shift+click a vote to take it back.`);
        return;
      }

      if (next === 0) mine.delete(elementId);
      else mine.set(elementId, next);
      setMyVotesTick(t => t + 1);

      pendingVoteWrites.current += 1;
      voteQueueRef.current = voteQueueRef.current
        .then(() => setMyVotes({ elementId, count: next }))
        .catch((err: unknown) => {
          flash((err as { message?: string } | null)?.message || 'Your vote did not count.');
        })
        .finally(() => {
          pendingVoteWrites.current -= 1;
          // The last queued write resyncs with whatever the server now says.
          if (pendingVoteWrites.current === 0) void refetchVotes();
        });
    },
    [votesPerPerson, setMyVotes, flash, refetchVotes]
  );

  const handleModePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!api || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const point = screenToScene(liveView(), e.clientX - rect.left, e.clientY - rect.top);

    if (mode.kind === 'sticky') {
      insertSkeletons([stickySkeleton(point.x - STICKY_SIZE / 2, point.y - STICKY_SIZE / 2, mode.color)], true);
      setMode({ kind: 'none' });
      api.setToast({ message: 'Press Enter or double-click to write on it', duration: 2500 });
    } else if (mode.kind === 'stamp') {
      insertSkeletons([stampSkeleton(point.x, point.y, mode.emoji)], false);
    } else if (mode.kind === 'comment') {
      setOpenThreadId(null);
      setDraftPin(point);
      setMode({ kind: 'none' });
    } else if (mode.kind === 'vote') {
      const target = hitTest(api.getSceneElements(), point.x, point.y);
      if (!target) return;
      castVote(target.id, e.shiftKey || e.altKey || e.button === 2);
    }
  };

  // Wheel over the mode layer still pans and zooms, so placing things never traps you.
  const handleModeWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!api) return;
    const s = api.getAppState();
    if (e.ctrlKey || e.metaKey) {
      const rect = containerRef.current!.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const zoom = Math.min(30, Math.max(0.1, s.zoom.value * (e.deltaY > 0 ? 0.9 : 1.1)));
      const anchor = screenToScene(liveView(), px, py);
      api.updateScene({
        appState: { zoom: { value: zoom as typeof s.zoom.value }, scrollX: px / zoom - anchor.x, scrollY: py / zoom - anchor.y },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    } else {
      api.updateScene({
        appState: { scrollX: s.scrollX - e.deltaX / s.zoom.value, scrollY: s.scrollY - e.deltaY / s.zoom.value },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
  };

  const addTicketCard = (ticket: Ticket) => {
    setTicketPickerOpen(false);
    const c = viewportCenter();
    insertSkeletons([ticketCardSkeleton(c.x - 140, c.y - 55, ticket)], true);
  };

  const tidyImages = () => {
    if (!api) return;
    const all = api.getSceneElementsIncludingDeleted();
    const live = all.filter(e => !e.isDeleted);
    const selected = api.getAppState().selectedElementIds || {};
    let images = live.filter(e => e.type === 'image' && selected[e.id]);
    if (images.length < 2) images = live.filter(e => e.type === 'image');
    if (images.length < 2) {
      flash('Add two or more images, then tidy them into a grid.');
      return;
    }

    const GAP = 24;
    const sorted = [...images].sort((a, b) => a.y - b.y || a.x - b.x);
    const cols = Math.ceil(Math.sqrt(sorted.length));
    const startX = Math.min(...sorted.map(e => e.x));
    let y = Math.min(...sorted.map(e => e.y));
    const moved = new Map<string, { x: number; y: number }>();
    for (let row = 0; row * cols < sorted.length; row += 1) {
      const items = sorted.slice(row * cols, row * cols + cols);
      let x = startX;
      for (const el of items) {
        moved.set(el.id, { x, y });
        x += el.width + GAP;
      }
      y += Math.max(...items.map(e => e.height)) + GAP;
    }

    api.updateScene({
      elements: all.map(el => {
        const pos = moved.get(el.id);
        if (!pos) return el;
        return {
          ...el,
          ...pos,
          version: el.version + 1,
          versionNonce: Math.floor(Math.random() * 2 ** 31),
          updated: Date.now(),
        };
      }),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    flash(`Arranged ${images.length} images`);
  };

  const openChat = useCallback(() => {
    if (!lastPointerRef.current) {
      lastPointerRef.current = viewportCenter();
    }
    setMyChat('');
  }, [viewportCenter]);

  const closeChat = () => {
    setMyChat(null);
    syncRef.current?.sendChat('');
  };

  // Keyboard: Esc leaves a tool; "/" opens cursor chat, as in FigJam.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === 'Escape' && mode.kind !== 'none' && mode.kind !== 'vote') {
        setMode({ kind: 'none' });
        return;
      }
      if (e.key === '/' && !typing && myChat === null && !api?.getAppState().editingTextElement) {
        e.preventDefault();
        e.stopPropagation();
        openChat();
      }
    };
    el.addEventListener('keydown', onKeyDown, true);
    return () => el.removeEventListener('keydown', onKeyDown, true);
  }, [mode, myChat, api, openChat]);

  // ---------------------------------------------------------------------------
  // Overlay data
  // ---------------------------------------------------------------------------

  const sceneElements = useMemo(
    () => (api ? api.getSceneElements() : []),
    // sceneTick is the signal that the scene changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, sceneTick]
  );

  const ticketCards = useMemo(
    () =>
      sceneElements
        .map(el => ({ el, data: customDataOf(el) }))
        .filter((x): x is { el: SceneElement; data: { kind: 'ticket'; ticketId: string } } => x.data?.kind === 'ticket'),
    [sceneElements]
  );
  const { tickets } = useBoardTickets(ticketCards.map(c => c.data.ticketId));
  const ticketsById = useMemo(() => new Map(tickets.map(t => [t.id, t])), [tickets]);

  const visibleThreads = threads.filter(t => showResolved || !t.root.resolved_at);
  const openThread: BoardThread | null = threads.find(t => t.root.id === openThreadId) || null;

  const hasResults = !votingOpen && tally.totals.size > 0;
  const voteBadges = useMemo(() => {
    const source = votingOpen ? myVotes : hasResults ? tally.totals : new Map<string, number>();
    const max = Math.max(0, ...source.values());
    return [...source.entries()]
      .map(([id, count]) => ({ el: sceneElements.find(e => e.id === id), count, top: !votingOpen && count === max }))
      .filter((b): b is { el: SceneElement; count: number; top: boolean } => !!b.el);
  }, [votingOpen, hasResults, tally, myVotes, sceneElements]);

  const dark = theme === 'dark';
  const modeActive = mode.kind !== 'none';
  const spotlightPeer = peers.find(p => p.clientId === spotlightBy);
  const followedPeer = peers.find(p => p.clientId === following);

  // pointerTick keeps chat bubbles glued to moving cursors.
  void pointerTick;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div ref={containerRef} className="board-canvas relative flex-1 min-h-0 overflow-hidden">
      <div className="absolute inset-0">
        <CanvasHost
          canEdit={canEdit}
          theme={theme}
          name={doc.title || 'Whiteboard'}
          onApi={handleApi}
          onChange={handleChange}
          onPointerUpdate={handlePointerUpdate}
          onScrollChange={handleScrollChange}
        />
      </div>

      {/* Placement layer for stickies, stamps, comments and votes. */}
      {modeActive && (
        <div
          data-board-mode-layer=""
          className="absolute inset-0 z-[4]"
          style={{ cursor: mode.kind === 'vote' ? 'pointer' : 'crosshair' }}
          onPointerDown={handleModePointer}
          onWheel={handleModeWheel}
          onContextMenu={e => e.preventDefault()}
        />
      )}

      {/* Overlays: ticket status, votes, comment pins, chat bubbles. */}
      <div className="absolute inset-0 z-[5] pointer-events-none">
        {ticketCards.map(({ el, data }) => {
          const pos = sceneToScreen(view, el.x, el.y);
          const ticket = ticketsById.get(data.ticketId);
          return (
            <div
              key={el.id}
              className="absolute flex items-center gap-1 -translate-y-full pb-1"
              style={{ left: pos.x, top: pos.y }}
            >
              {ticket ? (
                <button
                  type="button"
                  onClick={() => onOpenTicket(ticket)}
                  className="pointer-events-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white border border-gray-200 shadow-sm text-[11px] text-gray-700 hover:bg-gray-50"
                  title="Open ticket"
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: ticket.status?.color || '#868e96' }} />
                  {ticket.status?.name || 'No status'}
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </button>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-[11px] text-gray-500">
                  Ticket unavailable
                </span>
              )}
            </div>
          );
        })}

        {voteBadges.map(({ el, count, top }) => {
          const pos = sceneToScreen(view, el.x + el.width, el.y);
          return (
            <div
              key={`vote-${el.id}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center shadow ${
                votingOpen ? 'bg-[#4C8DFF] text-white' : top ? 'bg-[#ff503c] text-white' : 'bg-gray-800 text-white'
              }`}
              style={{ left: pos.x, top: pos.y }}
              title={votingOpen ? 'Your votes' : 'Votes'}
            >
              {votingOpen ? '●'.repeat(Math.min(count, 5)) : count}
            </div>
          );
        })}

        {visibleThreads.map(thread => {
          const pos = sceneToScreen(view, thread.root.x ?? 0, thread.root.y ?? 0);
          const author = people.find(p => p.id === thread.root.author_id);
          const count = 1 + thread.replies.length;
          return (
            <button
              key={thread.root.id}
              type="button"
              onClick={() => { setDraftPin(null); setOpenThreadId(openThreadId === thread.root.id ? null : thread.root.id); }}
              className={`pointer-events-auto absolute -translate-y-full flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full rounded-bl-none shadow-md border text-[11px] font-medium ${
                thread.root.resolved_at ? 'bg-gray-100 border-gray-200 text-gray-400' : 'bg-white border-gray-200 text-gray-700'
              }`}
              style={{ left: pos.x, top: pos.y }}
              title={thread.root.body}
            >
              <img
                src={author?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(author?.name || '?')}&background=282828&color=FFFFFF&rounded=true`}
                alt=""
                className="w-5 h-5 rounded-full object-cover"
              />
              {count}
            </button>
          );
        })}

        {draftPin && (() => {
          const pos = sceneToScreen(view, draftPin.x, draftPin.y);
          return (
            <span
              className="absolute -translate-y-full w-6 h-6 rounded-full rounded-bl-none bg-[#4C8DFF] border-2 border-white shadow-md"
              style={{ left: pos.x, top: pos.y }}
            />
          );
        })()}

        {peers.map(peer => {
          const chat = chats[peer.clientId];
          const p = pointersRef.current.get(peer.clientId);
          if (!chat || !p) return null;
          const pos = sceneToScreen(view, p.x, p.y);
          return (
            <div
              key={`chat-${peer.clientId}`}
              className="absolute px-3 py-1.5 rounded-2xl rounded-tl-sm text-sm text-white shadow-lg max-w-[260px] break-words"
              style={{ left: pos.x + 14, top: pos.y + 18, background: peer.color.stroke }}
            >
              {chat.text}
            </div>
          );
        })}

        {myChat !== null && lastPointerRef.current && (() => {
          const pos = sceneToScreen(view, lastPointerRef.current.x, lastPointerRef.current.y);
          return (
            <input
              autoFocus
              value={myChat}
              maxLength={140}
              placeholder="Say something"
              onChange={e => { setMyChat(e.target.value); syncRef.current?.sendChat(e.target.value); }}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Escape' || e.key === 'Enter') closeChat();
              }}
              onBlur={closeChat}
              className="pointer-events-auto absolute px-3 py-1.5 rounded-2xl rounded-tl-sm text-sm text-white placeholder:text-white/70 shadow-lg w-56 focus:outline-none"
              style={{ left: pos.x + 14, top: pos.y + 18, background: colorForUser(me.id).stroke }}
            />
          );
        })()}
      </div>

      {/* Comment popovers */}
      {(openThread || draftPin) && (() => {
        const anchor = openThread
          ? { x: openThread.root.x ?? 0, y: openThread.root.y ?? 0 }
          : draftPin!;
        const pos = sceneToScreen(view, anchor.x, anchor.y);
        return (
          <BoardCommentPopover
            theme={theme}
            left={pos.x}
            top={pos.y}
            containerWidth={view.width}
            thread={openThread}
            people={people}
            meId={me.id}
            canEdit={canEdit}
            onSubmit={async body => {
              if (openThread) {
                await addComment({ body, parentId: openThread.root.id });
              } else if (draftPin) {
                const created = await addComment({ body, x: draftPin.x, y: draftPin.y });
                setDraftPin(null);
                setOpenThreadId(created.id);
              }
            }}
            onResolve={async resolved => {
              if (!openThread) return;
              await setResolved({ id: openThread.root.id, resolved, userId: me.id });
              if (resolved && !showResolved) setOpenThreadId(null);
            }}
            onDelete={async id => {
              await deleteComment(id);
              if (openThread && id === openThread.root.id) setOpenThreadId(null);
            }}
            onClose={() => { setOpenThreadId(null); setDraftPin(null); }}
          />
        );
      })()}

      {/* Presence, under Excalidraw's top bar rather than inside it: its top-right slot
          is squeezed off-screen on boards narrower than ~1000px, which is most laptops
          once the app and docs sidebars are open. */}
      <div
        className={`absolute top-[68px] z-10 px-2 py-1 rounded-lg shadow-sm border ${
          dark ? 'bg-[#232329]/90 border-[#3a3a40]' : 'bg-white/90 border-gray-200'
        }`}
        // Excalidraw's phone layout stacks buttons down the right edge; go left there.
        style={view.width > 0 && view.width < 730 ? { left: 12 } : { right: 12 }}
      >
        <BoardPresence store={presence} onFollow={follow} />
      </div>

      {/* Top-centre status: timer, spotlight/follow, tool hints. Below Excalidraw's own
          hint line. */}
      <div className="absolute top-[104px] left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1.5 pointer-events-none">
        {remaining !== null && (
          <div
            className={`pointer-events-auto px-3 py-1 rounded-full shadow-md text-sm font-semibold tabular-nums ${
              remaining === 0 ? 'bg-[#ff503c] text-white' : dark ? 'bg-[#232329] text-white' : 'bg-white text-gray-800 border border-gray-200'
            }`}
          >
            ⏱ {formatClock(remaining)}{timerPaused ? ' · paused' : ''}
          </div>
        )}
        {(spotlightPeer || followedPeer) && (
          <div
            className="pointer-events-auto flex items-center gap-2 px-3 py-1 rounded-full shadow-md text-xs text-white"
            style={{ background: (spotlightPeer || followedPeer)!.color.stroke }}
          >
            <Radio className="w-3.5 h-3.5" />
            {spotlightPeer ? `${spotlightPeer.name} is presenting` : `Following ${followedPeer!.name}`}
            {following && (
              <button type="button" onClick={() => follow(null)} className="underline underline-offset-2">
                Stop
              </button>
            )}
          </div>
        )}
        {presenting && (
          <div className="pointer-events-auto flex items-center gap-2 px-3 py-1 rounded-full shadow-md text-xs text-white bg-[#ff503c]">
            <Radio className="w-3.5 h-3.5" />
            You are presenting
            <button type="button" onClick={togglePresent} className="underline underline-offset-2">Stop</button>
          </div>
        )}
        {mode.kind === 'comment' && (
          <div className="pointer-events-auto flex items-center gap-2 px-3 py-1 rounded-full shadow-md text-xs bg-gray-900 text-white">
            <MessageCircle className="w-3.5 h-3.5" />
            Click anywhere to comment
            <button type="button" onClick={() => setShowResolved(v => !v)} className="underline underline-offset-2">
              {showResolved ? 'Hide resolved' : 'Show resolved'}
            </button>
            <span className="opacity-60">Esc</span>
          </div>
        )}
        {mode.kind === 'vote' && (
          <div className="pointer-events-auto px-3 py-1 rounded-full shadow-md text-xs bg-[#4C8DFF] text-white">
            Voting: {votesLeft} of {votesPerPerson} left · click to vote, Shift+click to take back
            <button type="button" onClick={() => setMode({ kind: 'none' })} className="ml-2 underline underline-offset-2">
              Pause voting
            </button>
          </div>
        )}
        {(mode.kind === 'sticky' || mode.kind === 'stamp') && (
          <div className="px-3 py-1 rounded-full shadow-md text-xs bg-gray-900 text-white">
            {mode.kind === 'sticky' ? 'Click to place the sticky' : `Click to stamp ${mode.emoji}`} · Esc to cancel
          </div>
        )}
        {notice && (
          <div className="px-3 py-1 rounded-full shadow-md text-xs bg-gray-900 text-white">{notice}</div>
        )}
      </div>

      {/* Bottom toolbar */}
      {/* Lifted clear of Excalidraw's zoom and undo controls when the board is narrow. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none"
        style={{ bottom: view.width > 0 && view.width < 1000 ? 68 : 16 }}
      >
        <BoardToolbar
          theme={theme}
          canEdit={canEdit}
          mode={mode}
          onMode={setMode}
          onTicket={() => setTicketPickerOpen(true)}
          onTidy={tidyImages}
          onChat={openChat}
          presenting={presenting}
          onTogglePresent={togglePresent}
          timerRemaining={remaining}
          timerPaused={timerPaused}
          onTimerStart={seconds => void runSession({
            timer_ends_at: new Date(Date.now() + seconds * 1000).toISOString(),
            timer_paused_remaining: null,
            timer_duration: seconds,
          })}
          onTimerPause={() => void runSession({ timer_paused_remaining: remaining ?? 0, timer_ends_at: null })}
          onTimerResume={() => void runSession({
            timer_ends_at: new Date(Date.now() + (session?.timer_paused_remaining ?? 0) * 1000).toISOString(),
            timer_paused_remaining: null,
          })}
          onTimerAdd={seconds => void runSession(
            timerPaused
              ? { timer_paused_remaining: (session?.timer_paused_remaining ?? 0) + seconds }
              : { timer_ends_at: new Date(Date.now() + ((remaining ?? 0) + seconds) * 1000).toISOString() }
          )}
          onTimerStop={() => void runSession({ timer_ends_at: null, timer_paused_remaining: null, timer_duration: null })}
          votingOpen={votingOpen}
          votesLeft={votesLeft}
          votesPerPerson={votesPerPerson}
          hasResults={hasResults}
          onStartVoting={n => void runSession({
            voting_open: true,
            votes_per_person: n,
            voting_round: (session?.voting_round ?? 0) + 1,
          })}
          onEndVoting={() => void runSession({ voting_open: false })}
          onClearVotes={() => void clearVotes().catch((err: unknown) =>
            flash((err as { message?: string } | null)?.message || 'Could not clear the votes.'))}
        />
      </div>

      {ticketPickerOpen && (
        <BoardTicketPicker onPick={addTicketCard} onClose={() => setTicketPickerOpen(false)} />
      )}

      {!loaded && !loadError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 pointer-events-none">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      )}

      {(loadError || sessionError) && (
        <div className="absolute top-[68px] left-4 z-20 max-w-sm flex items-start gap-2 text-xs text-[#c92a2a] bg-white border border-red-200 rounded-md px-3 py-2 shadow">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {loadError ? `This board could not be loaded: ${loadError}` : `Timer and voting are unavailable: ${(sessionError as { message?: string }).message}`}
          </span>
        </div>
      )}
    </div>
  );
};

export default BoardCanvas;
