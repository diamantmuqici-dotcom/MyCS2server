# Branding

## Palette

| Token         | Hex       | Use                         |
| ------------- | --------- | --------------------------- |
| Navy          | `#06112F` | Page background             |
| Dark blue     | `#0A1B46` | Cards, sections             |
| Electric blue | `#075BFF` | Primary actions, links      |
| Accent        | `#36A3FF` | Highlights, focus           |
| White         | `#F5F8FF` | Primary text                |
| Muted         | `#A9B8D6` | Secondary text              |
| Success       | `#3DDC97` | Operational state           |
| Warning       | `#FFC857` | Degraded state              |
| Danger        | `#FF5C7A` | Outage, destructive actions |

The canonical values and the Discord embed colour live in
`packages/shared/src/brand.ts`.

## Logo

`apps/web/public/brand/` contains the supplied artwork:

- `emblem-512.png` — primary emblem
- `dardania-elite-emblem.png` — source emblem
- `favicon-32.png`, `favicon-64.png`, `apple-touch-icon.png`

Use the emblem as provided. Do not recolour it, stretch it, or place it on a busy
image. Where a logo is not available (for example, a social preview), use the
wordmark "Dardania | Elite" in the brand typeface rather than generating a new
logo.

## Typography and spacing

- Font stack: Inter, Segoe UI, system UI fallbacks (`BRAND.fontStack`).
- Headings are tight (`-0.02em`), body text uses the muted colour.
- Cards: 14–18px radius, 1px border in `#1B3568`, subtle blue glow on hover.
- Keep the site dark; there is no light theme.

## Copy rules

- Be direct and factual. Never invent player counts, ranks, sponsors or
  testimonials.
- State unknown values as "unknown" rather than guessing.
- English first, Albanian alongside for rules and community-facing notices.

## Usage restrictions

The name, palette and emblem belong to the project owner. PlisatCS and other
regional communities were consulted for inspiration only; none of their code,
branding or assets are included.
