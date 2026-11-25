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
    case 'networth':
      // A balance: what you own on one side, what you owe on the other.
      return (
        <svg {...common}>
          <path d="M12 4v16" />
          <path d="M5 7h14" />
          <path d="M5 7 2.5 13a2.6 2.6 0 0 0 5 0L5 7Z" />
          <path d="M19 7l-2.5 6a2.6 2.6 0 0 0 5 0L19 7Z" />
          <path d="M9 20h6" />
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
    case 'reports':
      return (
        <svg {...common}>
          <path d="M4 20.5h16" />
          <rect x="5.5" y="11" width="3" height="6.5" rx="1" />
          <rect x="10.5" y="7" width="3" height="10.5" rx="1" />
          <rect x="15.5" y="4" width="3" height="13.5" rx="1" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      );
    case 'careers':
      return (
        <svg {...common}>
          <rect x="3" y="7.5" width="18" height="12.5" rx="2.5" />
          <path d="M9 7.5V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2M3 12.5h18" />
        </svg>
      );
    case 'appearance':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'currency':
      return (
        <svg {...common}>
          <ellipse cx="12" cy="6.5" rx="7" ry="3" />
          <path d="M5 6.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5M5 11.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c2.4 2.6 3.5 5.4 3.5 8.5s-1.1 5.9-3.5 8.5c-2.4-2.6-3.5-5.4-3.5-8.5s1.1-5.9 3.5-8.5z" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="8" cy="17" r="2" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...common}>
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
        </svg>
      );
    case 'tour':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M10.2 8.6l5 3.4-5 3.4z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'learn':
      return (
        <svg {...common}>
          <path d="M4 5.5c2.7-1 5.3-1 8 .8 2.7-1.8 5.3-1.8 8-.8v13c-2.7-1-5.3-1-8 .8-2.7-1.8-5.3-1.8-8-.8z" />
          <path d="M12 6.3v13" />
        </svg>
      );
    case 'external':
      return (
        <svg {...common}>
          <path d="M14 4h6v6M20 4l-9 9" />
          <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
        </svg>
      );
    case 'privacy':
      return (
        <svg {...common}>
          <path d="M12 3.5l7 2.8v5.2c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6.3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case 'terms':
      return (
        <svg {...common}>
          <path d="M6.5 3.5h7.5l4 4v13h-11.5z" />
          <path d="M14 3.5v4h4M9.5 12h5M9.5 15h5M9.5 18h3" />
        </svg>
      );
  }
}
