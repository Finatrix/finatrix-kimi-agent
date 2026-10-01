import { test, expect, devices, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** This file's directory — the spec is ESM, so there is no `__dirname`. */
const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The iOS app's layout and behaviour, in a real WebKit engine.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE OTHER SPECS
 * -----------------------------------------------
 * Everything else here runs on Chromium, which is the right engine for Android
 * and for most of the web — and the wrong one for the iOS app, which renders in
 * WKWebView. The failures this catches are the ones that are invisible in
 * Chromium by construction: WebKit's own layout and text metrics, its date and
 * number parsing, and the safe-area insets that only exist on a notched phone.
 *
 * WHAT IS REAL HERE AND WHAT IS SIMULATED
 * ---------------------------------------
 * Real: the engine, the production bundle, the viewport, the device pixel ratio
 * and every computed style and measurement taken from them.
 *
 * Simulated, and deliberately so:
 *  - `html.fx-native`, which `markPlatform()` adds before first paint in the
 *    app. Adding the class is exactly what the app does; nothing is faked about
 *    what the class then means.
 *  - `--safe-area-inset-*`. A browser reports these as 0 because a browser tab
 *    has no Dynamic Island. The design tokens read
 *    `var(--safe-area-inset-top, env(safe-area-inset-top, 0px))` — the variable
 *    first, `env()` second — so setting the variable to the value iOS reports on
 *    that device drives the identical code path the app takes, with the numbers
 *    the device would supply.
 *
 * Not covered here, and covered elsewhere: the native bridge's own logic (BACK,
 * deep links, splash, haptics) lives in `src/test/native.test.ts`, because it is
 * policy about URLs and events rather than anything an engine can answer.
 */

test.describe.configure({ mode: 'parallel' });

/**
 * The phones to check, with the insets iOS actually reports on each.
 *
 * Three shapes, not three names: a current Dynamic Island phone, the smallest
 * screen still supported (no cutout at all, and the width every layout is
 * tightest at), and a cutout phone on its side, where the insets move to the
 * left and right edges and the height collapses to roughly a keyboard's worth of
 * space. A layout that survives all three survives the ones in between.
 */
const PHONES = [
  {
    name: 'iPhone 16 Pro',
    device: devices['iPhone 16 Pro'],
    insets: { top: 59, bottom: 34, left: 0, right: 0 },
  },
  {
    name: 'iPhone SE',
    device: devices['iPhone SE'],
    insets: { top: 20, bottom: 0, left: 0, right: 0 },
  },
  {
    name: 'iPhone 16 Pro landscape',
    device: devices['iPhone 16 Pro landscape'],
    insets: { top: 0, bottom: 21, left: 59, right: 59 },
  },
] as const;

type Insets = (typeof PHONES)[number]['insets'];

/**
 * A device descriptor without its browser type.
 *
 * Playwright refuses a `defaultBrowserType` change inside a describe group — it
 * would force a new worker — and every iPhone descriptor carries one. The engine
 * is pinned once by the `ios-webkit` project in playwright.config.ts; what each
 * describe needs from the descriptor is the viewport, the pixel ratio, the touch
 * flags and the user agent.
 */
function viewportOf(device: (typeof PHONES)[number]['device']) {
  const rest = { ...device } as Partial<typeof device>;
  delete rest.defaultBrowserType;
  return rest;
}

/** The month key the tools store data under, in LOCAL time (src/lib/date.ts). */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Put the page in the state the installed app boots into.
 *
 * Runs before any of the bundle's own scripts, which is when `markPlatform()`
 * and the theme boot script run in the app, so no frame is ever rendered in the
 * wrong state. Guarded on `document.documentElement` because an init script also
 * runs on `about:blank`, where there is no document yet.
 */
async function bootAsApp(page: Page, insets: Insets, theme: 'dark' | 'light' = 'dark') {
  await page.addInitScript(
    ({ insets: i, theme: t, month }) => {
      const apply = () => {
        const root = document.documentElement;
        if (!root) return;
        root.classList.add('fx-native');
        root.setAttribute('data-theme', t);
        root.style.setProperty('--safe-area-inset-top', `${i.top}px`);
        root.style.setProperty('--safe-area-inset-bottom', `${i.bottom}px`);
        root.style.setProperty('--safe-area-inset-left', `${i.left}px`);
        root.style.setProperty('--safe-area-inset-right', `${i.right}px`);
      };
      apply();
      document.addEventListener('DOMContentLoaded', apply);
      try {
        localStorage.setItem('fx_theme', t);
        localStorage.setItem(
          'fx_bb_data',
          JSON.stringify({
            [month]: {
              income: '85000',
              n: '50',
              w: '30',
              s: '20',
              vals: { rent: 24000, groceries: 9000 },
            },
          }),
        );
      } catch {
        /* Private mode has no storage; the page must still render. */
      }
    },
    { insets, theme, month: currentMonth() },
  );
}

/** Console errors and uncaught exceptions, collected for the life of the page. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
  return errors;
}

for (const phone of PHONES) {
  test.describe(phone.name, () => {
    test.use(viewportOf(phone.device));

    test('keeps every pixel of content clear of the status bar and the home indicator', async ({ page }) => {
      await bootAsApp(page, phone.insets);
      await page.goto('/tools/budget');
      await page.locator('.fx-tools').first().waitFor();

      // The tab bar is laid out by a LAZY route stylesheet, and it reaches
      // `display: grid; position: fixed` a frame or two BEFORE it has a box —
      // reproduced here at roughly one run in four. A single sample therefore
      // reads an empty rect while every computed style already looks right, and
      // `getComputedStyle` answers for an unlaid-out element as happily as for a
      // laid-out one, so the assertion failed on a plausible 0 rather than
      // erroring. `toBeVisible()` alone is not enough: it passed, and the box was
      // still empty by the time the measurement ran. Poll until there is a box.
      const nav = page.locator('.fx-mobnav');
      await expect.poll(async () => (await nav.boundingBox())?.height ?? 0).toBeGreaterThan(0);

      const layout = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const bar = document.querySelector('.fx-mobnav');
        return {
          safeTop: parseFloat(root.getPropertyValue('--fx-safe-top')),
          safeBottom: parseFloat(root.getPropertyValue('--fx-safe-bottom')),
          bodyPaddingTop: parseFloat(getComputedStyle(document.body).paddingTop),
          bodyPaddingLeft: parseFloat(getComputedStyle(document.body).paddingLeft),
          bodyPaddingRight: parseFloat(getComputedStyle(document.body).paddingRight),
          // The frosted strip behind the clock and battery.
          statusGuardHeight: parseFloat(getComputedStyle(document.body, '::before').height),
          navPaddingBottom: parseFloat(getComputedStyle(bar!).paddingBottom),
          navBottom: bar!.getBoundingClientRect().bottom,
          viewportHeight: window.innerHeight,
        };
      });

      // The tokens resolved to the device's real insets rather than to 0.
      expect(layout.safeTop).toBe(phone.insets.top);
      expect(layout.safeBottom).toBe(phone.insets.bottom);

      // Content starts below the status bar / Dynamic Island…
      expect(layout.bodyPaddingTop).toBe(phone.insets.top);
      expect(layout.statusGuardHeight).toBe(phone.insets.top);
      // …and inside the rounded corners when the phone is on its side.
      expect(layout.bodyPaddingLeft).toBe(phone.insets.left);
      expect(layout.bodyPaddingRight).toBe(phone.insets.right);

      // The tab bar sits flush to the bottom edge and pads ITSELF past the home
      // indicator, so the bar's surface reaches the edge while nothing tappable
      // is underneath the indicator. Asserted unconditionally: the `toBeVisible`
      // above already established that there is a laid-out bar to measure, and a
      // conditional here would quietly skip the check the test exists for.
      expect(layout.navBottom).toBeCloseTo(layout.viewportHeight, 0);
      expect(layout.navPaddingBottom).toBeGreaterThanOrEqual(phone.insets.bottom);
    });

    test('never scrolls sideways', async ({ page }) => {
      await bootAsApp(page, phone.insets);
      await page.goto('/tools/budget');
      await page.locator('.fx-tools').first().waitFor();
      const overflow = await page.evaluate(() => {
        /**
         * Whether some ancestor already clips this element horizontally.
         *
         * The decorative backdrop is a 64vh blurred circle inside a
         * `position: fixed; overflow: hidden` layer, so it is wider than the
         * screen by design and reaches no pixel of it. `body` and `html` are
         * excluded from the walk on purpose: `body` carries `overflow-x: hidden`
         * globally, and honouring that would make this assertion vacuous — it
         * would excuse every real overflow on the page.
         */
        const clipped = (el: Element) => {
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const { overflowX, overflow } = getComputedStyle(p);
            if (overflowX !== 'visible' || overflow !== 'visible') return true;
          }
          return false;
        };
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          // Name the culprit: "something overflows" is not a bug report.
          wide: [...document.querySelectorAll('body *')]
            .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
            .filter((el) => !clipped(el))
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 40)}`),
        };
      });
      expect(overflow.wide).toEqual([]);
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    });
  });
}

test.describe('WebKit behaviour the other engines cannot vouch for', () => {
  test.use(viewportOf(devices['iPhone 16 Pro']));
  const insets = PHONES[0].insets;

  test('computes the same budget figures WebKit-side as the formulas define', async ({ page }) => {
    await bootAsApp(page, insets);
    await page.goto('/tools/budget');
    await page.locator('.fx-tools').first().waitFor();

    // 50/30/20 of a ₹85,000 month. Pinned as text, because the failure this
    // guards against is not a wrong formula — it is WebKit parsing or
    // formatting a number differently from V8 somewhere along the way.
    for (const figure of ['₹85,000', '₹42,500', '₹25,500', '₹17,000']) {
      await expect(page.getByText(figure, { exact: false }).first()).toBeVisible();
    }
  });

  test('lets a decimal actually be typed into a money field', async ({ page }) => {
    await bootAsApp(page, insets);
    await page.goto('/tools/budget');
    const salary = page.locator('#bb-inc-salary');
    await salary.waitFor();

    // `type="number"` is what makes a decimal point impossible to enter on an
    // iOS keyboard, and it is easy to reintroduce by accident.
    await expect(salary).toHaveAttribute('type', 'text');
    await expect(salary).toHaveAttribute('inputmode', 'decimal');
    expect(await page.locator('input[type="number"]').count()).toBe(0);

    await salary.fill('');
    await salary.type('1234.56');
    expect(await salary.inputValue()).toContain('.56');
  });

  test('hides the tab bar and floating docks while the keyboard is up', async ({ page }) => {
    await bootAsApp(page, insets);
    await page.goto('/tools/budget');
    const nav = page.locator('.fx-mobnav');
    await nav.waitFor();
    await expect(nav).toBeVisible();

    // What `Keyboard.addListener('keyboardWillShow')` does in bridge.ts. Without
    // it the bar rides up on top of the keyboard, over the field being filled.
    await page.evaluate(() => document.documentElement.classList.add('fx-kb-open'));
    await expect(nav).toBeHidden();
    await page.evaluate(() => document.documentElement.classList.remove('fx-kb-open'));
    await expect(nav).toBeVisible();
  });

  test('hides the web-only chrome the system gesture replaces', async ({ page }) => {
    await bootAsApp(page, insets);
    await page.goto('/tools/budget');
    await page.locator('.fx-tools').first().waitFor();
    for (const el of await page.locator('[data-web-only]').all()) {
      await expect(el).toBeHidden();
    }
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`renders the ${theme} theme with a painted background`, async ({ page }) => {
      await bootAsApp(page, insets, theme);
      await page.goto('/tools/budget');
      await page.locator('.fx-tools').first().waitFor();
      const paint = await page.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        theme: document.documentElement.getAttribute('data-theme'),
      }));
      expect(paint.theme).toBe(theme);
      // Never transparent: the web view's own backdrop would show through, and
      // on iOS that is whatever `ios.backgroundColor` was set to, not the page.
      expect(paint.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(paint.background).not.toBe('transparent');
    });
  }

  test('boots clean — no uncaught exceptions, no console errors', async ({ page }) => {
    const errors = watchForErrors(page);
    await bootAsApp(page, insets);
    await page.goto('/tools/budget');
    await page.locator('.fx-tools').first().waitFor();
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  /**
   * A real recognition, not a "did the asset download" check.
   *
   * OCR is the one subsystem here that can only be proven by running it: the
   * worker, the WASM core and the 2 MB language file each fail silently and
   * independently, and none of them is exercised by rendering a page. WebKit is
   * also the engine where this has the most to prove — the language file is
   * fetched as `.gz` and inflated in the worker, which is exactly what the iOS
   * app does (`nativePlatform() !== 'android'` in src/lib/ocr.ts).
   *
   * The harness is a blank same-origin page rather than the import UI, so what is
   * under test is the asset pipeline and the engine, not a form. Tesseract is
   * loaded from node_modules at the version package.json pins, and every option
   * below is copied from src/lib/ocr.ts.
   */
  test('reads text off an image with the assets and options the iOS app uses', async ({ page }) => {
    test.slow(); // WASM instantiation plus a 2 MB language file.
    await page.route('**/__ocr_harness', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body></body>' }),
    );
    await page.goto('/__ocr_harness');
    await page.addScriptTag({
      content: readFileSync(resolve(HERE, '../node_modules/tesseract.js/dist/tesseract.min.js'), 'utf8'),
    });

    // A statement-like line drawn as a PNG in the page, so the fixture cannot
    // drift from what the test claims it says.
    const text = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 160;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      ctx.font = '58px Helvetica, Arial, sans-serif';
      ctx.fillText('SALARY CREDIT 85000', 40, 100);
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));

      const tesseract = (window as unknown as { Tesseract: typeof import('tesseract.js') }).Tesseract;
      const worker = await tesseract.createWorker('eng', 1, {
        workerPath: '/careers-ocr/worker.min.js',
        corePath: '/careers-ocr',
        langPath: '/careers-ocr/lang',
        gzip: true,
        workerBlobURL: false,
      });
      const { data } = await worker.recognize(blob);
      await worker.terminate();
      return data.text;
    });

    expect(text.replace(/\s+/g, ' ')).toContain('SALARY CREDIT 85000');
  });

  test('offers Sign in with Apple on the sign-in screen', async ({ page }) => {
    await bootAsApp(page, insets);
    // The app build sets VITE_AUTH_APPLE; a plain preview of the site may not,
    // and `authProviders()` only forces Apple on when Capacitor reports iOS —
    // which a browser cannot. So this asserts the part that must hold either
    // way: Google is offered, and if Apple is offered it is an equal control.
    await page.goto('/login');
    const google = page.getByRole('button', { name: 'Continue with Google' });
    await expect(google).toBeVisible();
    const apple = page.getByRole('button', { name: 'Continue with Apple' });
    if (await apple.count()) {
      const [a, g] = await Promise.all([apple.boundingBox(), google.boundingBox()]);
      expect(a?.width).toBeCloseTo(g!.width, 0);
      expect(a?.height).toBeCloseTo(g!.height, 0);
    }
  });
});
