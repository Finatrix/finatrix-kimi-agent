/** Live stage list for the resume processing pipeline. */

import { PIPELINE_STEPS, type PipelineProgress as Progress } from '../types';
import { Icon } from '../../tools/ui/Icon';

export function PipelineProgress({
  progress,
  failedAt,
}: {
  progress: Progress;
  /** Step id where the pipeline failed (renders that step in the error state). */
  failedAt?: string | null;
}) {
  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.id === progress.step);
  return (
    <div className="pipe" role="status" aria-live="polite">
      {PIPELINE_STEPS.map((step, i) => {
        const failed = failedAt === step.id;
        const done = !failed && (i < currentIdx || progress.step === 'complete');
        const now = !failed && i === currentIdx && progress.step !== 'complete';
        return (
          <div
            key={step.id}
            className={`pipe-step ${failed ? 'fail' : done ? 'done' : now ? 'now' : ''}`}
          >
            <div className="pipe-dot" aria-hidden="true">
              {failed ? '!' : done ? <Icon name="check" size={13} /> : i + 1}
            </div>
            <div>
              <div className="pipe-label">{step.label}</div>
              {now && progress.pct != null && (
                <div className="pipe-sub">{progress.pct}%</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
