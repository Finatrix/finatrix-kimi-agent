interface Tool {
  name: string;
  description: string;
  tag: string;
  href: string;
}

const tools: Tool[] = [
  {
    name: 'Budget Builder',
    description: 'Split your income the 50/30/20 way and see instantly where every rupee should live.',
    tag: 'PLAN',
    href: '/tools#/budget',
  },
  {
    name: 'Expense Tracker',
    description: 'Log spending in seconds, spot patterns and stay under your monthly budget.',
    tag: 'TRACK',
    href: '/tools#/expenses',
  },
  {
    name: 'InvestMatch',
    description: 'Answer six questions, get a portfolio matched to your risk, horizon and goal.',
    tag: 'INVEST',
    href: '/tools#/investmatch',
  },
  {
    name: 'ParkSmart',
    description: 'Idle cash? Compare post-tax returns across 10 parking options for your slab.',
    tag: 'OPTIMIZE',
    href: '/tools#/parksmart',
  },
  {
    name: 'PeerCompare',
    description: 'See how your income, savings and net worth stack up against peers in your city.',
    tag: 'BENCHMARK',
    href: '/tools#/peercompare',
  },
  {
    name: 'Reverse Goal Planner',
    description: 'Name the dream, set the deadline — we work backwards to your exact monthly SIP.',
    tag: 'GOALS',
    href: '/tools#/goals',
  },
  {
    name: 'LifeMap',
    description: 'Simulate your entire financial life from today to retirement. See how every decision reshapes your wealth.',
    tag: 'SIMULATE',
    href: '/tools#/lifemap',
  },
];

export default function Tools() {
  return (
    <section id="tools" className="relative w-full bg-[#0A0A0A] py-[18vh] px-6 md:px-12">
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="mb-16 max-w-[640px]">
          <span className="inline-block font-mono text-[10px] uppercase tracking-[0.12em] text-[#D4AF37] mb-5">
            FinatriX Tools
          </span>
          <h2 className="text-[32px] md:text-[48px] font-medium tracking-[-0.02em] text-[#FFFFFF] leading-[1.05]">
            Smart money tools,<br />built for India.
          </h2>
          <p className="mt-6 text-[15px] md:text-[16px] text-[#8A8A8A] leading-relaxed">
            Seven free, privacy-first calculators — from budgeting and investing to a full
            life-long wealth simulation. No sign-up, your data stays on your device.
          </p>
        </div>

        {/* Tool grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#1A1A1A] border border-[#1A1A1A]">
          {tools.map((tool) => (
            <a
              key={tool.name}
              href={tool.href}
              className="group relative bg-[#0A0A0A] hover:bg-[#111111] p-8 transition-colors duration-300 flex flex-col"
            >
              <span className="inline-block self-start font-mono text-[10px] uppercase tracking-[0.08em] text-[#D4AF37] mb-5 px-2 py-1 border border-[#D4AF37]/30 rounded">
                {tool.tag}
              </span>
              <h3 className="text-[20px] font-medium tracking-[-0.01em] text-[#F5F5F0] mb-3">
                {tool.name}
              </h3>
              <p className="text-[14px] text-[#8A8A8A] leading-relaxed flex-grow">
                {tool.description}
              </p>
              <span className="mt-6 font-mono text-[11px] uppercase tracking-[0.08em] text-[#8A8A8A] group-hover:text-[#D4AF37] transition-colors duration-300">
                Open →
              </span>
            </a>
          ))}

          {/* CTA card */}
          <a
            href="/tools"
            className="group relative bg-[#D4AF37] hover:bg-[#e6c45a] p-8 transition-colors duration-300 flex flex-col justify-between"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#0A0A0A]/60">
              All tools
            </span>
            <div>
              <h3 className="text-[22px] font-semibold tracking-[-0.01em] text-[#0A0A0A] mb-2">
                Open the full suite
              </h3>
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#0A0A0A]">
                Launch tools →
              </span>
            </div>
          </a>
        </div>

        <p className="mt-8 font-mono text-[11px] text-[#5A5A5A]">
          Educational tools, not financial advice.
        </p>
      </div>
    </section>
  );
}
