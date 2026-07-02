/**
 * Parity-test harness.
 *
 * The seven tools were migrated out of public/tools-app.html into typed React
 * modules. To PROVE the migration changed no math, these helpers extract the
 * ORIGINAL functions and data tables directly from the tools-app.html source
 * string and let a test compare them against the ported implementations across
 * a grid of inputs. Nothing here is transcribed by hand — the reference always
 * comes from the real source file — so a divergence fails the build.
 *
 * Only used by tests. The html source is imported with Vite's `?raw` loader in
 * each parity test file.
 */

/** Find the index of the bracket that closes the one opened at `openIdx`. */
function matchBracket(src: string, openIdx: number): number {
  const open = src[openIdx];
  const close = open === '{' ? '}' : open === '[' ? ']' : ')';
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unbalanced ${open} starting at ${openIdx}`);
}

/** Return the full `function NAME(...) { ... }` source text, verbatim. */
export function extractFnSource(html: string, name: string): string {
  const re = new RegExp(`function\\s+${name}\\s*\\(`);
  const m = re.exec(html);
  if (!m) throw new Error(`Original function not found: ${name}`);
  const parenStart = html.indexOf('(', m.index);
  const parenEnd = matchBracket(html, parenStart);
  const braceStart = html.indexOf('{', parenEnd);
  const braceEnd = matchBracket(html, braceStart);
  return html.slice(m.index, braceEnd + 1);
}

/** Return `const NAME = <object|array literal>;` source text, verbatim. */
export function extractConstSource(html: string, name: string): string {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*`);
  const m = re.exec(html);
  if (!m) throw new Error(`Original const not found: ${name}`);
  const valueStart = m.index + m[0].length;
  const open = html[valueStart];
  if (open !== '{' && open !== '[') {
    throw new Error(`Const ${name} is not an object/array literal (starts with "${open}")`);
  }
  const end = matchBracket(html, valueStart);
  return `const ${name} = ${html.slice(valueStart, end + 1)};`;
}

/** Evaluate the ORIGINAL value of a const literal from the source. */
export function evalOriginalConst<T = unknown>(html: string, name: string): T {
  const src = extractConstSource(html, name);
  return new Function(`${src}\nreturn ${name};`)() as T;
}

/**
 * Compile a scope from a list of source fragments (consts/functions extracted
 * above, plus any `extra` preamble like `let FXC='USD';`) and return the value
 * of `returnExpr` evaluated in that scope.
 */
export function compileScope<T = unknown>(sources: string[], returnExpr: string): T {
  const body = `${sources.join('\n')}\nreturn (${returnExpr});`;
  return new Function(body)() as T;
}
