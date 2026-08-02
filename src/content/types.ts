/**
 * The block vocabulary an article body is written in.
 *
 * WHY BLOCKS RATHER THAN MARKDOWN OR JSX. Three reasons, in order of how much
 * they matter here:
 *
 *   1. The heading outline is guaranteed. Every section is an `<h2>` with a
 *      stable id, and nothing in the vocabulary can emit an `<h1>` or skip a
 *      level, so an article physically cannot ship the broken outline that is
 *      the most common accessibility defect in long-form content.
 *   2. It costs no dependency. A markdown pipeline would add a parser, a
 *      sanitiser and a plugin chain to a bundle whose whole point is to render
 *      fast from a search result; the charter's rule against unnecessary
 *      dependencies applies most strongly to the pages that need to be fastest.
 *   3. The table of contents, the reading time and the internal-link audit are
 *      all derived from the same structure, so they cannot describe an article
 *      that no longer exists.
 *
 * Prose fields accept a deliberately tiny inline syntax — `[label](/path)` and
 * `**bold**` — parsed by `src/learn/inline.tsx` into React elements. It is not
 * markdown and does not aspire to be: nothing in it can emit raw HTML, so a
 * body cannot inject markup even in principle.
 */

import type { FaqEntry } from '../shared/publicPages';
import type { ToolId } from '../shared/routes';

export type Block =
  /** Body copy. Supports the inline syntax. */
  | { kind: 'p'; text: string }
  /** A sub-heading inside a section. Renders `<h3>`; its id is derived from the text. */
  | { kind: 'h3'; text: string }
  /** A list. `ordered` renders `<ol>`. Items support the inline syntax. */
  | { kind: 'list'; items: readonly string[]; ordered?: boolean }
  /**
   * An aside. `note` for useful context, `warning` for something that costs
   * money or breaks an assumption if missed. Both render as a real `<aside>`
   * with a visible title, so the distinction is available to a screen reader
   * and not carried by colour alone (WCAG 1.4.1).
   */
  | { kind: 'note' | 'warning'; title: string; text: string }
  /**
   * A comparison table. `caption` is a real `<caption>` — a data table with no
   * caption gives a screen-reader user no way to know what they have landed in.
   */
  | {
      kind: 'table';
      caption: string;
      head: readonly string[];
      rows: readonly (readonly string[])[];
      note?: string;
    }
  /**
   * A named formula with its variables spelled out.
   *
   * The whole editorial premise of this site is that a reader can check any
   * number it quotes. That is only true if the formula is on the page, so this
   * block exists to make publishing one cheap.
   */
  | { kind: 'formula'; label: string; expression: string; where: readonly string[] }
  /** A worked example: named inputs, then the conclusion drawn from them. */
  | {
      kind: 'worked';
      title: string;
      rows: readonly { label: string; value: string }[];
      conclusion: string;
    }
  /** An inline pointer to the calculator that does this section's arithmetic. */
  | { kind: 'tool'; toolId: ToolId; text: string };

export interface ArticleSection {
  /** Stable anchor id. Also the table-of-contents target — never change one in isolation. */
  id: string;
  /** The `<h2>` text, and the table-of-contents label. */
  title: string;
  blocks: readonly Block[];
}

/** An external reference. Rendered as a visible source list at the foot of the article. */
export interface Source {
  label: string;
  url: string;
}

export interface ArticleBody {
  sections: readonly ArticleSection[];
  /**
   * Where a reader can verify anything the article asserts about rules or rates
   * that are set elsewhere. Present on any article that states a tax rule,
   * statutory limit or official rate; absent where every claim is arithmetic the
   * page already shows in full.
   */
  sources?: readonly Source[];
}

/* ------------------------------------------------------------------------- *
 * Editorial copy
 * ------------------------------------------------------------------------- *
 *
 * WHY THIS LIVES HERE AND NOT IN `shared/content.ts`.
 *
 * `shared/content.ts` is the URL index, and it is EAGER: it is imported by
 * `seo.ts` (on the landing critical path), by `routes.ts` (bundled into the edge
 * Worker) and by the footer, so every byte in it is downloaded by a visitor who
 * lands on the homepage and never opens a guide.
 *
 * The long-form editorial fields — a topic's cornerstone intro, its vocabulary
 * and its FAQ; an article's summary, key points and FAQ — are the bulk of the
 * corpus's metadata. Measured on the three-topic version of this platform they
 * were already the largest single contributor to the entry chunk, and at the
 * scale this registry is built for they would have added roughly 65 kB gzipped
 * to a 94 kB entry bundle: a ~70% regression on the landing page, to ship prose
 * that page never renders.
 *
 * So they live beside the bodies, in the SAME per-topic chunk, fetched only when
 * a reader opens that topic. One lazy import per topic now carries everything
 * heavy about it. The eager index keeps only what a URL needs to exist: slugs,
 * titles, descriptions, dates and relationships.
 *
 * The one consequence worth knowing about is structured data. `FAQPage`,
 * `DefinedTermSet` and the article `abstract` are all built from copy that lives
 * here, so `structuredDataForPath` takes it as an argument rather than importing
 * it — see the note there on who supplies it at the edge and in the browser.
 */

/** A term the topic hub defines. Anchors the entity for readers and answer engines alike. */
export interface Definition {
  term: string;
  definition: string;
}

/** The cornerstone copy a topic hub renders. */
export interface TopicCopy {
  /**
   * The cornerstone explanation. This is what stops a hub from being a link
   * list: it answers the topic's central question before offering to send the
   * reader anywhere else.
   */
  intro: readonly string[];
  /** Vocabulary the rest of the topic assumes. */
  definitions: readonly Definition[];
  /** Rendered on the hub AND emitted as FAQPage. Same array, so they cannot diverge. */
  faq: readonly FaqEntry[];
}

/** An article's own copy: the answer-first block, then the body. */
export interface ArticleContent extends ArticleBody {
  /**
   * The answer, first, in one paragraph.
   *
   * Rendered above the table of contents and emitted as the article's
   * `abstract`. Written so that it stands alone if it is the only thing a
   * reader — or an AI answer engine — takes from the page. Burying the answer
   * under 600 words of preamble is the single most common way a genuinely
   * useful article fails to be useful.
   */
  summary: string;
  /** Three to five checkable claims. Rendered as the key-takeaways block. */
  keyPoints: readonly string[];
  /** Rendered on the page AND emitted as FAQPage. Same array. */
  faq?: readonly FaqEntry[];
}

/** Everything heavy about one topic, in one lazily-fetched chunk. */
export interface TopicContent {
  topic: TopicCopy;
  /** Every article's copy and body, keyed by article slug. */
  articles: Record<string, ArticleContent>;
}
