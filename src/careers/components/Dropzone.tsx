/** Drag-and-drop / click file picker for resume uploads. */

import { useRef, useState, type DragEvent } from 'react';
import { ACCEPT_ATTR } from '../constants';
import { Icon } from '../../tools/ui/Icon';

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
      className={`dropzone ${drag ? 'drag' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Upload resume — PDF, DOCX or DOC, up to 10 MB"
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <div className="dz-ic">
        <Icon name="arrow-up" size={24} />
      </div>
      <div className="dz-t">Drop your resume here</div>
      <div className="dz-d">
        or click to browse — PDF, DOCX or DOC, up to 10 MB.
        <br />
        Your file is stored privately in your account.
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        disabled={disabled}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
