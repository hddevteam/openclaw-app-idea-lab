/**
 * Theme Presets with unique visual foundations
 */
export const PRESETS = {
  professional: {
    name: 'Professional',
    baseHue: [210, 225], // Trustworthy Blues
    saturation: [40, 60], // More muted, serious
    lightness: [45, 55],
    analogous: 15, // Very tight color harmony
  },
  creative: {
    name: 'Creative',
    baseHue: [260, 290], // Deep Purples
    saturation: [60, 75],
    lightness: [50, 60],
    analogous: 120, // Distinct offset
  },
  tech: {
    name: 'Tech',
    baseHue: [190, 210], // Dark Blues/Slate
    saturation: [50, 70],
    lightness: [40, 50],
    analogous: 30, // Subtle cyan/teal accents
  },
  nature: {
    name: 'Nature',
    baseHue: [140, 165], // Sage/Forest greens
    saturation: [30, 45], // Earthy/Natural
    lightness: [35, 45],
    analogous: 20,
  },
  vibrant: {
    name: 'Vibrant',
    baseHue: [10, 35], // Warm Oranges/Ambers
    saturation: [70, 85],
    lightness: [50, 60],
    analogous: 30,
  },
  minimal: {
    name: 'Minimal',
    baseHue: [200, 240], // Cool Grays
    saturation: [2, 10], // Almost monochrome
    lightness: [15, 30],
    analogous: 180,
  }
};

/**
 * Heuristic to guess a preset based on keywords in title/scenario
 */
export function guessPreset(title = '', scenario = '') {
  const text = (title + ' ' + scenario).toLowerCase();

  const rules = [
    { id: 'nature', keywords: ['farm', 'plant', 'env', 'nature', 'green', 'tree', 'eco', 'garden', 'health', 'bio', 'leaf', 'wood'] },
    { id: 'tech', keywords: ['ai', 'agent', 'bot', 'system', 'terminal', 'tech', 'future', 'hack', 'code', 'packet', 'network', 'data', 'security', 'cyber'] },
    { id: 'minimal', keywords: ['write', 'note', 'focus', 'clean', 'simple', 'minimal', 'pure', 'calm', '禅', 'text', 'book'] },
    { id: 'vibrant', keywords: ['game', 'news', 'hot', 'fire', 'alert', 'social', 'play', 'fun', 'kids', 'shop', 'sale', 'fast', 'food'] },
    { id: 'professional', keywords: ['manage', 'tool', 'finance', 'dash', 'work', 'biz', 'stock', 'project', 'plan', 'task', 'job', 'bento', 'chart', 'crm'] },
    { id: 'creative', keywords: ['art', 'music', 'video', 'photo', 'style', 'design', 'magic', 'dream', 'color', 'spark', 'creative', 'gallery'] },
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
  const primaryLight = `hsl(${hue}, ${saturation}%, ${lightness + 10}%)`;
  const primaryDark = `hsl(${hue}, ${saturation}%, ${lightness - 10}%)`;

  // Complementary or Analogous color for accents based on preset shift
  // We keep the secondary much closer to primary for sophistication unless it's creative/minimal
  const shift = preset.analogous;
  const secondaryHue = (hue + shift + (seed % 10)) % 360;
  const secondarySaturation = Math.max(10, saturation - 15);
  const secondary = `hsl(${secondaryHue}, ${secondarySaturation}%, ${lightness}%)`;

  const accentSoft = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.1)`;

  // Background/Surface colors - derive from the hue for cohesion
  const surface = `hsl(${hue}, ${Math.min(10, saturation)}%, 98%)`;
  const surfaceDark = `hsl(${hue}, ${Math.min(20, saturation)}%, 8%)`;
  
  // New: Specific background for container/card depth
  const bgSubtle = `hsl(${hue}, ${Math.min(5, saturation)}%, 96%)`;
  const bgSubtleDark = `hsl(${hue}, ${Math.min(10, saturation)}%, 12%)`;

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
      colors: {
        '--primary': primary,
        '--primary-light': primaryLight,
        '--primary-dark': primaryDark,
        '--secondary': secondary,
        '--surface': surface,
        '--surface-dark': surfaceDark,
        '--bg-subtle': bgSubtle,
        '--bg-subtle-dark': bgSubtleDark,
        '--accent-soft': accentSoft,
        '--theme-gradient': `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
        '--glass-bg': `hsla(${hue}, ${Math.min(10, saturation)}%, 98%, 0.8)`,
        '--glass-bg-dark': `hsla(${hue}, ${Math.min(20, saturation)}%, 10%, 0.8)`,
      },
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

