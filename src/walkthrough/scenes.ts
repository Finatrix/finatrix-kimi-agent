import type { ReactElement } from 'react';
import type { WalkthroughExample } from './examples';
import { DONUT, GOAL, SHIELD, type ArtProps, type OrbCue } from './geometry';
import { GoalArt, LogArt, MonthArt, PrivacyArt } from './art';

/**
 * The film's script: four scenes, each a short piece of real copy (which is
 * what a screen reader hears and what carries the meaning), an illustration,
 * and where the orb goes when the scene arrives.
 */

export interface SceneDef {
  id: string;
  eyebrow: string;
  title: string;
  body: (ex: WalkthroughExample) => string;
  Art: (props: ArtProps) => ReactElement;
  orb: OrbCue[];
  /** Roughly how long the scene's choreography runs (drives the progress fill). */
  duration: number;
}

/* ── The film ───────────────────────────────────────────────────────── */

export const SCENES: SceneDef[] = [
  {
    id: 'month',
    eyebrow: 'Budget',
    title: 'Your month, in one clear picture.',
    body: () => 'Start from the 50/30/20 guide (half for needs, 30% for wants, 20% for savings) and shape it to fit your life. What you planned, spent and have left sit side by side.',
    Art: MonthArt,
    orb: [{ at: 0, x: DONUT.cx, y: DONUT.cy, s: 3.05 }],
    duration: 2400,
  },
  {
    id: 'log',
    eyebrow: 'Expenses',
    title: 'Log a spend in one line.',
    body: (ex) => `Type it the way you would say it, like “${ex.typed}”. FinatriX picks out the amount, the category and how you paid, and files it for you. You can change any of it later.`,
    Art: LogArt,
    orb: [{ at: 0, x: 46, y: 63, s: 0.62 }, { at: 2050, x: 50, y: 151, s: 0.78 }],
    duration: 3000,
  },
  {
    id: 'goal',
    eyebrow: 'Goals',
    title: 'Work back from what you want.',
    body: () => 'Give a goal a target and a deadline. The Goal Planner works backwards to what you would set aside each month, and shows its working.',
    Art: GoalArt,
    orb: [{ at: 0, x: GOAL.x0, y: GOAL.base - 2, s: 0.34 }],
    duration: 3400,
  },
  {
    id: 'privacy',
    eyebrow: 'Privacy',
    title: 'Your money stays yours.',
    body: () => 'No account needed to start. Your records stay on this device unless you sign in to sync them. No ads. AI help is optional, and it asks before anything is sent.',
    Art: PrivacyArt,
    orb: [{ at: 0, x: SHIELD.x, y: SHIELD.y, s: 2.15 }],
    duration: 2000,
  },
];
