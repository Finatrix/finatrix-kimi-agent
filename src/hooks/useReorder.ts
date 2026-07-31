/**
 * Reordering state for drag-and-drop lists.
 *
 * Drag is only ever the *second* way to reorder — see `MoveButtons` in
 * tools/ui/reorder.tsx for the keyboard path that every draggable list must
 * also offer. Both call the same `onMove`, so ordering behaves identically
 * however it was performed.
 */
import { useCallback, useRef, useState, type DragEvent } from 'react';

export interface RowDragProps {
  draggable: true;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

export interface Reorder {
  /** Index currently being dragged, or null. */
  dragIndex: number | null;
  /** Index the pointer is hovering as a drop target, or null. */
  overIndex: number | null;
  rowProps: (index: number) => RowDragProps;
  /** Class suffix for the row: '' | ' is-dragging' | ' is-over'. */
  rowClass: (index: number) => string;
}

export function useReorder(onMove: (from: number, to: number) => void): Reorder {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  // Kept in a ref as well: dataTransfer is unreadable during dragover in some
  // browsers, and state may lag a fast drag across rows.
  const from = useRef<number | null>(null);

  const rowProps = useCallback((index: number): RowDragProps => ({
    draggable: true,
    onDragStart: (e) => {
      from.current = index;
      setDragIndex(index);
      e.dataTransfer.effectAllowed = 'move';
      // Firefox refuses to start a drag without payload.
      try { e.dataTransfer.setData('text/plain', String(index)); } catch { /* ignore */ }
    },
    onDragOver: (e) => {
      if (from.current == null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOverIndex(index);
    },
    onDragLeave: () => setOverIndex((cur) => (cur === index ? null : cur)),
    onDrop: (e) => {
      e.preventDefault();
      const src = from.current;
      from.current = null;
      setDragIndex(null);
      setOverIndex(null);
      if (src != null && src !== index) onMove(src, index);
    },
    onDragEnd: () => {
      from.current = null;
      setDragIndex(null);
      setOverIndex(null);
    },
  }), [onMove]);

  const rowClass = useCallback(
    (index: number) => (dragIndex === index ? ' is-dragging' : overIndex === index ? ' is-over' : ''),
    [dragIndex, overIndex],
  );

  return { dragIndex, overIndex, rowProps, rowClass };
}

