import type { ManifestEntry } from '../types/manifest';

type ThemeLike = NonNullable<ManifestEntry['theme']>;

/**
 * Returns a stable, CSS-safe theme id for a manifest entry.
 */
export function getEntryThemeId(entry: ManifestEntry): string {
  const raw = String(entry.id || entry.date || 'default');
  // Keep it short and CSS-selector safe
  const safe = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return safe || 'default';
}

/**
 * Ensures this entry's theme variables are available via a CSS selector:
 *   [data-theme="<id>"] { --primary: ... }
 *
 * This avoids inline styles (lint) while keeping per-card theming.
 */
export function ensureEntryThemeStyle(entry: ManifestEntry) {
  if (typeof document === 'undefined') return;

  const themeId = getEntryThemeId(entry);
  const styleId = `oc-theme-${themeId}`;

  const theme: ThemeLike = (entry.theme as ThemeLike) || generateFallbackTheme(entry.id || entry.date || 'default');
  const colors = { ...theme.palette.colors };

  // Backfill common vars if the theme.json is older.
  if (!colors['--accent'] && colors['--primary']) colors['--accent'] = colors['--primary'];
  if (!colors['--accent-soft'] && colors['--primary']) colors['--accent-soft'] = deriveAccentSoft(colors['--primary']);

  const gradient = theme.palette.gradient || `linear-gradient(135deg, ${colors['--primary'] || '#0071e3'}, ${colors['--secondary'] || '#5856d6'})`;

  const decls = Object.entries(colors)
    .filter(([k, v]) => k.startsWith('--') && typeof v === 'string' && v.trim())
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

  const css = [
    `[data-theme="${themeId}"] {`,
    decls.replace(/--primary/g, '--prj-primary')
         .replace(/--secondary/g, '--prj-secondary')
         .replace(/--accent/g, '--prj-accent')
         .replace(/--surface/g, '--prj-surface'),
    `  --prj-gradient: ${gradient};`,
    `}`
  ].join('\n');

  const existing = document.getElementById(styleId) as HTMLStyleElement | null;
  if (existing) {
    if (existing.textContent !== css) existing.textContent = css;
    return;
  }

  const el = document.createElement('style');
  el.id = styleId;
  el.textContent = css;
  document.head.appendChild(el);
}

/**
 * Fallback generator (keep in sync with packages/engine/core/theme.mjs)
 */
function generateFallbackTheme(seedString: string) {
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    const char = seedString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const seed = Math.abs(hash);

  const hue = seed % 360;
  const saturation = 70 + (seed % 20);
  const lightness = 45 + (seed % 15);

  const primary = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  const primaryLight = `hsl(${hue}, ${saturation}%, ${lightness + 15}%)`;
  const primaryDark = `hsl(${hue}, ${saturation}%, ${lightness - 15}%)`;
  const secondaryHue = (hue + 150 + (seed % 60)) % 360;
  const secondary = `hsl(${secondaryHue}, ${saturation - 10}%, ${lightness}%)`;
  const surface = `hsl(${hue}, 10%, 98%)`;
  const surfaceDark = `hsl(${hue}, 15%, 10%)`;

  return {
    palette: {
      colors: {
        '--primary': primary,
        '--primary-light': primaryLight,
        '--primary-dark': primaryDark,
        '--secondary': secondary,
        '--surface': surface,
        '--surface-dark': surfaceDark,
        '--accent': primary,
        '--accent-soft': `hsla(${hue}, ${saturation}%, ${lightness}%, 0.1)`,
      },
      gradient: `linear-gradient(135deg, ${primary}, ${secondary})`,
    }
  };
}

function deriveAccentSoft(primary: string) {
  // Best-effort conversion for our HSL-based themes.
  // If it's already hsla(...) or a hex/rgb string, fall back to a neutral rgba.
  const m = primary.match(/^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/i);
  if (!m) return 'rgba(0, 113, 227, 0.10)';
  const [, h, s, l] = m;
  return `hsla(${h}, ${s}%, ${l}%, 0.12)`;
}
