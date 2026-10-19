const PATHS: Record<string, string[]> = {
  grid: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  shield: ['M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z'],
  ban: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M5.6 5.6l12.8 12.8'],
  steam: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M7 15l3.5 1.5', 'M14.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  pc: ['M3 5h18v11H3z', 'M8 21h8', 'M12 16v5'],
  users: ['M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2', 'M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M21 20v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
  megaphone: ['M3 11v2l14 6V5L3 11z', 'M17 8a4 4 0 0 1 0 8', 'M7 13v6'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
  audit: ['M7 3h10l3 3v15H7z', 'M7 3v18', 'M10 8h6', 'M10 12h6', 'M10 16h4'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 18l6-6-6-6'],
  external: ['M14 3h7v7', 'M21 3l-9 9', 'M10 5H5v14h14v-5'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  server: ['M4 5h16v6H4z', 'M4 13h16v6H4z', 'M8 8h.01', 'M8 16h.01'],
  alert: ['M12 3l9 17H3L12 3z', 'M12 9v5', 'M12 17h.01'],
  check: ['M20 6L9 17l-5-5'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  key: ['M21 2l-2 2', 'M15.5 8.5L21 3', 'M10 14a5 5 0 1 1 4-4l-9 9H3v-2l7-3z'],
  flag: ['M5 21V4', 'M5 4h11l-1.5 4L16 12H5'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8h.01'],
  file: ['M14 3H6v18h12V7l-4-4z', 'M14 3v4h4'],
  warning: ['M12 3l9 17H3L12 3z', 'M12 9v5', 'M12 17h.01'],
  plus: ['M12 5v14', 'M5 12h14'],
  refresh: ['M21 12a9 9 0 1 1-3-6.7', 'M21 3v6h-6'],
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.7,
  className,
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const paths = PATHS[name] ?? PATHS.info ?? [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {paths.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}
