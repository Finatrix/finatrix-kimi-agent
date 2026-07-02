import { Link } from 'react-router';

/** Home › FinatriX › Current Page — present on every page for orientation. */
export function Breadcrumb({ current, className = '' }: { current: string; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-2 ${className}`}>
      <Link to="/" className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#8A8A8A] hover:text-[#D4AF37] transition-colors">
        Home
      </Link>
      <span className="text-[#4a4a4a]" aria-hidden="true">›</span>
      <Link to="/" className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#8A8A8A] hover:text-[#D4AF37] transition-colors">
        FinatriX
      </Link>
      <span className="text-[#4a4a4a]" aria-hidden="true">›</span>
      <span className="text-[12px] text-[#E8E8E3]" aria-current="page">{current}</span>
    </nav>
  );
}
