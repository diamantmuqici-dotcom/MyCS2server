/**
 * Single source of truth for the Dardania | Elite visual identity.
 * Used by the website, dashboard, API-rendered embeds and the Discord bot.
 */
export const BRAND = {
  name: 'Dardania | Elite',
  shortName: 'Dardania Elite',
  abbreviation: 'DE',
  game: 'Counter-Strike 2',
  region: 'Kosova',
  tagline: 'Elite Counter-Strike 2 community from Dardania.',
  description:
    'Dardania | Elite is a Counter-Strike 2 community built around clean servers, ' +
    'transparent moderation and a fair playing field for every member.',
  colors: {
    navy: '#06112F',
    darkBlue: '#0A1B46',
    electricBlue: '#075BFF',
    accentBlue: '#36A3FF',
    white: '#F5F8FF',
    muted: '#A9B8D6',
    surface: '#0B1938',
    surfaceElevated: '#10224A',
    border: '#1B3568',
    success: '#3DDC97',
    warning: '#FFC857',
    danger: '#FF5C7A',
  },
  fontStack: "'Inter', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
  logo: {
    emblem: 'brand/emblem-512.png',
    favicon: 'brand/favicon-64.png',
    discordEmblemFile: 'assets/dardania-elite-emblem.png',
  },
  social: {
    discord: 'https://discord.gg/MsT96sPS3e',
  },
} as const;

export const BRAND_COLOR_DISCORD = 0x075bff;
