import type React from 'react';
import type { Excalidraw } from '@excalidraw/excalidraw';

// Excalidraw's own type paths move between releases, so everything here is derived
// from the component's props instead. If an upgrade changes a shape, the compiler says
// so at the use site rather than an import quietly resolving to something else.
type ExcalidrawProps = React.ComponentProps<typeof Excalidraw>;

export type ExcalidrawAPI = Parameters<NonNullable<ExcalidrawProps['excalidrawAPI']>>[0];
export type SceneElement = ReturnType<ExcalidrawAPI['getSceneElementsIncludingDeleted']>[number];
export type BoardAppState = ReturnType<ExcalidrawAPI['getAppState']>;
export type BoardFiles = ReturnType<ExcalidrawAPI['getFiles']>;
export type BoardFileData = BoardFiles[string];
export type SceneUpdate = Parameters<ExcalidrawAPI['updateScene']>[0];
export type Collaborators = NonNullable<SceneUpdate['collaborators']>;
export type Collaborator = Collaborators extends Map<unknown, infer C> ? C : never;
export type PointerUpdate = Parameters<NonNullable<ExcalidrawProps['onPointerUpdate']>>[0];

/** What we store in an element's customData to mark our own FigJam-style objects. */
export type BoardCustomData =
  | { kind: 'sticky' }
  | { kind: 'stamp' }
  | { kind: 'ticket'; ticketId: string };

export function customDataOf(el: { customData?: unknown }): BoardCustomData | null {
  const data = el.customData as { kind?: unknown; ticketId?: unknown } | undefined;
  if (!data || typeof data.kind !== 'string') return null;
  if (data.kind === 'ticket') {
    return typeof data.ticketId === 'string' ? { kind: 'ticket', ticketId: data.ticketId } : null;
  }
  if (data.kind === 'sticky' || data.kind === 'stamp') return { kind: data.kind };
  return null;
}

/** Someone else on the board, from Realtime presence. */
export interface BoardPeer {
  /** One per browser tab; the same person in two tabs is two peers. */
  clientId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  color: { background: string; stroke: string };
  canEdit: boolean;
}

export interface RemotePointer {
  x: number;
  y: number;
  tool: 'pointer' | 'laser';
  button: 'up' | 'down';
  selectedElementIds: string[];
  at: number;
}

export interface RemoteViewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
  width: number;
  height: number;
}

/** The part of the view the overlays need to place things over the canvas. */
export interface ViewTransform {
  scrollX: number;
  scrollY: number;
  zoom: number;
  width: number;
  height: number;
}

export const sceneToScreen = (v: ViewTransform, x: number, y: number) => ({
  x: (x + v.scrollX) * v.zoom,
  y: (y + v.scrollY) * v.zoom,
});

export const screenToScene = (v: ViewTransform, x: number, y: number) => ({
  x: x / v.zoom - v.scrollX,
  y: y / v.zoom - v.scrollY,
});

const PEER_COLORS = [
  '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5', '#0c8599', '#c2255c', '#5f3dc4',
];

/** A stable colour per person, so someone keeps their colour across tabs and visits. */
export function colorForUser(userId: string): { background: string; stroke: string } {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  const stroke = PEER_COLORS[Math.abs(hash) % PEER_COLORS.length];
  return { background: stroke, stroke };
}
