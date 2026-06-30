import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-[#060607] text-[#F5F5F0] flex flex-col items-center justify-center px-6 py-16">
      {/* Ambient backdrop (cohesive with the landing) */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-1/2 top-[-10%] h-[60vh] w-[60vh] -translate-x-1/2 rounded-full blur-[120px] opacity-[0.18]" style={{ background: 'radial-gradient(circle, #E6C766 0%, #9c7a26 40%, transparent 70%)' }} />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)', backgroundSize: '52px 52px', maskImage: 'radial-gradient(circle at 50% 30%, black 0%, transparent 70%)', WebkitMaskImage: 'radial-gradient(circle at 50% 30%, black 0%, transparent 70%)' }} />
      </div>

      <Link to="/" className="relative z-10 flex items-center gap-2.5 mb-9 group" aria-label="FinatriX home">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="2.5" fill="#D4AF37" />
          <circle cx="12" cy="12" r="2.1" fill="#060607" />
          <path d="M12 7V2M12 22v-5M7 12H2M22 12h-5" stroke="#D4AF37" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span className="font-semibold text-[15px] tracking-[-0.01em] text-[#F5F5F0]">
          Finatri<span className="fx-gold-text">X</span>
        </span>
      </Link>

      <div className="fx-glass relative z-10 w-full max-w-[430px] rounded-[22px] p-8 md:p-10">
        <h1 className="text-[27px] font-semibold tracking-[-0.025em] text-white">{title}</h1>
        {subtitle && (
          <p className="mt-2.5 text-[14px] text-[#9c9c96] leading-relaxed">{subtitle}</p>
        )}
        <div className="mt-8">{children}</div>
      </div>

      {footer && <div className="relative z-10 mt-6 text-[13px] text-[#8A8A8A]">{footer}</div>}
    </div>
  );
}

export function Field({
  label,
  type,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const isPassword = type === 'password';
  const [show, setShow] = useState(false);
  return (
    <label className="block mb-5">
      <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-[#8A8A8A] mb-2">
        {label}
      </span>
      <div className="relative">
        <input
          {...props}
          type={isPassword ? (show ? 'text' : 'password') : type}
          className={`w-full bg-white/[0.03] border border-white/[0.12] focus:border-[#D4AF37] focus:bg-white/[0.05] focus:ring-2 focus:ring-[#D4AF37]/20 rounded-xl outline-none text-[15px] text-[#F5F5F0] px-4 py-3 transition-all placeholder:text-[#5A5A5A] ${
            isPassword ? 'pr-11' : ''
          }`}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A8A] hover:text-[#D4AF37] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
              {show && <path d="M3 3l18 18" />}
            </svg>
          </button>
        )}
      </div>
    </label>
  );
}

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="fx-btn-gold w-full font-mono text-[12px] uppercase tracking-[0.1em] py-3.5 rounded-full active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
    >
      {children}
    </button>
  );
}

export function OrDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-4">
      <span className="h-px flex-1 bg-white/[0.08]" />
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#5A5A5A]">
        {label}
      </span>
      <span className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}

export function SocialButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="w-full flex items-center justify-center gap-3 bg-white/[0.03] border border-white/[0.12] hover:border-[#D4AF37]/50 hover:bg-white/[0.05] text-[#F5F5F0] text-[14px] py-3 mb-3 rounded-xl transition-colors active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <GoogleIcon />
      <span>{children}</span>
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function Notice({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'error' | 'success';
  children: ReactNode;
}) {
  const color =
    kind === 'error'
      ? 'border-[#E74C3C]/40 text-[#E74C3C]'
      : kind === 'success'
        ? 'border-[#1d7d46]/50 text-[#5fd394]'
        : 'border-[#D4AF37]/40 text-[#D4AF37]';
  return (
    <div className={`mb-5 border ${color} bg-black/30 rounded-xl px-4 py-3 text-[13px] leading-relaxed`}>
      {children}
    </div>
  );
}
