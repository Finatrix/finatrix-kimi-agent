import type { Page } from '@playwright/test';

export interface FocusWalk {
  /** Distinct elements focus reached. */
  stops: number;
  /** Stops with no visible focus indicator (WCAG 2.4.7). */
  noRing: string[];
  /** Stops whose centre was covered by something else (WCAG 2.4.11). */
  obscured: string[];
}

export function walkFocus(page: Page, max?: number): Promise<FocusWalk>;
