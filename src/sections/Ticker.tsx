const metrics = [
  { label: 'BTC/USD', value: '$94,230.45', change: '+1.2%', positive: true },
  { label: 'VOLATILITY INDEX', value: '14.02', change: null, positive: null },
  { label: 'S&P FUTURES', value: '5,984.25', change: '+0.4%', positive: true },
  { label: 'ALGO_EFFICIENCY', value: '99.8%', change: null, positive: null },
  { label: 'NIFTY 50', value: '23,742.90', change: '+0.8%', positive: true },
  { label: 'USD/INR', value: '86.45', change: '-0.2%', positive: false },
  { label: 'GOLD', value: '$2,684.30', change: '+0.6%', positive: true },
  { label: 'VIX', value: '13.85', change: '-2.1%', positive: true },
];

function MetricItem({ label, value, change, positive }: {
  label: string;
  value: string;
  change: string | null;
  positive: boolean | null;
}) {
  return (
    <span className="flex items-center gap-3 whitespace-nowrap px-6">
      <span className="text-[#8A8A8A] text-[16px] md:text-[24px] lg:text-[48px] font-light tracking-[-0.02em]">
        {label}
      </span>
      <span className="text-[#F5F5F0] text-[16px] md:text-[24px] lg:text-[48px] font-light tracking-[-0.02em]">
        {value}
      </span>
      {change && (
        <span
          className={`text-[16px] md:text-[24px] lg:text-[48px] font-light tracking-[-0.02em] ${
            positive ? 'text-[#D4AF37]' : 'text-[#E74C3C]'
          }`}
        >
          {change}
        </span>
      )}
      <span className="text-[#1A1A1A] text-[48px] font-light mx-4">•</span>
    </span>
  );
}

export default function Ticker() {
  const doubledMetrics = [...metrics, ...metrics, ...metrics, ...metrics];

  return (
    <section id="ticker" className="w-full h-[120px] flex items-center overflow-hidden bg-[#0A0A0A] border-y border-[#1A1A1A]">
      <div className="flex animate-marquee whitespace-nowrap">
        {doubledMetrics.map((metric, i) => (
          <MetricItem key={`${metric.label}-${i}`} {...metric} />
        ))}
      </div>
    </section>
  );
}
