/** Small stroke icons the shared Careers set does not carry (same grid and weight as CxIcon). */

const PATHS = {
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  archive: 'M4 5h16v4H4zM6 9v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9M10 13h4',
  trash: 'M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12M10 11v5M14 11v5',
  caret: 'M9 6l6 6-6 6',
  file: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  check: 'M5 12.5 10 17l9-10',
  close: 'M6 6l12 12M18 6 6 18',
} as const;

export type RsIconName = keyof typeof PATHS;

export function RsIcon({ name, size = 18, filled }: { name: RsIconName; size?: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
