/**
 * Official FinatriX logo mark. Swap the `src` (or replace the file at that path)
 * with the official asset — currently points at the logo already in the repo.
 * Used in the landing nav (between Home and the wordmark) and as the hero
 * constellation's centre hub.
 */
export const FINATRIX_LOGO_SRC = '/images/finatrix-logo.png';

export function BrandLogo({ size = 26, className = '', style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <img
      src={FINATRIX_LOGO_SRC}
      width={size}
      height={size}
      alt="FinatriX logo"
      loading="eager"
      decoding="async"
      className={className}
      style={{ borderRadius: Math.round(size * 0.24), display: 'block', objectFit: 'contain', ...style }}
    />
  );
}
