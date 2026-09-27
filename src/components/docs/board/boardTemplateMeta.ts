// The whiteboard templates offered when creating a board. Names only: the shapes are
// built in boardTemplates.ts, which needs Excalidraw and so is loaded with the canvas.
// Kept apart so the "New document" picker does not pull a 1–2 MB chunk to list names.

export type BoardTemplateId = 'blank' | 'moodboard' | 'brainstorm' | 'retro' | 'flow' | 'kanban';

export interface BoardTemplateMeta {
  id: BoardTemplateId;
  name: string;
  description: string;
  icon: string;
}

export const BOARD_TEMPLATES: BoardTemplateMeta[] = [
  { id: 'blank', name: 'Blank whiteboard', description: 'An empty canvas', icon: '🧩' },
  { id: 'moodboard', name: 'Moodboard', description: 'Colours, type, imagery and inspiration', icon: '🎨' },
  { id: 'brainstorm', name: 'Brainstorm', description: 'A topic in the middle, ideas around it', icon: '💡' },
  { id: 'retro', name: 'Retrospective', description: 'Went well, to improve, action items', icon: '🔁' },
  { id: 'flow', name: 'User flow', description: 'Steps and decisions joined by arrows', icon: '🧭' },
  { id: 'kanban', name: 'Kanban', description: 'To do, in progress, done', icon: '🗂️' },
];

export function isBoardTemplateId(value: string | null | undefined): value is BoardTemplateId {
  return BOARD_TEMPLATES.some(t => t.id === value);
}
