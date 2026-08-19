/**
 * Remove HTML comments from the shipped document.
 *
 * `index.html` carries ~5.5 KB of engineering notes — why the lang tag is
 * `en-IN`, why the icon set splits at 64px, why `twitter:site` is absent — and
 * every byte of it is served to every visitor, on every navigation, and again
 * on every SPA route the edge answers with the shell. Half the document is
 * commentary nobody outside the repository can act on, and two of the notes are
 * `TODO`s, which is internal planning shipped to production.
 *
 * The comments stay in the source, where they are worth their weight. They are
 * simply not part of the artifact.
 *
 * Deliberately conservative: it walks the document and skips the interior of
 * `<script>` and `<style>` outright. That matters more than it looks — the
 * inline theme-boot script is allowed by a `sha256` in the CSP, so altering one
 * byte inside it would block it in production and flash the wrong theme on
 * every load, and the JSON-LD block would stop parsing. `htmlComments.test.ts`
 * pins both.
 */
export function stripHtmlComments(html: string): string {
  const out: string[] = [];
  let i = 0;

  while (i < html.length) {
    // Never look inside a script or style element: their contents are not HTML
    // and a `<!--` in there is data, not a comment.
    const verbatim = /<(script|style)\b/i.exec(html.slice(i));
    const comment = html.indexOf("<!--", i);

    if (comment === -1) break;
    if (verbatim && i + verbatim.index < comment) {
      const openStart = i + verbatim.index;
      const closeTag = `</${verbatim[1].toLowerCase()}>`;
      const closeAt = html.toLowerCase().indexOf(closeTag, openStart);
      const resumeAt = closeAt === -1 ? html.length : closeAt + closeTag.length;
      out.push(html.slice(i, resumeAt));
      i = resumeAt;
      continue;
    }

    const end = html.indexOf("-->", comment);
    if (end === -1) break; // unterminated: leave the rest untouched
    out.push(html.slice(i, comment));
    // Collapse the whitespace the comment used to sit in, so removing a
    // block comment does not leave a blank gap behind it.
    const trailing = /^[ \t]*\r?\n/.exec(html.slice(end + 3));
    i = end + 3 + (trailing ? trailing[0].length : 0);
    if (out.length && /\n[ \t]*$/.test(out[out.length - 1])) {
      out[out.length - 1] = out[out.length - 1].replace(/[ \t]*$/, "");
    }
  }
  out.push(html.slice(i));
  return out.join("");
}
