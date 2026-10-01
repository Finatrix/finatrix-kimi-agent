import { useId, type ReactNode } from 'react';

/** A shared, quiet home for tool-specific, explainable assistance. */
export function SmartAssist({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = useId();
  return <section className="card fx-smart-assist" aria-labelledby={id}>
    <h2 id={id} className="fx-smart-title">{title}</h2>
    {description && <p className="note fx-smart-description">{description}</p>}
    {children}
  </section>;
}
