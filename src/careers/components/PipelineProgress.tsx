/** Live stage list for the resume processing pipeline. */

import { PIPELINE_STEPS, type PipelineProgress as Progress } from '../types';
import { RsIcon } from '../areas/resume/icons';
import '../areas/resume/resume.css';

export function PipelineProgress({
  progress,
  failedAt,
}: {
  progress: Progress;
  /** Step id where the pipeline failed (renders that step in the error state). */
  failedAt?: string | null;
}) {
  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.id === progress.step);
  const current = PIPELINE_STEPS[currentIdx];
  const failedStep = PIPELINE_STEPS.find((s) => s.id === failedAt);
  // One short sentence for assistive tech; the list itself is not live.
  const status = failedStep
    ? `Stopped at ${failedStep.label}`
    : progress.step === 'complete'
      ? 'Completed'
      : `${current?.label ?? 'Starting'}, step ${currentIdx + 1} of ${PIPELINE_STEPS.length - 1}`;
  return (
    <div className="rs-pipe">
      <p role="status" aria-live="polite" style={SR_ONLY}>{status}</p>
      <ol className="cx-steps" aria-label="Processing steps">
        {PIPELINE_STEPS.map((step, i) => {
          const failed = failedAt === step.id;
          const done = !failed && (i < currentIdx || progress.step === 'complete');
          const now = !failed && i === currentIdx && progress.step !== 'complete';
          return (
            <li
              key={step.id}
              className="cx-step"
              data-done={done}
              data-current={now}
              data-failed={failed}
              aria-current={now ? 'step' : undefined}
            >
              <span className="cx-step-dot" aria-hidden="true">
                {failed ? '!' : done ? <RsIcon name="check" size={12} /> : null}
              </span>
              <span>
                {step.label}
                {now && progress.pct != null && <span className="cx-step-sub"> {progress.pct}%</span>}
                {done && <span style={SR_ONLY}>, done</span>}
                {failed && <span style={SR_ONLY}>, failed</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const SR_ONLY = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;
