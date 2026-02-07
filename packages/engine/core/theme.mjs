/**
 * Theme Presets with unique visual foundations
 */
export const PRESETS = {
  professional: {
    name: 'Professional',
    baseHue: [200, 230], // Blues/Teals
    saturation: [65, 80],
    lightness: [45, 55],
    analogous: 30,
  },
  creative: {
    name: 'Creative',
    baseHue: [260, 320], // Purples/Pinks
    saturation: [75, 90],
    lightness: [50, 60],
    analogous: 150, // Complementary colors
  },
  cyberpunk: {
    name: 'Cyberpunk',
    baseHue: [180, 200], // Cyan foundations
    saturation: [85, 100],
    lightness: [40, 50],
    analogous: -120, // Neon pink/purple accents
  },
  nature: {
    name: 'Nature',
    baseHue: [100, 150], // Greens
    saturation: [50, 70],
    lightness: [40, 50],
    analogous: 40, // Earth tones
  },
  vibrant: {
    name: 'Vibrant',
    baseHue: [0, 60], // Reds/Oranges/Yellows
    saturation: [80, 100],
    lightness: [50, 60],
    analogous: 40,
  },
  minimal: {
    name: 'Minimal',
    baseHue: [0, 360], // Any hue but...
    saturation: [5, 15], // ...extremely desaturated
    lightness: [20, 40],
    analogous: 180,
  }
};

/**
 * Heuristic to guess a preset based on keywords in title/scenario
 */
export function guessPreset(title = '', scenario = '') {
  const text = (title + ' ' + scenario).toLowerCase();

  const rules = [
    { id: 'nature', keywords: ['farm', 'plant', 'env', 'nature', 'green', 'tree', 'eco', 'garden', 'health', 'bio'] },
    { id: 'cyberpunk', keywords: ['ai', 'agent', 'bot', 'cyber', 'system', 'terminal', 'tech', 'future', 'hack', 'code', 'packet', 'network'] },
    { id: 'minimal', keywords: ['write', 'note', 'focus', 'clean', 'simple', 'minimal', 'pure', 'calm', '禅', 'text'] },
    { id: 'vibrant', keywords: ['game', 'news', 'hot', 'fire', 'alert', 'social', 'play', 'fun', 'kids', 'shop', 'sale'] },
    { id: 'professional', keywords: ['manage', 'tool', 'finance', 'dash', 'work', 'biz', 'stock', 'project', 'plan', 'task', 'job', 'bento'] },
    { id: 'creative', keywords: ['art', 'music', 'video', 'photo', 'style', 'design', 'magic', 'dream', 'color', 'spark'] },
  ];

  for (const rule of rules) {
    if (rule.keywords.some(k => text.includes(k))) return rule.id;
  }

  return 'professional'; // Default
}

/**
 * Generate a consistent, reproducible color palette from a string seed (e.g., outId).
 */
export function generateTheme(seedString, presetId = 'professional') {
  // Simple hash function to get a number from a string
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    const char = seedString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  const seed = Math.abs(hash);

  const preset = PRESETS[presetId] || PRESETS.professional;

  // Use preset ranges
  const [minHue, maxHue] = preset.baseHue;
  const hue = minHue + (seed % (maxHue - minHue + 1));
  
  const [minSat, maxSat] = preset.saturation;
  const saturation = minSat + (seed % (maxSat - minSat + 1));
  
  const [minLit, maxLit] = preset.lightness;
  const lightness = minLit + (seed % (maxLit - minLit + 1));

  // HSL strings
  const primary = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  const primaryLight = `hsl(${hue}, ${saturation}%, ${lightness + 15}%)`;
  const primaryDark = `hsl(${hue}, ${saturation}%, ${lightness - 15}%)`;

  // Complementary or Analogous color for accents based on preset shift
  const secondaryHue = (hue + preset.analogous + (seed % 30)) % 360;
  const secondary = `hsl(${secondaryHue}, ${saturation - 10}%, ${lightness}%)`;

  const accentSoft = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.12)`;

  // Background/Surface colors
  // We use very low saturation base hue for consistent but subtly matched neutrals
  let surface = `hsl(${hue}, 10%, 98%)`;
  let surfaceDark = `hsl(${hue}, 15%, 10%)`;

  if (presetId === 'cyberpunk') {
    surface = `hsl(${hue}, 20%, 96%)`;
    surfaceDark = `hsl(${hue}, 25%, 5%)`; // Deeper dark for cyberpunk
  }

  return {
    seed: seedString,
    id: seedString,
    preset: presetId,
    palette: {
      primary,
      primaryLight,
      primaryDark,
      secondary,
      surface,
      surfaceDark,
      // For CSS consumption
      colors: {
        '--primary': primary,
        '--primary-light': primaryLight,
        '--primary-dark': primaryDark,
        '--secondary': secondary,
        '--surface': surface,
        '--surface-dark': surfaceDark,
        '--accent': primary, // Legacy support
        '--accent-soft': accentSoft,
        '--theme-gradient': `linear-gradient(135deg, ${primary}, ${secondary})`,
      },
      // Gradient helper
      gradient: `linear-gradient(135deg, ${primary}, ${secondary})`,
    },
    // Metadata for UI
    metadata: {
      hue,
      mainColor: primary,
      presetName: preset.name
    }
  };
}

