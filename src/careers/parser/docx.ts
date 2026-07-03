/** DOCX text extraction via mammoth (browser build, resolved by Vite). */

import mammoth from 'mammoth';
import { CareersError } from '../utils/errors';

export async function extractDocxText(bytes: ArrayBuffer): Promise<string> {
  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer: bytes });
    return (value ?? '').trim();
  } catch {
    throw new CareersError(
      'extraction',
      'Could not read this Word document. It may be corrupted — try re-exporting it as PDF or DOCX.'
    );
  }
}
