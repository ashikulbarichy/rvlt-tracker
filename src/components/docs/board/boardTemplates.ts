import { FONT_FAMILY, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { BoardTemplateId } from './boardTemplateMeta';
import type { SceneElement } from './boardTypes';

type Skeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number];

export const STICKY_COLORS = [
  { name: 'Yellow', value: '#fff3a3' },
  { name: 'Orange', value: '#ffd8a8' },
  { name: 'Pink', value: '#fcc2d7' },
  { name: 'Green', value: '#b2f2bb' },
  { name: 'Blue', value: '#a5d8ff' },
  { name: 'Violet', value: '#d0bfff' },
  { name: 'Grey', value: '#e9ecef' },
] as const;

export const STICKY_SIZE = 200;
const INK = '#1e1e1e';
// Skeletons ignore the editor's current font, so name the clean one explicitly.
const FONT = FONT_FAMILY.Nunito;

let seq = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/**
 * A FigJam-style sticky: a flat, square, rounded note. Double-clicking it types into it
 * (Excalidraw binds the text to the shape and grows the note to fit).
 */
export function stickySkeleton(x: number, y: number, color: string, text?: string, id?: string): Skeleton {
  return {
    type: 'rectangle',
    id,
    x,
    y,
    width: STICKY_SIZE,
    height: STICKY_SIZE,
    backgroundColor: color,
    strokeColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    roughness: 0,
    roundness: { type: 3 },
    customData: { kind: 'sticky' },
    ...(text
      ? { label: { fontFamily: FONT, text, fontSize: 20, textAlign: 'left', verticalAlign: 'top', strokeColor: INK } }
      : {}),
  } as Skeleton;
}

export function stampSkeleton(x: number, y: number, emoji: string): Skeleton {
  return {
    type: 'text',
    fontFamily: FONT,
    x: x - 24,
    y: y - 28,
    text: emoji,
    fontSize: 44,
    customData: { kind: 'stamp' },
  } as Skeleton;
}

export function ticketCardSkeleton(
  x: number,
  y: number,
  ticket: { id: string; identifier: string; title: string }
): Skeleton {
  return {
    type: 'rectangle',
    x,
    y,
    width: 280,
    height: 110,
    backgroundColor: '#ffffff',
    strokeColor: '#ced4da',
    fillStyle: 'solid',
    strokeWidth: 1,
    roughness: 0,
    roundness: { type: 3 },
    customData: { kind: 'ticket', ticketId: ticket.id },
    label: {
      text: `${ticket.identifier}\n${ticket.title}`,
      fontSize: 16,
      textAlign: 'left',
      verticalAlign: 'top',
      strokeColor: INK,
    },
  } as Skeleton;
}

const heading = (x: number, y: number, text: string, fontSize = 28): Skeleton =>
  ({ type: 'text', fontFamily: FONT, x, y, text, fontSize, strokeColor: INK }) as Skeleton;

/** A named frame sized by an invisible spacer, so the frame's bounds are exact. */
function frame(name: string, x: number, y: number, width: number, height: number, children: Skeleton[]): Skeleton[] {
  const spacerId = uid('spacer');
  const ids = [spacerId, ...children.map(c => (c as { id?: string }).id).filter((v): v is string => !!v)];
  return [
    {
      type: 'rectangle',
      id: spacerId,
      x,
      y,
      width,
      height,
      strokeColor: 'transparent',
      backgroundColor: 'transparent',
      roughness: 0,
    } as Skeleton,
    ...children,
    { type: 'frame', children: ids, name } as Skeleton,
  ];
}

const withId = (s: Skeleton, prefix: string): Skeleton => ({ ...s, id: uid(prefix) }) as Skeleton;

function moodboard(): Skeleton[] {
  const palette = ['#1f2933', '#ff503c', '#f6c667', '#9bc1bc', '#f4f1de'];
  const swatches = palette.flatMap((color, i) => [
    withId({
      type: 'rectangle', x: 40 + i * 130, y: 60, width: 110, height: 110,
      backgroundColor: color, strokeColor: '#dee2e6', fillStyle: 'solid', roughness: 0,
      roundness: { type: 3 },
    } as Skeleton, 'swatch'),
    withId({ type: 'text', fontFamily: FONT, x: 40 + i * 130, y: 180, text: color, fontSize: 14, strokeColor: '#495057' } as Skeleton, 'swatch-label'),
  ]);

  const type = [
    withId({ type: 'text', fontFamily: FONT, x: 780, y: 60, text: 'Aa Heading', fontSize: 44, strokeColor: INK } as Skeleton, 'type'),
    withId({ type: 'text', fontFamily: FONT, x: 780, y: 130, text: 'Subheading — 24px', fontSize: 24, strokeColor: INK } as Skeleton, 'type'),
    withId({ type: 'text', fontFamily: FONT, x: 780, y: 175, text: 'Body copy reads like this, at 16px.', fontSize: 16, strokeColor: '#495057' } as Skeleton, 'type'),
  ];

  const imagery = [0, 1, 2].map(i =>
    withId({
      type: 'rectangle', x: 40 + i * 220, y: 330, width: 200, height: 260,
      strokeColor: '#adb5bd', strokeStyle: 'dashed', backgroundColor: 'transparent', roughness: 0,
      roundness: { type: 3 },
      label: { fontFamily: FONT, text: 'Drop an image', fontSize: 16, strokeColor: '#868e96' },
    } as Skeleton, 'image-slot')
  );

  const inspiration = [
    withId(stickySkeleton(780, 330, STICKY_COLORS[0].value, 'Feeling: warm, confident'), 'sticky'),
    withId(stickySkeleton(1000, 330, STICKY_COLORS[3].value, 'References & links'), 'sticky'),
  ];

  return [
    heading(20, -150, 'Moodboard', 40),
    ...frame('Colour', 20, 20, 680, 210, swatches),
    ...frame('Typography', 760, 20, 480, 210, type),
    ...frame('Imagery', 20, 290, 680, 330, imagery),
    ...frame('Inspiration', 760, 290, 480, 330, inspiration),
  ];
}

function brainstorm(): Skeleton[] {
  const topicId = uid('topic');
  const ideas = [
    [-420, -300], [-110, -380], [200, -300], [300, -40],
    [200, 220], [-110, 300], [-420, 220], [-520, -40],
  ].map(([x, y], i) =>
    withId(stickySkeleton(x, y, STICKY_COLORS[i % 6].value, i === 0 ? 'Idea' : undefined), 'idea')
  );
  return [
    {
      type: 'ellipse', id: topicId, x: -150, y: -60, width: 300, height: 160,
      backgroundColor: '#ffffff', strokeColor: INK, fillStyle: 'solid', roughness: 0, strokeWidth: 2,
      label: { fontFamily: FONT, text: 'Topic', fontSize: 32, strokeColor: INK },
    } as Skeleton,
    ...ideas,
  ];
}

function columns(names: string[], colors: string[], starter: string[]): Skeleton[] {
  return names.flatMap((name, col) => {
    const x = col * 520;
    const notes = [0, 1].map(row =>
      withId(stickySkeleton(x + 40, 60 + row * 230, colors[col], row === 0 ? starter[col] : undefined), 'note')
    );
    return frame(name, x, 0, 480, 720, notes);
  });
}

function retro(): Skeleton[] {
  return [
    heading(0, -150, 'Retrospective', 36),
    ...columns(
      ['Went well', 'To improve', 'Action items'],
      [STICKY_COLORS[3].value, STICKY_COLORS[2].value, STICKY_COLORS[4].value],
      ['What worked?', 'What slowed us down?', 'Owner + next step']
    ),
  ];
}

function kanban(): Skeleton[] {
  return [
    heading(0, -150, 'Board', 36),
    ...columns(
      ['To do', 'In progress', 'Done'],
      [STICKY_COLORS[0].value, STICKY_COLORS[1].value, STICKY_COLORS[3].value],
      ['A task', 'Something underway', 'Shipped']
    ),
  ];
}

function flow(): Skeleton[] {
  const start = uid('start');
  const step = uid('step');
  const decide = uid('decide');
  const yes = uid('yes');
  const no = uid('no');
  const end = uid('end');
  const box = { roughness: 0, strokeWidth: 2, strokeColor: INK, fillStyle: 'solid' } as const;
  // Explicit geometry from edge to edge: the skeleton converter binds arrows to their
  // shapes but does not route them, so an arrow given only its ends lands at the origin.
  const arrow = (from: string, to: string, [sx, sy]: number[], [tx, ty]: number[], text?: string): Skeleton =>
    ({
      type: 'arrow', x: sx + 6, y: sy, width: tx - sx - 12, height: ty - sy,
      roughness: 0, strokeColor: '#495057', strokeWidth: 2,
      start: { id: from }, end: { id: to },
      ...(text ? { label: { fontFamily: FONT, text, fontSize: 16 } } : {}),
    }) as Skeleton;

  return [
    { type: 'ellipse', id: start, x: 0, y: 40, width: 160, height: 80, backgroundColor: '#b2f2bb', ...box, label: { fontFamily: FONT, text: 'Start', fontSize: 20 } } as Skeleton,
    { type: 'rectangle', id: step, x: 260, y: 30, width: 200, height: 100, backgroundColor: '#ffffff', roundness: { type: 3 }, ...box, label: { fontFamily: FONT, text: 'User does something', fontSize: 18 } } as Skeleton,
    { type: 'diamond', id: decide, x: 560, y: 10, width: 200, height: 140, backgroundColor: '#fff3a3', ...box, label: { fontFamily: FONT, text: 'Condition?', fontSize: 18 } } as Skeleton,
    { type: 'rectangle', id: yes, x: 860, y: -110, width: 200, height: 100, backgroundColor: '#ffffff', roundness: { type: 3 }, ...box, label: { fontFamily: FONT, text: 'Happy path', fontSize: 18 } } as Skeleton,
    { type: 'rectangle', id: no, x: 860, y: 170, width: 200, height: 100, backgroundColor: '#ffffff', roundness: { type: 3 }, ...box, label: { fontFamily: FONT, text: 'Recover', fontSize: 18 } } as Skeleton,
    { type: 'ellipse', id: end, x: 1160, y: 40, width: 160, height: 80, backgroundColor: '#ffc9c9', ...box, label: { fontFamily: FONT, text: 'End', fontSize: 20 } } as Skeleton,
    arrow(start, step, [160, 80], [260, 80]),
    arrow(step, decide, [460, 80], [560, 80]),
    arrow(decide, yes, [760, 80], [860, -60], 'Yes'),
    arrow(decide, no, [760, 80], [860, 220], 'No'),
    arrow(yes, end, [1060, -60], [1160, 80]),
    arrow(no, end, [1060, 220], [1160, 80]),
  ];
}

const BUILDERS: Record<Exclude<BoardTemplateId, 'blank'>, () => Skeleton[]> = {
  moodboard,
  brainstorm,
  retro,
  flow,
  kanban,
};

export function buildTemplateElements(id: BoardTemplateId): SceneElement[] {
  if (id === 'blank') return [];
  return convertToExcalidrawElements(BUILDERS[id](), { regenerateIds: false }) as unknown as SceneElement[];
}

export function toElements(skeletons: Skeleton[]): SceneElement[] {
  return convertToExcalidrawElements(skeletons, { regenerateIds: true }) as unknown as SceneElement[];
}
