import { useState, useEffect } from 'react';

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 100);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-[#0A0A0A]/80 backdrop-blur-[12px] border-b border-[rgba(255,255,255,0.05)]'
          : 'bg-transparent'
      }`}
    >
      <div className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#F5F5F0]">
            FinatriX
          </span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D4AF37] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#D4AF37]"></span>
          </span>
        </div>
        <nav className="flex items-center gap-8">
          {[
            { label: 'Markets', id: 'ticker' },
            { label: 'Infrastructure', id: 'infrastructure' },
            { label: 'Capabilities', id: 'capabilities' },
            { label: 'Contact', id: 'footer' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => scrollTo(item.id)}
              className="group relative font-mono text-[11px] uppercase tracking-[0.08em] text-[#8A8A8A] hover:text-[#F5F5F0] transition-colors duration-300 cursor-pointer bg-transparent border-none"
            >
              {item.label}
              <span className="absolute left-0 bottom-[-2px] h-[1px] w-0 bg-[#D4AF37] transition-all duration-300 group-hover:w-full" style={{ transformOrigin: 'left' }} />
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
