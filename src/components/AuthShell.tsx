import type { ReactNode } from 'react';
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
    <div className="min-h-screen w-full bg-[#0A0A0A] text-[#F5F5F0] flex flex-col items-center justify-center px-6 py-16">
      <Link
        to="/"
        className="flex items-center gap-3 mb-10 group"
        aria-label="FinatriX home"
      >
        <span className="font-mono text-[12px] uppercase tracking-[0.18em] text-[#F5F5F0] group-hover:text-[#D4AF37] transition-colors">
          FinatriX
        </span>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D4AF37] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#D4AF37]" />
        </span>
      </Link>

      <div className="w-full max-w-[420px] bg-[#111111] border border-[#1A1A1A] p-8 md:p-10">
        <h1 className="text-[26px] font-medium tracking-[-0.02em] text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-[14px] text-[#8A8A8A] leading-relaxed">{subtitle}</p>
        )}
        <div className="mt-8">{children}</div>
      </div>

      {footer && <div className="mt-6 text-[13px] text-[#8A8A8A]">{footer}</div>}
    </div>
  );
}

export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block mb-5">
      <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-[#8A8A8A] mb-2">
        {label}
      </span>
      <input
        {...props}
        className="w-full bg-[#0A0A0A] border border-[#1A1A1A] focus:border-[#D4AF37] outline-none text-[15px] text-[#F5F5F0] px-4 py-3 transition-colors placeholder:text-[#5A5A5A]"
      />
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
      className="w-full bg-[#D4AF37] text-[#0A0A0A] font-mono text-[12px] uppercase tracking-[0.08em] py-3.5 hover:bg-[#F1C40F] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

export function OrDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-4">
      <span className="h-px flex-1 bg-[#1A1A1A]" />
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#5A5A5A]">
        {label}
      </span>
      <span className="h-px flex-1 bg-[#1A1A1A]" />
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
      className="w-full flex items-center justify-center gap-3 bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#D4AF37] text-[#F5F5F0] text-[14px] py-3 mb-3 transition-colors active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
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
    <div className={`mb-5 border ${color} bg-black/30 px-4 py-3 text-[13px] leading-relaxed`}>
      {children}
    </div>
  );
}
