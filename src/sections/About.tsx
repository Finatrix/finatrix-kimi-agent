import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const focusAreas = [
  { num: '01', title: 'PERSONAL FINANCE & LITERACY', desc: 'Budgeting, investing, and financial planning for all' },
  { num: '02', title: 'MARKET UPDATES & INSIGHTS', desc: 'Real-time analysis of equity, forex, and commodity markets' },
  { num: '03', title: 'SIMPLIFYING COMPLEX CONCEPTS', desc: 'Making finance accessible through clear, structured education' },
  { num: '04', title: 'QUANT FINANCE & FINTECH', desc: 'Algorithmic trading, data science, and automation' },
  { num: '05', title: 'FINANCE CAREERS & SKILLS', desc: 'Building expertise for the next generation of finance professionals' },
  { num: '06', title: 'INSIGHTFUL COMMUNITY', desc: 'A collaborative space for students, traders, and developers' },
];

export default function About() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      // Title animation
      gsap.fromTo(
        '.about-title',
        { opacity: 0, y: 60 },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 80%',
            end: 'top 40%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Focus items stagger
      gsap.fromTo(
        '.focus-item',
        { opacity: 0, x: -40 },
        {
          opacity: 1,
          x: 0,
          duration: 0.6,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.focus-grid',
            start: 'top 80%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Logo/brand image reveal
      gsap.fromTo(
        '.brand-reveal',
        { opacity: 0, scale: 0.9 },
        {
          opacity: 1,
          scale: 1,
          duration: 1.2,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '.brand-reveal',
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id="about"
      ref={sectionRef}
      className="relative w-full bg-[#0A0A0A] py-24 lg:py-32"
    >
      <div className="w-full px-8 lg:px-16">
        {/* Section header */}
        <div className="mb-20">
          <span className="inline-block font-mono text-[10px] uppercase tracking-[0.08em] text-[#D4AF37] mb-4">
            [ABOUT US]
          </span>
          <h2 className="about-title text-[36px] md:text-[48px] lg:text-[64px] font-medium text-[#FFFFFF] tracking-[-0.02em] leading-tight max-w-[900px]">
            FinatriX merges{' '}
            <span className="text-[#D4AF37]">Finance</span> +{' '}
            <span className="text-[#D4AF37]">Matrix</span> +{' '}
            <span className="text-[#D4AF37]">X-Factor</span>
          </h2>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 mb-24">
          {/* Left: Philosophy */}
          <div>
            <p className="text-[16px] lg:text-[18px] text-[#F5F5F0] leading-[1.7] mb-8">
              A structured system of information, tools, and strategies. Whether you're a student, trader, developer, or simply curious — this is your space to grow.
            </p>
            <p className="text-[16px] lg:text-[18px] text-[#8A8A8A] leading-[1.7]">
              FinatriX is not just a name, it's a philosophy. We blend deep financial expertise with cutting-edge technology and data-driven insights to democratize access to sophisticated market intelligence.
            </p>

            {/* Brand logo reveal */}
            <div className="brand-reveal mt-12 p-8 bg-[#111111] border border-[#1A1A1A]">
              <img
                src="/images/finatrix-wordmark.jpg"
                alt="FinatriX Brand"
                className="w-full max-w-[400px] h-auto opacity-80"
              />
            </div>
          </div>

          {/* Right: Focus Areas */}
          <div className="focus-grid">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#D4AF37] mb-8">
              OUR FOCUS
            </h3>
            <div className="space-y-0">
              {focusAreas.map((area, i) => (
                <div
                  key={area.num}
                  ref={(el) => {
                    if (el) itemsRef.current[i] = el;
                  }}
                  className="focus-item group py-6 border-t border-[#1A1A1A] first:border-t-0 cursor-default transition-all duration-300 hover:bg-[#111111] hover:px-4"
                >
                  <div className="flex items-start gap-6">
                    <span className="font-mono text-[11px] text-[#D4AF37] mt-1">
                      {area.num}
                    </span>
                    <div>
                      <h4 className="text-[15px] lg:text-[17px] font-medium text-[#F5F5F0] mb-2 group-hover:text-[#FFFFFF] transition-colors duration-300">
                        {area.title}
                      </h4>
                      <p className="text-[13px] text-[#8A8A8A] leading-relaxed">
                        {area.desc}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pt-12 border-t border-[#1A1A1A]">
          <p className="text-[14px] text-[#8A8A8A]">
            STAY TUNED. THE JOURNEY IS JUST BEGINNING.
          </p>
          <a
            href="https://twitter.com/finatrix_"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#D4AF37] text-[#0A0A0A] font-mono text-[11px] uppercase tracking-[0.08em] hover:bg-[#F1C40F] active:scale-[0.98] transition-all duration-200"
          >
            <span>Follow @finatrix_</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7" />
              <path d="M7 7h10v10" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
