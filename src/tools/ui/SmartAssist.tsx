import { useId, type ReactNode } from 'react';
import { Disclosure } from './Disclosure';

/**
 * A shared, quiet home for tool-specific, explainable assistance.
 *
 * `collapsible` is for an assist that sits under a RESULT: a what-if explorer
 * there is a second tool, not part of the answer, and on a phone each one was
 * 400–1,000px between the reader and the rest of their result. The title and
 * description stay visible so the reader knows it is there and what it does;
 * the controls are one press away. Assists that ARE the screen's purpose
 * (record review, data readiness) leave it off.
 */
export function SmartAssist({ title, description, collapsible, children }: {
  title: string;
  description?: string;
  collapsible?: { showLabel: string; hideLabel: string };
  children: ReactNode;
}) {
  const id = useId();
  return <section className="card fx-smart-assist" aria-labelledby={id}>
    <h2 id={id} className="fx-smart-title">{title}</h2>
    {description && <p className="note fx-smart-description">{description}</p>}
    {collapsible
      ? <Disclosure variant="inline" showLabel={collapsible.showLabel} hideLabel={collapsible.hideLabel}>{children}</Disclosure>
      : children}
  </section>;
}
