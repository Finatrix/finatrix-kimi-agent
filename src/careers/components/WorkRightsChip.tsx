import { compareRights, rightsLabel, toCareersMarket, type DeclaredRights, type CareersMarket, type RightsFit } from '../markets';
import type { NormalizedJob } from '../types/jobs';

const FIT_TEXT: Record<Exclude<RightsFit, 'unknown'>, string> = {
  meets: 'matches your work rights',
  does_not_meet: 'does not match your work rights',
  check: 'check against your work rights',
};

const FIT_CLASS: Record<RightsFit, string> = {
  meets: 'badge-green',
  does_not_meet: 'badge-red',
  check: 'badge-gold',
  unknown: 'badge-mute',
};

/**
 * What a posting says about work rights, in its market's own words, and how that reads against what the user
 * declared on their profile. The meaning is in the text, never in the colour alone. Renders nothing for a
 * posting that states nothing, or one outside the five markets.
 */
export function WorkRightsChip({
  job,
  declared,
}: {
  job: Pick<NormalizedJob, 'country' | 'work_rights'>;
  declared?: Partial<Record<CareersMarket, DeclaredRights>>;
}) {
  const market = toCareersMarket(job.country);
  if (!market || !job.work_rights) return null;
  const label = rightsLabel(job.work_rights, market);
  const fit = compareRights(job.work_rights, declared?.[market]);
  return (
    <span className={`badge ${FIT_CLASS[fit]}`}>
      {label}
      {fit !== 'unknown' && <> · {FIT_TEXT[fit]}</>}
    </span>
  );
}
