/**
 * Careers data context — loads the signed-in user's career profile and
 * resume library once per session, exposes refresh() for after mutations,
 * and centralizes module settings (AI model, OCR, analytics).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_SETTINGS } from '../constants';
import { getOrCreateProfile, resolveSettings, updateProfileMeta } from '../services/careerProfile';
import { listResumes } from '../services/resumes';
import { setAnalyticsEnabled } from '../services/analytics';
import type { CareerProfileRow, CareersSettings, ResumeWithVersions } from '../types';
import { CareersError, toCareersError } from '../utils/errors';

interface CareersContextValue {
  loading: boolean;
  /** Load-time failure (e.g. schema not installed) — pages render a setup card. */
  error: CareersError | null;
  profile: CareerProfileRow | null;
  resumes: ResumeWithVersions[];
  settings: CareersSettings;
  refresh: () => Promise<void>;
  setProfile: (profile: CareerProfileRow) => void;
  updateSettings: (patch: Partial<CareersSettings>) => Promise<void>;
}

const Ctx = createContext<CareersContextValue | undefined>(undefined);

export function CareersProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CareersError | null>(null);
  const [profile, setProfile] = useState<CareerProfileRow | null>(null);
  const [resumes, setResumes] = useState<ResumeWithVersions[]>([]);

  const load = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setResumes([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [p, r] = await Promise.all([getOrCreateProfile(user.id), listResumes(user.id)]);
      setProfile(p);
      setResumes(r);
      setError(null);
    } catch (e) {
      setError(toCareersError(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  const settings = useMemo(() => resolveSettings(profile), [profile]);

  useEffect(() => {
    setAnalyticsEnabled(settings.analyticsEnabled);
  }, [settings.analyticsEnabled]);

  const updateSettings = useCallback(
    async (patch: Partial<CareersSettings>) => {
      if (!user || !profile) return;
      const next = { ...DEFAULT_SETTINGS, ...profile.settings, ...patch };
      const updated = await updateProfileMeta(user.id, { settings: next });
      setProfile(updated);
    },
    [user, profile]
  );

  const value = useMemo(
    () => ({ loading, error, profile, resumes, settings, refresh: load, setProfile, updateSettings }),
    [loading, error, profile, resumes, settings, load, updateSettings]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCareers(): CareersContextValue {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCareers must be used within CareersProvider');
  return c;
}
