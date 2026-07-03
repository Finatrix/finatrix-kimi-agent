/**
 * Upload validation. Runs entirely before any byte leaves the device:
 * size and extension checks, MIME sanity, and magic-byte sniffing so a
 * renamed .exe can't masquerade as a resume. Encrypted/corrupted files are
 * caught later by the format-specific extractors, which see the real
 * structure.
 */

import { ACCEPTED_EXTENSIONS, ACCEPTED_MIME_TYPES, MAX_FILE_BYTES } from '../constants';
import { CareersError } from '../utils/errors';

export type ResumeFileKind = 'pdf' | 'docx' | 'doc';

export interface ValidatedFile {
  kind: ResumeFileKind;
  extension: string;
}

function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

/** Detect the real container format from the first bytes of the file. */
export function sniffKind(bytes: Uint8Array): ResumeFileKind | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf';            // %PDF
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return 'docx';           // ZIP (OOXML)
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'doc'; // OLE2
  return null;
}

/**
 * Validate a candidate resume file. Throws CareersError('validation', …) with
 * a user-readable message on any problem; resolves with the detected kind.
 */
export async function validateResumeFile(file: File): Promise<ValidatedFile> {
  if (file.size === 0) {
    throw new CareersError('validation', 'That file is empty. Please choose a resume with content.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new CareersError('validation', 'That file is larger than 10 MB. Please upload a smaller resume.');
  }

  const extension = extensionOf(file.name);
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new CareersError('validation', 'Unsupported format. Please upload a PDF, DOCX or DOC resume.');
  }

  // Browsers sometimes omit or generalize the MIME type, so only reject a
  // type that is present AND wrong.
  if (file.type && !(ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new CareersError('validation', 'Unsupported file type. Please upload a PDF, DOCX or DOC resume.');
  }

  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const sniffed = sniffKind(head);
  if (!sniffed) {
    throw new CareersError('validation', 'This file does not look like a valid PDF or Word document. It may be corrupted.');
  }

  // The container must match the extension family. (.doc saved by modern Word
  // is often actually OOXML — allow zip content behind a .doc extension.)
  const compatible =
    (extension === 'pdf' && sniffed === 'pdf') ||
    (extension === 'docx' && sniffed === 'docx') ||
    (extension === 'doc' && (sniffed === 'doc' || sniffed === 'docx'));
  if (!compatible) {
    throw new CareersError('validation', `This file has a .${extension} name but different contents. Please re-export your resume and try again.`);
  }

  return { kind: sniffed, extension };
}
