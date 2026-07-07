/** DOCX text extraction via mammoth (browser build, resolved by Vite).
 *
 * mammoth (~197 kB minified) is imported dynamically so it only loads when a
 * user actually uploads a DOCX — a static import here pulls it into the
 * initial entry chunk via the careers module graph.
 */

import { CareersError } from '../utils/errors';

export async function extractDocxText(bytes: ArrayBuffer): Promise<string> {
  try {
    const { default: mammoth } = await import('mammoth');
    const { value } = await mammoth.extractRawText({ arrayBuffer: bytes });
    return (value ?? '').trim();
  } catch {
    throw new CareersError(
      'extraction',
      'Could not read this Word document. It may be corrupted — try re-exporting it as PDF or DOCX.'
    );
  }
}
