import { InlineInvite } from '../components/InlineInvite';

/**
 * The tour's invitation, for a returning visitor: a tour of *this page* — one
 * short chapter — not the whole tutorial, which used to be offered here as
 * "about 47 minutes in all". The rest stays a tap away under All tools ›
 * Guided tours. Drawn in the page flow by InlineInvite.
 */
export default function TourOffer({ minutes, pageName, onYes, onLater, onNever }: {
  /** Length of this page's chapter. */
  minutes: number;
  /** What the tour covers, e.g. "your dashboard". */
  pageName: string;
  onYes: () => void;
  onLater: () => void;
  onNever: () => void;
}) {
  const length = minutes <= 1 ? 'About a minute' : `About ${minutes} minutes`;
  return (
    <InlineInvite
      title={`Take a quick tour of ${pageName}?`}
      body={`${length}. It points at the real buttons, and you can stop at any step.`}
      yesLabel="Start the tour"
      onYes={onYes}
      onLater={onLater}
      onNever={onNever}
    />
  );
}
