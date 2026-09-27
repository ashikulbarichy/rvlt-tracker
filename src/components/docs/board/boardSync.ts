import { startTransition } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { CaptureUpdateAction, reconcileElements } from '@excalidraw/excalidraw';
import { supabase } from '../../../lib/supabase';
import { downloadBoardFile, uploadBoardFile } from './boardFiles';
import type {
  BoardFileData,
  BoardPeer,
  ExcalidrawAPI,
  RemotePointer,
  RemoteViewport,
  SceneElement,
} from './boardTypes';

export type BoardChangeKind = 'comments' | 'session' | 'votes';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type LinkStatus = 'connecting' | 'live' | 'offline';

export interface BoardSyncCallbacks {
  onLoaded: (elementCount: number) => void;
  onLoadError: (message: string) => void;
  onPeers: (peers: BoardPeer[]) => void;
  onPointer: (clientId: string, pointer: RemotePointer) => void;
  onChat: (clientId: string, text: string) => void;
  onViewport: (clientId: string, viewport: RemoteViewport) => void;
  onSpotlight: (clientId: string, on: boolean) => void;
  /** Someone joined. Used to re-announce a spotlight to latecomers. */
  onHello: () => void;
  /** Someone started following me and needs my viewport now, not on my next scroll. */
  onViewportWanted: () => void;
  onChanged: (kind: BoardChangeKind) => void;
  onLink: (status: LinkStatus) => void;
  onSave: (state: SaveState, message?: string) => void;
  /** A local edit was detected and queued; used for search text and thumbnails. */
  onLocalEdit: () => void;
}

interface PresenceMeta extends BoardPeer {
  joinedAt: number;
}

const BROADCAST_MS = 50;
const PERSIST_MS = 800;
const POINTER_MS = 40;
const VIEWPORT_MS = 120;
const POLL_MS = 10_000;
const RETRY_MS = 3_000;
// Supabase caps a broadcast payload; stay well under it.
const MAX_BROADCAST_BYTES = 180_000;
const PERSIST_BATCH = 400;
const FILE_RETRIES = 6;

/**
 * Keeps one Excalidraw scene in step with the database and with everyone else on it.
 *
 *   * The database is the authority. Every shape is a row; the higher version wins,
 *     a tie goes to the lower nonce -- the same rule Excalidraw's reconcile uses, so the
 *     table and every client converge on the same scene regardless of arrival order.
 *   * Broadcast is the fast path: edits reach other screens in ~50ms, and are saved on
 *     a short debounce. A missed broadcast is repaired by the periodic delta fetch and
 *     by the full reload on every (re)connect.
 *   * Presence is who is here. Cursors, cursor chat and follow ride on broadcast and are
 *     never stored.
 *
 * Imperative on purpose: the scene belongs to Excalidraw, not to React or the query
 * cache, and every path here runs at pointer-move frequency.
 */
export class BoardSync {
  private channel: RealtimeChannel | null = null;
  private stopped = false;
  private loaded = false;
  private buffered: SceneElement[] = [];

  /** Last version of each element known to be shared, sent or received. */
  private known = new Map<string, number>();
  private toBroadcast = new Map<string, SceneElement>();
  private toPersist = new Map<string, SceneElement>();
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persisting = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastFetchedAt: string | null = null;

  private uploadedFiles = new Set<string>();
  private uploadingFiles = new Set<string>();
  private fetchingFiles = new Set<string>();
  private failedFiles = new Map<string, number>();

  private lastPointerAt = 0;
  private pointerTrail: ReturnType<typeof setTimeout> | null = null;
  private lastViewportAt = 0;
  private viewportTrail: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly api: ExcalidrawAPI,
    private readonly docId: string,
    private readonly me: BoardPeer,
    private readonly callbacks: BoardSyncCallbacks
  ) {}

  get canEdit(): boolean {
    return this.me.canEdit;
  }

  get hasUnsavedChanges(): boolean {
    return this.toPersist.size > 0 || this.persisting;
  }

  start(): void {
    void this.loadAll();
    this.connect();
    this.pollTimer = setInterval(() => void this.loadDelta(), POLL_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    if (this.pointerTrail) clearTimeout(this.pointerTrail);
    if (this.viewportTrail) clearTimeout(this.viewportTrail);
    // Last chance to save: fire and forget, the component is going away.
    if (this.persistTimer) clearTimeout(this.persistTimer);
    void this.flushPersist(true);
    if (this.channel) void supabase.removeChannel(this.channel);
    this.channel = null;
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  private connect(): void {
    this.callbacks.onLink('connecting');
    const channel = supabase.channel(`board:${this.docId}`, {
      config: {
        private: true,
        broadcast: { self: false, ack: false },
        presence: { key: this.me.clientId },
      },
    });
    this.channel = channel;

    channel
      .on('broadcast', { event: 'elements' }, ({ payload }) => {
        const elements = (payload as { elements?: SceneElement[] }).elements;
        if (Array.isArray(elements)) this.receive(elements);
      })
      .on('broadcast', { event: 'pointer' }, ({ payload }) => {
        const p = payload as RemotePointer & { clientId: string };
        if (p?.clientId) this.callbacks.onPointer(p.clientId, { ...p, at: Date.now() });
      })
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        const p = payload as { clientId?: string; text?: string };
        if (p?.clientId) this.callbacks.onChat(p.clientId, String(p.text ?? '').slice(0, 140));
      })
      .on('broadcast', { event: 'viewport' }, ({ payload }) => {
        const p = payload as RemoteViewport & { clientId: string };
        if (p?.clientId) this.callbacks.onViewport(p.clientId, p);
      })
      .on('broadcast', { event: 'spotlight' }, ({ payload }) => {
        const p = payload as { clientId?: string; on?: boolean };
        if (p?.clientId) this.callbacks.onSpotlight(p.clientId, !!p.on);
      })
      .on('broadcast', { event: 'changed' }, ({ payload }) => {
        const kind = (payload as { kind?: BoardChangeKind }).kind;
        if (kind === 'comments' || kind === 'session' || kind === 'votes') this.callbacks.onChanged(kind);
      })
      // A newcomer loads from the table, so anything still in someone's save debounce
      // would be missing for them until the next poll. Saving now closes that gap.
      .on('broadcast', { event: 'hello' }, () => {
        void this.flushPersist();
        this.callbacks.onHello();
      })
      .on('broadcast', { event: 'want-viewport' }, ({ payload }) => {
        if ((payload as { target?: string }).target === this.me.clientId) this.callbacks.onViewportWanted();
      })
      .on('presence', { event: 'sync' }, () => this.emitPeers())
      .subscribe(async (status, err) => {
        if (this.stopped) return;
        if (status === 'SUBSCRIBED') {
          this.callbacks.onLink('live');
          const meta: PresenceMeta = { ...this.me, joinedAt: Date.now() };
          await channel.track(meta);
          void channel.send({ type: 'broadcast', event: 'hello', payload: {} });
          // Anything missed while disconnected.
          if (this.loaded) void this.loadDelta(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.callbacks.onLink('offline');
          if (err) console.warn('[board] realtime', status, err.message);
        }
      });
  }

  private emitPeers(): void {
    if (!this.channel) return;
    const state = this.channel.presenceState<PresenceMeta>();
    const byClient = new Map<string, BoardPeer>();
    for (const metas of Object.values(state)) {
      for (const meta of metas) {
        if (!meta?.clientId || meta.clientId === this.me.clientId) continue;
        byClient.set(meta.clientId, {
          clientId: meta.clientId,
          userId: meta.userId,
          name: meta.name,
          avatarUrl: meta.avatarUrl ?? null,
          color: meta.color,
          canEdit: !!meta.canEdit,
        });
      }
    }
    this.callbacks.onPeers([...byClient.values()]);
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  private async loadAll(): Promise<void> {
    const rows: { data: SceneElement; updated_at: string }[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('doc_board_elements')
        .select('data, updated_at')
        .eq('doc_id', this.docId)
        .order('element_id')
        .range(from, from + PAGE - 1);
      if (this.stopped) return;
      if (error) {
        this.callbacks.onLoadError(error.message);
        return;
      }
      rows.push(...((data || []) as typeof rows));
      if (!data || data.length < PAGE) break;
    }

    this.noteFetched(rows);
    const elements = rows.map(r => r.data);
    // Anything that arrived by broadcast while the table was loading applies on top;
    // the version rule makes the order irrelevant.
    this.applyRemote([...elements, ...this.buffered]);
    this.buffered = [];
    this.loaded = true;
    this.callbacks.onLoaded(elements.filter(e => !e.isDeleted).length);
  }

  private async loadDelta(force = false): Promise<void> {
    if (!this.loaded || this.stopped) return;
    if (!force && document.visibilityState === 'hidden') return;

    let query = supabase
      .from('doc_board_elements')
      .select('data, updated_at')
      .eq('doc_id', this.docId);
    if (this.lastFetchedAt) {
      // Overlap a little: two saves in the same instant from different clients.
      const since = new Date(new Date(this.lastFetchedAt).getTime() - 3000).toISOString();
      query = query.gt('updated_at', since);
    }
    const { data, error } = await query.limit(2000);
    if (error || this.stopped) return;
    const rows = (data || []) as { data: SceneElement; updated_at: string }[];
    this.noteFetched(rows);
    if (rows.length) this.applyRemote(rows.map(r => r.data));
  }

  private noteFetched(rows: { updated_at: string }[]): void {
    for (const r of rows) {
      if (!this.lastFetchedAt || r.updated_at > this.lastFetchedAt) this.lastFetchedAt = r.updated_at;
    }
  }

  // ---------------------------------------------------------------------------
  // Remote -> local
  // ---------------------------------------------------------------------------

  private receive(elements: SceneElement[]): void {
    if (!this.loaded) {
      this.buffered.push(...elements);
      return;
    }
    this.applyRemote(elements);
  }

  private applyRemote(remote: SceneElement[]): void {
    if (remote.length === 0) return;
    const local = this.api.getSceneElementsIncludingDeleted();
    const merged = reconcileElements(
      local,
      remote as unknown as Parameters<typeof reconcileElements>[1],
      this.api.getAppState()
    ) as unknown as SceneElement[];

    // A transition, not an urgent update: other people's edits must never be able to
    // hold up this person navigating away (page changes are transitions too, and urgent
    // updates restart them). The scene itself is updated synchronously either way.
    startTransition(() => {
      this.api.updateScene({
        elements: merged,
        // Someone else's change is not something my Ctrl+Z should undo.
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    });

    // Mark as shared only what the remote copy actually won. A local edit that beat it
    // is still unsent and must stay that way until it goes out.
    const mergedById = new Map(merged.map(e => [e.id, e]));
    for (const r of remote) {
      const m = mergedById.get(r.id);
      if (m && m.version === r.version && m.versionNonce === r.versionNonce) {
        this.known.set(r.id, r.version);
      }
    }
    this.ensureFiles(merged);
  }

  // ---------------------------------------------------------------------------
  // Local -> remote
  // ---------------------------------------------------------------------------

  /** Called from Excalidraw's onChange, which fires on every pointer move. Keep it cheap. */
  detectLocalChanges(): void {
    if (!this.loaded || !this.me.canEdit) return;
    const elements = this.api.getSceneElementsIncludingDeleted();
    let changed = false;
    for (const el of elements) {
      if (this.known.get(el.id) !== el.version) {
        this.known.set(el.id, el.version);
        this.toBroadcast.set(el.id, el);
        this.toPersist.set(el.id, el);
        changed = true;
      }
    }
    if (!changed) return;

    this.uploadNewFiles(elements);
    if (!this.broadcastTimer) {
      this.broadcastTimer = setTimeout(() => this.flushBroadcast(), BROADCAST_MS);
    }
    this.schedulePersist(PERSIST_MS);
    this.callbacks.onSave('saving');
    this.callbacks.onLocalEdit();
  }

  private flushBroadcast(): void {
    this.broadcastTimer = null;
    if (!this.channel || this.toBroadcast.size === 0) return;
    const elements = [...this.toBroadcast.values()];
    this.toBroadcast.clear();

    // Chunk by size: one large freehand stroke can be tens of kilobytes on its own.
    let chunk: SceneElement[] = [];
    let bytes = 0;
    const send = () => {
      if (chunk.length === 0) return;
      void this.channel?.send({ type: 'broadcast', event: 'elements', payload: { elements: chunk } });
      chunk = [];
      bytes = 0;
    };
    for (const el of elements) {
      const size = JSON.stringify(el).length;
      if (bytes + size > MAX_BROADCAST_BYTES) send();
      chunk.push(el);
      bytes += size;
    }
    send();
  }

  private schedulePersist(ms: number): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => void this.flushPersist(), ms);
  }

  /** Save queued shapes now. Safe to call at any time; a save in flight is not doubled. */
  async flushPersist(final = false): Promise<void> {
    if (this.persisting || this.toPersist.size === 0) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;

    const batch = [...this.toPersist.values()];
    this.toPersist.clear();
    this.persisting = true;

    try {
      for (let i = 0; i < batch.length; i += PERSIST_BATCH) {
        const { error } = await supabase.rpc('board_apply_elements', {
          p_doc_id: this.docId,
          p_elements: batch.slice(i, i + PERSIST_BATCH),
        });
        if (error) throw error;
      }
      this.persisting = false;
      if (this.toPersist.size > 0) {
        this.schedulePersist(PERSIST_MS);
      } else if (!final) {
        this.callbacks.onSave('saved');
      }
    } catch (err: unknown) {
      this.persisting = false;
      // Put the batch back under anything newer queued meanwhile, and try again.
      for (const el of batch) {
        const newer = this.toPersist.get(el.id);
        if (!newer || newer.version < el.version) this.toPersist.set(el.id, el);
      }
      const message = (err as { message?: string } | null)?.message || 'Your last change was not saved.';
      if (!final) {
        this.callbacks.onSave('error', message);
        this.schedulePersist(RETRY_MS);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Images
  // ---------------------------------------------------------------------------

  private uploadNewFiles(elements: readonly SceneElement[]): void {
    const files = this.api.getFiles();
    for (const el of elements) {
      if (el.type !== 'image' || el.isDeleted) continue;
      const fileId = (el as { fileId?: string | null }).fileId;
      if (!fileId || this.uploadedFiles.has(fileId) || this.uploadingFiles.has(fileId)) continue;
      const file = files[fileId];
      if (!file) continue;

      this.uploadingFiles.add(fileId);
      uploadBoardFile(this.docId, fileId, file.dataURL, file.mimeType)
        .then(() => this.uploadedFiles.add(fileId))
        .catch((err: unknown) => {
          const message = (err as { message?: string } | null)?.message || 'upload failed';
          this.callbacks.onSave('error', `An image could not be uploaded: ${message}`);
        })
        .finally(() => this.uploadingFiles.delete(fileId));
    }
  }

  private ensureFiles(elements: readonly SceneElement[]): void {
    const have = this.api.getFiles();
    for (const el of elements) {
      if (el.type !== 'image' || el.isDeleted) continue;
      const fileId = (el as { fileId?: string | null }).fileId;
      if (!fileId || have[fileId] || this.fetchingFiles.has(fileId)) continue;
      if ((this.failedFiles.get(fileId) || 0) >= FILE_RETRIES) continue;
      void this.fetchFile(fileId);
    }
  }

  private async fetchFile(fileId: string): Promise<void> {
    this.fetchingFiles.add(fileId);
    try {
      const { dataURL, mimeType } = await downloadBoardFile(this.docId, fileId);
      if (this.stopped) return;
      this.api.addFiles([
        {
          id: fileId,
          dataURL,
          mimeType,
          created: Date.now(),
          lastRetrieved: Date.now(),
        } as unknown as BoardFileData,
      ]);
      this.uploadedFiles.add(fileId);
      this.failedFiles.delete(fileId);
      this.fetchingFiles.delete(fileId);
    } catch {
      // Often the author's upload simply has not finished. Back off and retry a few
      // times; after that the image shows Excalidraw's placeholder.
      const attempts = (this.failedFiles.get(fileId) || 0) + 1;
      this.failedFiles.set(fileId, attempts);
      if (attempts < FILE_RETRIES && !this.stopped) {
        setTimeout(() => {
          this.fetchingFiles.delete(fileId);
          if (!this.stopped) this.ensureFiles(this.api.getSceneElementsIncludingDeleted());
        }, 1500 * attempts);
      } else {
        this.fetchingFiles.delete(fileId);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Ephemeral: cursors, chat, follow, change notices
  // ---------------------------------------------------------------------------

  sendPointer(pointer: Omit<RemotePointer, 'at'>): void {
    const send = () => {
      this.lastPointerAt = Date.now();
      void this.channel?.send({
        type: 'broadcast',
        event: 'pointer',
        payload: { clientId: this.me.clientId, ...pointer },
      });
    };
    if (this.pointerTrail) clearTimeout(this.pointerTrail);
    const wait = POINTER_MS - (Date.now() - this.lastPointerAt);
    if (wait <= 0) send();
    else this.pointerTrail = setTimeout(send, wait);
  }

  sendViewport(viewport: RemoteViewport): void {
    const send = () => {
      this.lastViewportAt = Date.now();
      void this.channel?.send({
        type: 'broadcast',
        event: 'viewport',
        payload: { clientId: this.me.clientId, ...viewport },
      });
    };
    if (this.viewportTrail) clearTimeout(this.viewportTrail);
    const wait = VIEWPORT_MS - (Date.now() - this.lastViewportAt);
    if (wait <= 0) send();
    else this.viewportTrail = setTimeout(send, wait);
  }

  sendChat(text: string): void {
    void this.channel?.send({
      type: 'broadcast',
      event: 'chat',
      payload: { clientId: this.me.clientId, text: text.slice(0, 140) },
    });
  }

  sendSpotlight(on: boolean): void {
    void this.channel?.send({
      type: 'broadcast',
      event: 'spotlight',
      payload: { clientId: this.me.clientId, on },
    });
  }

  requestViewport(target: string): void {
    void this.channel?.send({ type: 'broadcast', event: 'want-viewport', payload: { target } });
  }

  /** Tell everyone to refetch comments, the session or votes. */
  notifyChanged(kind: BoardChangeKind): void {
    void this.channel?.send({ type: 'broadcast', event: 'changed', payload: { kind } });
  }
}
