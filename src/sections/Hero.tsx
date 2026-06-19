import { useComputationalLattice } from '../hooks/useComputationalLattice';

export default function Hero() {
  const canvasRef = useComputationalLattice();

  return (
    <section className="relative w-full h-screen overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      />
      <div className="relative z-10 flex items-center justify-center h-full">
        <div
          className="px-12 py-10"
          style={{
            background: 'rgba(10, 10, 10, 0.4)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <h1
            className="text-[80px] md:text-[120px] font-medium text-[#FFFFFF] text-center leading-none tracking-[-0.03em]"
            style={{ fontFamily: 'Geist, system-ui, sans-serif' }}
          >
            QUANTIFY THE
            <br />
            <span className="text-[#D4AF37]">FUTURE</span>
          </h1>
          <div className="mt-6 flex justify-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8A8A8A]">
              [SYSTEM STATUS: ONLINE — EXECUTING STRATEGIES]
            </p>
          </div>
        </div>
      </div>
      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#8A8A8A]">Scroll</span>
        <div className="w-[1px] h-8 bg-gradient-to-b from-[#D4AF37] to-transparent animate-pulse" />
      </div>
    </section>
  );
}
