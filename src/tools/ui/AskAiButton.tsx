import { Icon } from './Icon';
import { useAskAi } from './AiAssistant';
import { focusAriaLabel, focusButtonLabel, type AiFocus } from '../ai/focus';

/**
 * "✨ Ask FinatriX AI" — the button that turns a figure into a question.
 *
 * One component for every surface, because the alternative is thirty
 * hand-rolled buttons that drift apart in label, focus ring and accessible
 * name. Three decisions are worth stating:
 *
 *  - **The accessible name always names the subject.** A page of transactions
 *    carries thirty of these; thirty identically-named buttons is a screen
 *    reader listing with no way to tell one row from another. The visible label
 *    can be short or absent, but the name never is.
 *
 *  - **Icon-only in dense rows.** A labelled pill on every transaction would
 *    shout over the figures it sits beside. `iconOnly` keeps the affordance
 *    without the noise; the tooltip and the accessible name carry the meaning.
 *
 *  - **It renders nothing when there is no assistant.** Outside the tools shell
 *    — or before the cloud seed lands — a button that opens nothing is worse
 *    than no button, so it is simply absent.
 */

export interface AskAiButtonProps {
  /** What the user is looking at. Carries identity, never figures. */
  focus: AiFocus;
  /** Overrides the default label for this focus. Ignored when `iconOnly`. */
  label?: string;
  /** Drop the visible label. The accessible name is unaffected. */
  iconOnly?: boolean;
  /** `sm` for dense rows, `md` for card and section headers. */
  size?: 'sm' | 'md';
  className?: string;
}

export function AskAiButton({
  focus, label, iconOnly = false, size = 'sm', className,
}: AskAiButtonProps) {
  const ai = useAskAi();
  if (!ai?.enabled) return null;

  const name = focusAriaLabel(focus);
  const text = label ?? focusButtonLabel(focus);

  return (
    <button
      type="button"
      className={`fx-askai fx-askai-${size}${iconOnly ? ' is-icon' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => ai.open(focus)}
      aria-haspopup="dialog"
      aria-label={name}
      title={name}
    >
      <Icon name="sparkle" size={size === 'md' ? 14 : 13} />
      {!iconOnly && <span>{text}</span>}
    </button>
  );
}
