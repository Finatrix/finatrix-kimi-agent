# The reference-data layer

`formula ≠ market rule ≠ published statistic ≠ planning assumption`

Four different kinds of number, held apart, each carrying the metadata its kind
requires — so that any market-sensitive result can say which market it used,
which assumptions went into it, where they came from, when they were last
checked, whether the user chose them, and what they do not cover.

## Why it exists

A legal threshold written into prose carries no effective date. The UK deposit
limit rose to £120,000 on 1 December 2025; the product went on saying £85,000 in
four separate sentences, and nothing could tell that it had lapsed because
nothing knew it was a dated fact rather than a sentence. That is the class of
bug this layer makes structurally impossible.

## The one-way dependency

```
  src/tools/**  ──imports──▶  src/reference/**
  src/reference/**  ──imports──▶  (nothing from tools)
```

Enforced by a test. A reference value that can reach into a calculator is no
longer a reference — it is an input, and the separation is gone.

## Map

| File | What it holds |
|---|---|
| `types.ts` | The vocabulary: markets, quality states, geographic scopes, failure behaviours, value tiers |
| `sources.ts` | 108 dated, clickable references with stable ids |
| `deposits.ts` | Statutory deposit protection, seven markets — one of them an absence |
| `inflation.ts` | Published CPI observations. Context, never a planning rate |
| `taxReference.ts` | Rate schedules, and the policy that keeps them out of the calculators |
| `retirement.ts` | What may be modelled and what must be asked, per market |
| `peerDatasets.ts` | Dataset metadata and named gaps. No benchmark value appears here |
| `heuristics.ts` | Rules of thumb classified by what kind of claim they actually are |
| `assumptions.ts` | Every reference projected into one uniform shape |
| `methodology.ts` | Which document explains which tool, at which version |
| `freshness.ts` | How current a reference is *now*, not when it was written down |
| `resolve.ts` | May this value be used for this purpose, and if not, what happens |
| `disclosure.ts` | The view model the UI renders |
| `gates.ts` | What is deliberately switched off, and the conflicts that were resolved |
| `copy.ts` | Disclosure phrasing, and the phrases that are never used |
| `validate.ts` | Structural errors that cannot be allowed to ship |
| `review.ts` | What needs a human to look at it, and how urgently |

## Rules that are enforced, not remembered

Each of these has a test that fails if it is broken.

- **A missing value is never zero.** `null` means not established. A deposit
  record with `limit: 0` is a validation error, because zero renders as a
  confident claim that nothing is protected.
- **No market-pack prose states a protection amount.** The figure lives once,
  dated, here. (India's is the exception: it is frozen inside a parity-pinned
  table and is therefore *checked against* this registry instead.)
- **A published reference must cite a source; a planning assumption must not.**
  Having no source is what makes something an assumption.
- **A statutory value is never user-editable.**
- **A region-specific rule never falls back to a national one.**
- **Published inflation never reaches a calculator.** A file-level test scans
  `tools/lib/**` for any import of the observations module.
- **No tax schedule is approved for automatic calculation, in any market.**
- **No peer dataset is ingested or cleared for percentile ranking.**
- **An unsupported rule of thumb carries no number and is not used.**
- **Banned phrasing never reaches a screen** through this layer — `copy.ts`
  holds the list, and every user-facing string is scanned against it.

## Adding or updating a reference

1. Edit the record in its domain registry (`deposits.ts`, `inflation.ts`, …).
   Update `lastVerified` and `reviewDue` to the day you actually checked it.
2. If it needs a source that does not exist yet, add it to `sources.ts` with a
   new id. **Never recycle an id** — saved results point at them.
3. Run `npm test -- reference`. The validator will name any record and rule you
   broke.
4. If the change closes a gate, edit that gate in `gates.ts`. If it contradicts
   something in the repository, add a `CONFLICTS` entry rather than silently
   preferring one side.

## Maintenance

`reviewReport(now)` lists everything past its review date, worst impact first.
It runs automatically in development when the tools mount, printing one console
line and nothing at all when everything is current. There is no admin surface
and no scheduled job, deliberately: nine dates do not justify a product.

A reference is escalated `VERIFIED_CURRENT → REVIEW_DUE` the day its review date
passes, and `→ STALE` a quarter after that. Nothing is ever promoted by code —
only a human re-checking the source can do that.

## What this layer deliberately does not do

- It does not compute a tax liability, anywhere.
- It does not project a statutory pension or retirement benefit, anywhere.
- It does not produce a peer percentile, anywhere.
- It does not convert currencies to compare an amount against a foreign limit.
- It does not guess a region it has not been given.

Each of those is a `canX()` function returning `false` rather than a comment, so
enabling one later is a change to a function and its test rather than a search
for every place the assumption was inlined.

## Remaining work

See `OPEN_GATES` in `gates.ts` — each entry names what the product does today and
what would have to be established to change it. In summary:

- **Peer statistics (G-06)** — licensed extraction of table cells or microdata,
  complete sample/weighting/precision metadata, and a statistical reviewer's
  sign-off on a cell-level uncertainty policy. Until then PeerCompare keeps its
  own labelled benchmark grids.
- **UAE deposit protection (G-01)** — an operative scheme regulation with member
  scope, cap and commencement date.
- **Australia (G-04) and Singapore (G-08)** — complete current-period tables
  before any contribution cap or CPF figure is stated anywhere.
- **Mainland China joint accounts (G-07)** — authoritative per-owner allocation.
- **Evidence snapshots (G-10)** — archived source versions with checksums, and
  confirmed redistribution terms, required before any third-party table cell is
  republished.

## Markets

Seven are researched. Four are offered in the tools, because a market enters the
picker only when it has a complete pack — instruments, tax treatment, peer
benchmarks, goal presets — and Australia, Singapore and Mainland China have
none. Their verified facts are published read-only at `/tools/reference`, with
their status stated at the top of the page so nobody mistakes "we know the
deposit cap" for "the tools work here".


## Seven-market activation

All seven markets are now available. AU, SG and Mainland CN use user-entered net cash rates and the separately verified `peerSummaries.ts` layer. Full distributions remain gated. See [activation notes](../../docs/seven-market-activation.md) for scope, evidence and the correction to the old report’s percentile claim.
