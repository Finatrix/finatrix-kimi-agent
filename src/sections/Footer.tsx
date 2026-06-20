import { useState, useEffect } from 'react';
import { Link } from 'react-router';

type FLink = { label: string; to: string };
const footerLinks: Record<string, FLink[]> = {
  Tools: [
    { label: 'Budget Builder', to: '/tools#/budget' },
    { label: 'Expense Tracker', to: '/tools#/expenses' },
    { label: 'LifeMap', to: '/tools#/lifemap' },
    { label: 'All tools', to: '/tools' },
  ],
  Company: [{ label: 'About', to: '/home#about' }],
  Legal: [
    { label: 'Privacy Policy', to: '/privacy' },
    { label: 'Terms & Conditions', to: '/terms' },
    { label: 'Disclaimer', to: '/terms#disclaimer' },
  ],
  Contact: [{ label: 'finatrix.hub@gmail.com', to: 'mailto:finatrix.hub@gmail.com' }],
};

export default function Footer() {
  const [time, setTime] = useState('00:00:00');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      setTime(`${h}:${m}:${s}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer
      id="footer"
      className="relative w-full bg-[#0A0A0A] border-t border-[#1A1A1A]"
    >
      <div className="w-full px-8 py-16 lg:px-16 lg:py-24">
        {/* Top section with logo and tagline */}
        <div className="flex flex-col lg:flex-row justify-between items-start gap-12 mb-16">
          <div className="flex flex-col">
            <div className="flex items-center gap-4 mb-4">
              <img
                src="/images/finatrix-logo.png"
                alt="FinatriX"
                className="h-10 w-auto"
              />
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8A8A8A]">
              Blending Finance, Innovation, and Insights
            </p>
          </div>

          {/* Link grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-16">
            {Object.entries(footerLinks).map(([category, links]) => (
              <div key={category}>
                <h4 className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#D4AF37] mb-4">
                  {category}
                </h4>
                <ul className="space-y-2">
                  {links.map((link) =>
                    link.to.startsWith('mailto:') ? (
                      <li key={link.label}>
                        <a
                          href={link.to}
                          className="inline-block text-[13px] text-[#8A8A8A] hover:text-[#F5F5F0] transition-colors duration-300"
                        >
                          {link.label}
                        </a>
                      </li>
                    ) : (
                      <li key={link.label}>
                        <Link
                          to={link.to}
                          className="inline-block text-[13px] text-[#8A8A8A] hover:text-[#F5F5F0] transition-colors duration-300"
                        >
                          {link.label}
                        </Link>
                      </li>
                    )
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Contact section */}
        <div className="border-t border-[#1A1A1A] pt-12 mb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h4 className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#D4AF37] mb-3">
                Email
              </h4>
              <a
                href="mailto:finatrix.hub@gmail.com"
                className="text-[14px] text-[#F5F5F0] hover:text-[#D4AF37] transition-colors duration-300"
              >
                finatrix.hub@gmail.com
              </a>
            </div>
            <div>
              <h4 className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#D4AF37] mb-3">
                Social
              </h4>
              <a
                href="https://twitter.com/finatrix_"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] text-[#F5F5F0] hover:text-[#D4AF37] transition-colors duration-300"
              >
                @finatrix_
              </a>
            </div>
            <div>
              <h4 className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#D4AF37] mb-3">
                Location
              </h4>
              <p className="text-[14px] text-[#F5F5F0]">
                India — Global Markets
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="w-full border-t border-[#1A1A1A]">
        <div className="flex flex-col md:flex-row justify-between items-center px-8 py-6 lg:px-16">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#8A8A8A]">
            © 2026 FinatriX. All rights reserved.
          </p>
          <div className="flex items-center gap-4 mt-4 md:mt-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#8A8A8A]">
              UTC
            </span>
            <span className="font-mono text-[14px] text-[#D4AF37]">{time}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
