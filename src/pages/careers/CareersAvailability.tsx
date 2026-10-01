import { Link, Outlet } from 'react-router';
import PageShell from '../../marketing/PageShell';
import { CAREERS_AVAILABLE, CAREERS_LAUNCH_MESSAGE } from '../../shared/careersAvailability';

export default function CareersAvailability() {
  if (CAREERS_AVAILABLE) return <Outlet />;
  return (
    <PageShell name="Careers" heading={CAREERS_LAUNCH_MESSAGE}
      lede="A workspace for your next career move is on its way. Careers access and plan purchases are currently closed.">
      <p className="max-w-[60ch] text-[16px] leading-relaxed text-ink-2">
        In the meantime, build your money plan with our free tools, or explore our educational career guides.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/tools" className="fx-btn-gold rounded-full px-6 py-3">Explore free money tools</Link>
        <Link to="/learn" className="fx-btn-ghost rounded-full px-6 py-3">Explore the guides</Link>
      </div>
    </PageShell>
  );
}
