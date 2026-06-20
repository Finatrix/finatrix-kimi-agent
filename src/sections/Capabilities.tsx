import { useRef, useEffect, useState } from 'react';

interface Capability {
  title: string;
  description: string;
  image: string;
  tag: string;
}

const capabilities: Capability[] = [
  {
    title: 'LEARN QUANT BASICS',
    description: 'Plain-English explainers on how data and statistics are used to study market patterns. Educational only — FinatriX does not provide trading signals or predict prices.',
    image: '/images/capability-1.jpg',
    tag: 'EDUCATION',
  },
  {
    title: 'UNDERSTAND MARKETS',
    description: 'See how exchanges, order types and market structure work, explained simply. We help you understand markets — we are not a broker and do not execute trades.',
    image: '/images/capability-2.jpg',
    tag: 'EXPLAINERS',
  },
  {
    title: 'GLOBAL CONTEXT',
    description: 'Understand how equity, forex and commodity markets across the world connect, so the numbers in the news make sense. For learning, not for placing trades.',
    image: '/images/capability-3.jpg',
    tag: 'CONTEXT',
  },
  {
    title: 'RISK AWARENESS',
    description: 'Learn the ideas behind portfolio risk — diversification, volatility and stress-testing — so you can ask better questions. Educational, not personalised advice.',
    image: '/images/capability-4.jpg',
    tag: 'RISK_BASICS',
  },
];

export default function Capabilities() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const cards = sectionRef.current?.querySelectorAll('[data-capability-card]');
    if (!cards) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = parseInt(entry.target.getAttribute('data-index') || '0');
            setActiveIndex(idx);
          }
        });
      },
      {
        root: null,
        rootMargin: '-40% 0px -40% 0px',
        threshold: 0,
      }
    );

    cards.forEach((card) => observerRef.current!.observe(card));

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <section
      id="capabilities"
      ref={sectionRef}
      className="relative w-full bg-[#0A0A0A]"
    >
      <div className="flex w-full">
        {/* Left sticky column */}
        <div className="hidden md:flex w-1/2 h-screen sticky top-0 items-center justify-center px-8 lg:px-16">
          <div className="relative h-[200px] flex items-center">
            {capabilities.map((cap, i) => (
              <h2
                key={cap.title}
                className="absolute inset-0 flex items-center text-[32px] lg:text-[48px] font-medium tracking-[-0.02em] transition-all duration-700 ease-out"
                style={{
                  opacity: activeIndex === i ? 1 : 0,
                  transform: activeIndex === i ? 'translateY(0)' : 'translateY(20px)',
                  color: activeIndex === i ? '#FFFFFF' : '#8A8A8A',
                }}
              >
                {cap.title}
              </h2>
            ))}
          </div>
        </div>

        {/* Right scrolling column */}
        <div className="w-full md:w-1/2 flex flex-col py-[20vh]">
          {capabilities.map((cap, i) => (
            <div
              key={cap.title}
              data-capability-card
              data-index={i}
              className="min-h-[60vh] flex items-center px-6 md:px-12"
              style={{ marginBottom: i < capabilities.length - 1 ? '15vh' : 0 }}
            >
              <div className="w-full">
                {/* Mobile title */}
                <h2 className="md:hidden text-[28px] font-medium tracking-[-0.02em] text-[#FFFFFF] mb-6">
                  {cap.title}
                </h2>

                {/* Card */}
                <div className="relative overflow-hidden bg-[#111111] border border-[#1A1A1A]">
                  <div className="aspect-[3/4] relative overflow-hidden">
                    <img
                      src={cap.image}
                      alt={cap.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-transparent to-transparent" />
                  </div>
                  <div className="p-6 lg:p-8">
                    <span className="inline-block font-mono text-[10px] uppercase tracking-[0.08em] text-[#D4AF37] mb-4 px-2 py-1 border border-[#D4AF37]/30 rounded">
                      {cap.tag}
                    </span>
                    <p className="text-[14px] lg:text-[16px] text-[#F5F5F0] leading-relaxed">
                      {cap.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
