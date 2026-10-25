/** Drag-and-drop / click file picker for resume uploads. */

import { useRef, useState, type DragEvent } from 'react';
import { ACCEPT_ATTR } from '../constants';
import { RsIcon } from '../areas/resume/icons';
import '../areas/resume/resume.css';

export function Dropzone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (!disabled) pick(e.dataTransfer.files);
  };

  return (
    <div
      className="rs-drop"
      data-drag={drag}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <span className="rs-drop-icon"><RsIcon name="upload" size={28} /></span>
      <button
        type="button"
        className="cx-btn"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Drop a PDF or Word file, or choose one
      </button>
      <p className="rs-drop-hint">PDF, DOCX or DOC, up to 10 MB.</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        disabled={disabled}
        aria-label="Resume file"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
