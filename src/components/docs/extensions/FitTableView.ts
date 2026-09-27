import { Extension } from '@tiptap/core';
import { TableView } from '@tiptap/extension-table';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { columnResizingPluginKey, TableMap } from '@tiptap/pm/tables';

type TableNode = ConstructorParameters<typeof TableView>[0];

/**
 * A table whose columns are sized in proportions, never in pixels on screen.
 *
 * Column drags still store pixel widths on the cells (that is how the resize plugin
 * works), but this view turns them into percentages of their total, so the table
 * always spans exactly its frame: a width saved on a wide monitor fits a phone, and
 * widening one column narrows the others instead of pushing the table off the page.
 * Columns with no saved width get the average of the ones that have one.
 */
export class FitTableView extends TableView {
  constructor(node: TableNode, cellMinWidth: number) {
    super(node, cellMinWidth);
    this.fit(node);
  }

  update(node: TableNode) {
    const ok = super.update(node);
    if (ok) this.fit(node);
    return ok;
  }

  private fit(node: TableNode) {
    const firstRow = node.firstChild;
    if (!firstRow) return;

    const widths: (number | null)[] = [];
    firstRow.forEach(cell => {
      const span = (cell.attrs.colspan as number) || 1;
      const colwidth = cell.attrs.colwidth as number[] | null;
      for (let i = 0; i < span; i += 1) widths.push(colwidth?.[i] ?? null);
    });

    const known = widths.filter((w): w is number => typeof w === 'number' && w > 0);
    const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
    const filled = widths.map(w => (typeof w === 'number' && w > 0 ? w : fallback));
    const total = filled.reduce((a, b) => a + b, 0) || 1;

    const cols = Array.from(this.colgroup.children) as HTMLElement[];
    cols.forEach((col, i) => {
      col.style.width = `${((filled[i] ?? fallback) / total) * 100}%`;
      col.style.minWidth = '';
    });
    this.table.style.width = '100%';
    this.table.style.minWidth = '';
  }
}

/**
 * Makes a column drag start from what is on screen.
 *
 * The resize plugin measures a drag from the column's saved pixel width, but the view
 * above shows proportions, so saved and shown widths differ (a table saved on a wide
 * monitor, say) and the column would jump. Just before the resize plugin takes the
 * mouse press, this rewrites the table's saved widths to the ones on screen -- only
 * then, so merely opening a document never edits it.
 */
export const TableFitDrag = Extension.create({
  name: 'tableFitDrag',
  // Ahead of the table extension, so this mousedown runs before the resize plugin's.
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('tableFitDrag'),
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              const handle = columnResizingPluginKey.getState(view.state)?.activeHandle ?? -1;
              if (handle < 0 || event.button !== 0) return false;

              const $cell = view.state.doc.resolve(handle);
              let tableDepth = -1;
              for (let d = $cell.depth; d > 0; d -= 1) {
                if ($cell.node(d).type.name === 'table') { tableDepth = d; break; }
              }
              if (tableDepth < 0) return false;
              const table = $cell.node(tableDepth);
              const tableStart = $cell.start(tableDepth);

              const tr = view.state.tr;
              let changed = false;
              table.descendants((node, pos) => {
                if (node.type.name !== 'tableCell' && node.type.name !== 'tableHeader') {
                  return node.type.name === 'tableRow';
                }
                const dom = view.nodeDOM(tableStart + pos) as HTMLElement | null;
                if (!dom) return false;
                const span = (node.attrs.colspan as number) || 1;
                const each = Math.max(1, Math.round(dom.getBoundingClientRect().width / span));
                const next = Array.from({ length: span }, () => each);
                const current = node.attrs.colwidth as number[] | null;
                if (!current || current.some((w, i) => Math.abs(w - next[i]) > 1)) {
                  tr.setNodeMarkup(tableStart + pos, undefined, { ...node.attrs, colwidth: next });
                  changed = true;
                }
                return false;
              });
              // Remember the drag so the drop can keep the table exactly this wide.
              const cellPos = handle - tableStart;
              const map = TableMap.get(table);
              const rect = map.findCell(cellPos);
              pendingDrag = {
                tableStart,
                column: rect.right - 1,
                frame: (view.nodeDOM(tableStart - 1) as HTMLElement | null)?.getBoundingClientRect().width || 0,
              };
              if (changed) view.dispatch(tr.setMeta('addToHistory', false));
              return false;
            },
          },
        },
        /**
         * On the drop, the dragged column keeps the width it was dragged to and the other
         * columns share what is left of the frame, so the table does not rescale under
         * the mouse.
         */
        appendTransaction: (_transactions, oldState, newState) => {
          const wasDragging = columnResizingPluginKey.getState(oldState)?.dragging;
          const isDragging = columnResizingPluginKey.getState(newState)?.dragging;
          // The resize plugin writes the new width while still dragging, then clears the
          // dragging state in a transaction of its own; that clearing is the drop.
          if (!pendingDrag || !wasDragging || isDragging) return null;
          const { tableStart, column, frame } = pendingDrag;
          pendingDrag = null;
          if (frame <= 0) return null;

          const table = newState.doc.nodeAt(tableStart - 1);
          if (!table || table.type.name !== 'table') return null;
          const map = TableMap.get(table);

          const widths: number[] = Array.from({ length: map.width }, () => 0);
          for (let col = 0; col < map.width; col += 1) {
            const pos = map.map[col];
            const cell = table.nodeAt(pos);
            const rect = map.findCell(pos);
            const colwidth = cell?.attrs.colwidth as number[] | null;
            widths[col] = colwidth?.[col - rect.left] || 0;
          }
          if (widths.some(w => w <= 0)) return null;

          const minOther = 40 * (map.width - 1);
          const dragged = Math.min(widths[column], Math.max(40, frame - minOther));
          const othersTotal = widths.reduce((a, w, i) => (i === column ? a : a + w), 0) || 1;
          const room = frame - dragged;
          const next = widths.map((w, i) => (i === column ? dragged : Math.max(40, Math.round((w / othersTotal) * room))));

          const tr = newState.tr;
          const seen = new Set<number>();
          for (const pos of map.map) {
            if (seen.has(pos)) continue;
            seen.add(pos);
            const cell = table.nodeAt(pos);
            if (!cell) continue;
            const rect = map.findCell(pos);
            tr.setNodeMarkup(tableStart + pos, undefined, { ...cell.attrs, colwidth: next.slice(rect.left, rect.right) });
          }
          return tr;
        },
      }),
    ];
  },
});

/** The table and column being dragged, from the mouse press until the drop commits. */
let pendingDrag: { tableStart: number; column: number; frame: number } | null = null;
