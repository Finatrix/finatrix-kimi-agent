import { BrandLogo } from './BrandLogo';

/**
 * The FinatriX lockup: the mark plus "FinatriX" in Geist, the X in gold.
 *
 * One component for every header — landing, tools, careers, sign-in, legal and
 * onboarding. They had drifted into five versions: a mono all-caps "FINATRIX"
 * in the tools, two hand-drawn SVG marks that were not the logo, and three
 * different text sizes. The gold X is one of the three places gold is spent
 * (brand, primary action, selection).
 *
 * Decorative text only: the link around it carries the accessible name.
 */
export function Wordmark({ logo = 24, suffix }: { /** Mark size in px. */ logo?: number; /** A product name after the wordmark, e.g. "Careers". */ suffix?: string }) {
  return (
    <span className="fx-lockup">
      <BrandLogo size={logo} className="shrink-0" />
      <span className="fx-wordmark" aria-hidden="true">
        Finatri<span className="fx-wordmark-x">X</span>
        {suffix && <span className="fx-wordmark-suffix"> {suffix}</span>}
      </span>
    </span>
  );
}
