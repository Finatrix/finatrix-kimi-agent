# FinatriX Careers — Phase 3: AI Application Intelligence Engine

All 20 modules from the Phase 3 spec, built on top of Phase 1/2 without
rewriting either. Every service, prompt, validator and page follows the
existing conventions (owner-scoped RLS, `mapSupabaseError`, cached AI via
`analysisCache`, `sanitize*` on every write, `CareersError` + `toCareersError`
in the UI).

## Architecture summary

```
supabase/careers_phase3_schema.sql   New tables (see below) + RLS + triggers,
                                      reusing careers_touch_updated_at().

src/careers/types/phase3.ts          Row + domain types for every new table.
src/careers/types/jobs.ts            Extended: InterviewQuestion.modelAnswer,
                                      QUESTION_CATEGORIES (+finance/risk/aml/
                                      compliance), QUESTION_DIFFICULTIES
                                      (+expert), InterviewFeedback.scores
                                      (+structure/problemSolving/grammar/
                                      fluency), interview workspace fields,
                                      CoverLetterLength, CareerHealth
                                      (+promotionReadiness/roleReadiness),
                                      CoachReport (+marketTrends/salaryForecast),
                                      Reminder.kind (+assessment_due/
                                      resume_outdated).

src/careers/ai/prompts-phase3.ts     Prompts: email generator, offer analysis.
src/careers/ai/validate-phase3.ts    Validators for the above (strict, same
                                      contract as validate-jobs.ts).
src/careers/ai/tasks-phase3.ts       generateEmailWithAI, analyzeOfferWithAI.

src/careers/services/*.ts            One service per module (below).
src/careers/pages/*.tsx              One page per module needing a route;
                                      Modules 1/2/15/16/18/20 extend existing
                                      Applications/Dashboard/Coach/Interview
                                      pages instead of adding new ones.
```

## Module → implementation map

| # | Module | Where |
|---|---|---|
| 1–2 | Application Workspace + Timeline | `ApplicationsPage.tsx` — the existing detail modal gained **Tasks** and **Emails** sections scoped to the application; Timeline was already there (Phase 2, immutable `application_history`). |
| 3 | Resume Tailoring Engine | `services/resumeTailoring.ts` (new `resume_tailored_versions` table) + `JobsPage.tsx` tailor tab: side-by-side original/improved, per-section **Accept this change** checkbox, persisted. The original `resume_versions` row is never mutated. |
| 4 | Cover Letter Intelligence | `COVER_LETTER_TONES` extended to all 16 requested tones (added experienced/consulting/academic/healthcare); new `CoverLetterLength` (short/standard/detailed) threaded through the prompt → AI task → service → `CoverLetterModal.tsx`. Export formats (PDF/DOCX/Markdown/plain text) were already in `services/exports.ts`. |
| 5 | AI Email Generator | `services/emails.ts` (new `generated_emails` table) + `ai/prompts-phase3.ts` (11 email kinds) + `ApplicationsPage.tsx` workspace section. |
| 6 | Recruiter CRM | `services/recruiters.ts` (`recruiters` + `recruiter_interactions`) + `RecruitersPage.tsx`: relationship score auto-increments on logged contact. |
| 7 | Networking CRM | `services/networking.ts` (`network_contacts` + `network_interactions`) + `NetworkPage.tsx`: follow-up due list. |
| 8 | Interview Workspace | `interview_sessions` extended with round/type/scheduled_at/location/meeting_link/interviewers/recording_links/outcome; editable panel in `InterviewPrepPage.tsx`. |
| 9 | AI Interview Simulator | `QUESTION_CATEGORIES` +finance/risk/aml/compliance, `QUESTION_DIFFICULTIES` +expert, `InterviewQuestion.modelAnswer`; prompt updated to request them. |
| 10 | AI Feedback Engine | `InterviewFeedback.scores` +structure/problemSolving/grammar/fluency; prompt + validator updated. |
| 11 | Assessment Center | `services/assessments.ts` (`assessments` table) + `AssessmentsPage.tsx`. |
| 12–13 | Offer Management + AI Analysis | `services/offers.ts` (`offers` table) + `OffersPage.tsx`: comparison table, `analyzeOfferWithAI` → pros/cons/negotiation/risk/recommendation/score. |
| 14 | Task Manager | `services/tasks.ts` (`tasks` table) + `TasksPage.tsx`, also surfaced per-application in the workspace. |
| 15 | Calendar Integration | `services/calendar.ts` — RFC 5545 `.ics` generator (Google/Outlook/Apple all import the same format); wired into `ApplicationsPage.tsx`'s existing month/week calendar view as an **Export .ics** button. |
| 16 | Notification Engine | Existing `services/reminders.ts` already covered deadline/interview/offer_expiry/follow_up/inactive; extended `Reminder.kind` + `services/automation.ts` add assessment_due and resume_outdated, merged into the same `notifications` sync path. |
| 17 | Analytics | `CareersDashboard.tsx` — funnel bars, response/interview/offer/acceptance rate, monthly trend, reusing `computeApplicationStats` (Phase 2). |
| 18 | AI Career Advisor | `CareerHealth.promotionReadiness/roleReadiness` (deterministic in `health.ts`, AI-overridable), `CoachReport.marketTrends/salaryForecast` (prompt + validator), and a **weekly/monthly review** panel in `CareerCoachPage.tsx` from `services/automation.ts` (zero AI cost). |
| 19 | AI Knowledge Base | `services/knowledge.ts` (`knowledge_items` table) + `KnowledgeBasePage.tsx`; `knowledgeDigest()` is ready for the STAR builder to consume (wiring into `buildStarPrompt` is a follow-up, not yet done — see Known gaps). |
| 20 | Automation Engine | `services/automation.ts`: assessment/resume reminders (feeds Module 16), weekly/monthly digest (feeds Module 18). Follow-up/networking reminders already existed (`reminders.ts` follow_up kind, `networking.ts` `dueFollowUps`). |

## New database tables

`supabase/careers_phase3_schema.sql`: `tasks`, `resume_tailored_versions`,
`generated_emails`, `recruiters`, `recruiter_interactions`,
`network_contacts`, `network_interactions`, `assessments`, `offers`,
`knowledge_items` — every one owner-scoped RLS (select/insert/update/delete
`auth.uid() = user_id`), `updated_at` triggers reusing
`careers_touch_updated_at()`. Also extends `interview_sessions` with 8 new
columns (workspace fields) via `alter table ... add column if not exists`,
safe to re-run.

## Testing

- `src/test/careers3.phase3-engine.test.ts` — 10 new regression tests: career
  health readiness bounds, automation reminders (assessment due / resume
  stale, both positive and negative cases), periodic review content, ICS
  RFC 5545 escaping and structure, task upcoming/overdue split, networking
  follow-up windowing.
- `src/test/careers2.validate-jobs.test.ts` updated for the extended
  `InterviewFeedback.scores` shape (existing test, no behavior change).
- Full suite: **738/738 passing**, 39 files.

## Quality gates (automated)

✅ TypeScript — 0 errors
✅ ESLint — 0 errors
✅ Tests — 738/738 passing
✅ Production build — green

## Known gaps / follow-ups (honest accounting, not swept under the rug)

- **Live/manual verification is blocked on you.** `supabase/careers_phase3_schema.sql`
  has not been run against the project yet — none of the ten new tables
  exist in the database, so the 6 new pages (Tasks, Recruiters, Network,
  Assessments, Offers, Knowledge Base) and the extended Applications
  workspace will error on load until it's applied. This mirrors the Phase 2.1
  situation: schema/deploy actions are production changes I don't take
  without you.
- **Knowledge Base is not yet wired into the STAR builder.** `knowledgeDigest()`
  exists and is ready, but `buildStarPrompt` in `prompts-jobs.ts` doesn't call
  it yet — STAR answers still draw only from the resume, not saved stories.
- **Email/push notification channels are not implemented** — Module 16's
  "Support Email / Push / In-app" only delivers in-app, consistent with the
  existing Phase 2 `alerts` config comment ("only the in-app channel is
  delivered in this phase"). Extending to email/push needs a server-side
  mailer/push provider, out of scope for a client-only change.
- **Accessibility/dark-mode/performance** were not independently re-audited
  beyond reusing the existing design system's components (`fx-modal`,
  `card`, `badge-*`, `cat-row`/`bar-fill`, `PageHead`/`ToolFoot`) — no new
  colors, fonts or interaction patterns were introduced.
- Rich Text (RTF) cover-letter export was interpreted as the existing
  Markdown/plain-text exports rather than a new binary RTF writer — no RTF
  library existed in the project and adding one for one format felt like
  scope creep given the existing PDF/DOCX/MD/TXT coverage.

## Migration guide

1. Run `supabase/careers_phase3_schema.sql` against the project (after Phase 1
   + Phase 2 schemas). It is idempotent (`if not exists` / `add column if not
   exists` throughout) — safe to re-run.
2. No new secrets or edge functions — Phase 3 reuses the existing
   `careers-ai` edge function and OpenRouter provider layer for all new AI
   calls (email generator, offer analysis, extended coach/interview prompts).
3. No breaking changes to Phase 1/2 consumers: `InterviewQuestion`,
   `InterviewFeedback`, `CareerHealth`, `CoachReport`, `Reminder` all gained
   fields (superset), not removed/renamed fields. One existing test fixture
   (`careers2.validate-jobs.test.ts`) was updated because it hard-coded the
   old `InterviewFeedback.scores` shape.
4. New nav items (Tasks, Recruiters, Network, Assessments, Offers, Knowledge
   Base) appear automatically in `CAREERS_NAV` — no manual routing needed
   beyond what's already in `App.tsx`.

## Production checklist

- [ ] Run `careers_phase3_schema.sql` against production Supabase
- [ ] Manually exercise each new page against live data (Tasks, Recruiters,
      Network, Assessments, Offers, Knowledge Base, Application workspace
      Tasks/Emails tabs, Interview workspace scheduling, Tailoring
      accept-flow, Cover Letter length/tone, Coach readiness/market/review)
- [ ] Confirm AI cost impact is acceptable (new AI tasks: email generation,
      offer analysis; existing tasks got slightly larger prompts — coach,
      interview questions, interview feedback, cover letter)
- [ ] Re-run `npx tsc -b && npx eslint . && npx vitest run && npm run build`
      after applying the schema, to catch anything schema-shape-dependent
- [ ] Commit only after the above are done (per the standing project rule)
