import type { IconName } from '../lib/tools';

export function ToolIcon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'budget':
      return (
        <svg {...common}>
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <path d="M2.5 9.5h19" />
          <path d="M7 14.5h3M14.5 14.5h2.5" />
        </svg>
      );
    case 'expenses':
      return (
        <svg {...common}>
          <path d="M4 20V4" />
          <path d="M4 20h16" />
          <rect x="7" y="12" width="3" height="5" rx="0.6" />
          <rect x="12" y="9" width="3" height="8" rx="0.6" />
          <rect x="17" y="6" width="3" height="11" rx="0.6" />
        </svg>
      );
    case 'invest':
      return (
        <svg {...common}>
          <path d="M3 17l5.5-5.5 3.5 3.5L21 6" />
          <path d="M21 11V6h-5" />
        </svg>
      );
    case 'park':
      return (
        <svg {...common}>
          <path d="M5.5 14a6 6 0 1 1 11.6 2.1c-.2.5-.1 1 .3 1.4l.4.4a1 1 0 0 1-.7 1.7H16a1.5 1.5 0 0 1-1.4-1 5.9 5.9 0 0 1-5.2 0A1.5 1.5 0 0 1 8 21H6.9a1 1 0 0 1-.7-1.7l.4-.4c.4-.4.5-.9.3-1.4A6 6 0 0 1 5.5 14Z" />
          <path d="M9 9.5 8 6.5M15.5 9 17 6.5" />
          <circle cx="8.5" cy="13.5" r="0.6" fill="currentColor" />
        </svg>
      );
    case 'compare':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="3" />
          <circle cx="17" cy="10" r="2.3" />
          <path d="M2.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M14.5 18.5a4 4 0 0 1 7 .3" />
        </svg>
      );
    case 'goals':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.8" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        </svg>
      );
    case 'lifemap':
      return (
        <svg {...common}>
          <path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
        </svg>
      );
  }
}
