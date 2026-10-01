/**
 * What a result means, how it was produced, and what follows from it.
 *
 * Every calculator here used to end the same way: a number, a caveat, and a
 * button that threw the number away and started again. That is the shape of a
 * calculator, and this product is trying to be a system — Understand →
 * Calculate → Plan → Track — which only holds if the answer says what it means
 * and where it leads.
 *
 * So one component, rendered under every result, in a fixed order:
 *
 *   What this means      an interpretation of THIS result, written by the page
 *   How this is calculated   a drawer: method, your inputs, the assumptions,
 *                            the market and its sources, the limits
 *   What you could do next   things to check or think about — never directives
 *   Continue in FinatriX     two or three genuinely related destinations
 *
 * ONE COMPONENT, NOT EIGHT
 * ------------------------
 * The methodology drawer in particular had started to appear in three different
 * shapes across the tools, and a fourth was about to be written. A reader who
 * learns to open "How this is calculated" on the budget page should find the
 * same control, in the same place, saying the same kinds of things, on the goal
 * planner. That consistency is the trust claim; a bespoke disclosure per tool
 * is just eight disclaimers.
 *
 * NOTHING HERE IS NEW CONTENT
 * ---------------------------
 * `method` and `limits` come from `TOOL_GUIDES` — the same registry the tool's
 * own education footer and the crawlable HTML render, so the drawer can never
 * describe a different calculation from the page it sits on. The market's
 * review date and sources come from the market pack. Only `meaning`, `inputs`
 * and `assumptions` are supplied per page, because only those depend on what
 * the reader actually typed.
 *
 * PROGRESSIVE DISCLOSURE
 * ----------------------
 * The drawer is a native `<details>`: keyboard-operable, announced as an
 * expandable group, and closed by default so the default result view stays a
 * result rather than a specification. Opening one is tracked, because whether
 * people actually inspect the workings is the only evidence that "with the
 * workings shown" is a real differentiator rather than a slogan.
 */

import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { track } from '../../lib/analytics';
import { guideForMarket } from '../lib/markets/guides';
import { outcomeFor } from '../../shared/nextSteps';
import type { ToolId } from '../../shared/routes';
import type { MarketPack } from '../lib/markets';
import { reviewedLabel } from '../../shared/reviewed';
import { ReferenceRows } from './ReferenceDisclosure';
import { referenceLimitsFor } from '../../reference/methodology';

/** One `label: value` row in the "your inputs" / "assumptions" tables. */
export interface MethodRow {
  label: string;
  value: string;
}

/**
 * Which of the three kinds of number a block contains.
 *
 * Rendered as a sibling of the `h3` rather than inside it, deliberately: inside,
 * it would become part of the heading's accessible name, so a screen-reader user
 * would hear "Your inputs, Known" where a sighted reader sees a heading and a
 * tag. The legend at the foot of the drawer defines the three words once.
 */
function TierTag({ tier }: { tier: 'KNOWN' | 'ASSUMED' | 'REFERENCE' }) {
  const label = tier === 'KNOWN' ? 'Known' : tier === 'ASSUMED' ? 'Assumed' : 'Published';
  return (
    <span className="fx-tier" data-tier={tier}>
      {label}
    </span>
  );
}

function Rows({ rows }: { rows: readonly MethodRow[] }) {
  return (
    <dl className="fx-method-rows">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface MethodologyProps {
  /** Which calculator's method and limits to show. */
  toolId: ToolId;
  /** What the reader entered, as it was actually used. */
  inputs?: readonly MethodRow[];
  /** The figures the tool supplied rather than the reader — rates, inflation, horizons. */
  assumptions?: readonly MethodRow[];
  /** The active market, when the result depends on one. Supplies sources + review date. */
  market?: MarketPack | null;
  /** Overrides the default summary label. */
  summary?: string;
  /**
   * The sum this result is about, where there is one.
   *
   * Lets the reference rows say how a figure sits against a statutory limit.
   * Amount and currency travel together in one object because they are only
   * meaningful together: a bare number compared against a limit denominated in
   * something else produces a confident sentence about two unrelated figures.
   *
   * Optional, and its absence simply removes that one sentence — this drawer is
   * opened before any input exists as often as after.
   */
  subject?: { readonly amount: number; readonly currency: string };
}

/**
 * "How this is calculated" — the full disclosure, behind one disclosure control.
 *
 * Renders only the parts it has: a tool with no market data shows no sources
 * block rather than an empty heading, and a result with no assumptions of its
 * own shows method, inputs and limits alone.
 */
export function Methodology({
  toolId,
  inputs,
  assumptions,
  market,
  summary = 'How this is calculated',
  subject,
}: MethodologyProps) {
  const guide = guideForMarket(toolId, market);
  /**
   * Limitations that come from the reference DATA rather than from the method.
   *
   * Kept separate from `guide.limits` in the registry and merged only here, at
   * the point of display: the two answer different questions ("what this
   * calculation does not do" versus "what the evidence for this market does not
   * support"), they change on different schedules, and a reader wants both in
   * one list. Hooks must run unconditionally, so this is computed for every
   * tool and is simply empty for the ones with no market data.
   */
  const referenceLimits = useMemo(() => referenceLimitsFor(toolId, market?.id ?? 'IN'), [toolId, market?.id]);
  // `onToggle` fires on close as well as open; only the open is interesting,
  // and a ref rather than state because nothing renders differently either way.
  const opened = useRef(false);
  const onToggle = useCallback(
    (e: React.SyntheticEvent<HTMLDetailsElement>) => {
      if (!e.currentTarget.open || opened.current) return;
      opened.current = true;
      track('methodology_opened', { tool: toolId });
    },
    [toolId],
  );

  return (
    <details className="fx-method fx-method-card fx-method-full" onToggle={onToggle}>
      <summary>{summary}</summary>

      {/* Plain `div`s with real headings rather than labelled `<section>`s: a
          labelled section is a landmark, and four landmarks nested inside a
          disclosure inside a page turns landmark navigation — the main way a
          screen-reader user skims — into noise. Headings are the right
          structure for subsections, and `h3` continues the outline under the
          block's own `h2` without skipping a level. */}
      <div className="fx-method-body">
        <div>
          <h3>The method</h3>
          <ul>
            {guide.method.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>

        {inputs && inputs.length > 0 && (
          <div>
            <h3>Your inputs</h3>
            <TierTag tier="KNOWN" />
            <Rows rows={inputs} />
          </div>
        )}

        {assumptions && assumptions.length > 0 && (
          <div>
            <h3>Assumptions used</h3>
            <TierTag tier="ASSUMED" />
            <Rows rows={assumptions} />
            <p className="fx-method-hint">
              These are the assumptions used for this result, as labelled above. They are not forecasts. Check your market in{' '}
              <Link to="/tools/settings" className="fx-method-link">
                Settings
              </Link>{' '}
              if a different set fits you better.
            </p>
          </div>
        )}

        {market && (
          <div>
            <h3>Market and sources</h3>
            <TierTag tier="REFERENCE" />
            <Rows
              rows={[
                { label: 'Market', value: market.name },
                { label: 'Figures last reviewed', value: reviewedLabel(market.asOf) },
              ]}
            />
            <p className="fx-method-hint">
              Sources: {market.sources.join('; ')}. Maintained by hand. Published references carry their own dates. User-entered rates and illustrative planning scenarios are not measured market averages.
            </p>
          </div>
        )}

        {/* Published rules and statistics, each with its own effective date,
            review status and link. Renders nothing for a tool whose answer
            depends on no external figure. */}
        {market && (
          <ReferenceRows
            toolId={toolId}
            market={market.id}
            amount={subject?.amount}
            amountCurrency={subject?.currency}
          />
        )}

        <div>
          <h3>What it assumes, and what it does not do</h3>
          <ul>
            {guide.limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
            {market &&
              referenceLimits.map((l) => (
                <li key={l}>{l}</li>
              ))}
          </ul>
        </div>

        {/* Defined once, at the foot, rather than repeated as a tooltip on every
            tag. The distinction it draws — measured, chosen, published — is the
            one a reader needs in order to know which numbers on the screen they
            are allowed to disagree with. */}
        <p className="fx-method-hint fx-tier-legend">
          <b>Known</b> — entered from your information. <b>Assumed</b> — a planning choice you can
          change. <b>Published</b> — an external figure, with its source and date. Every result
          above is calculated from these and is not a forecast.
        </p>

        <p className="fx-method-hint">
          This is an educational model, not financial advice, and none of it is personalised to
          your circumstances.{' '}
          <Link to="/editorial-standards" className="fx-method-link">
            How we check our work
          </Link>
          .
        </p>
      </div>
    </details>
  );
}

/**
 * The full Result → Explanation → Action → Next step block.
 *
 * `meaning` is the only required piece of prose, and it belongs to the page
 * because only the page knows what the reader's particular result says. The
 * rest is assembled from the registries.
 */
export function ResultExplainer({
  toolId,
  meaning,
  inputs,
  assumptions,
  market,
  subject,
}: MethodologyProps & { meaning: ReactNode }) {
  const outcome = outcomeFor(toolId);

  return (
    <section className="fx-outcome" aria-labelledby={`fx-outcome-${toolId}`}>
      <h2 id={`fx-outcome-${toolId}`} className="fx-outcome-title">
        What this means
      </h2>
      <p className="fx-outcome-meaning">{meaning}</p>

      <Methodology
        toolId={toolId}
        inputs={inputs}
        assumptions={assumptions}
        market={market}
        subject={subject}
      />

      {outcome && outcome.actions.length > 0 && (
        <>
          <h3 className="fx-outcome-sub">What you could do next</h3>
          <ul className="fx-outcome-actions">
            {outcome.actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      )}

      {outcome && outcome.next.length > 0 && (
        <>
          <h3 className="fx-outcome-sub">Continue in FinatriX</h3>
          <ul className="fx-outcome-next">
            {outcome.next.map((n) => (
              <li key={n.href}>
                <Link
                  to={n.href}
                  className="fx-outcome-link"
                  onClick={() => track('next_step_clicked', { tool: toolId, route: n.href })}
                >
                  <span className="fx-outcome-link-label">
                    {n.label}
                    <span aria-hidden="true"> →</span>
                  </span>
                  <span className="fx-outcome-link-reason">{n.reason}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
