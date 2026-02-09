/**
 * Perspective Slots – multi-perspective idea generation dimensions.
 *
 * Defines the "Refinement by Selection" approach: instead of interactive
 * dialogue to refine vague topics, we generate ideas that span multiple
 * perspectives so users refine through choosing.
 *
 * Pure functions – no IO, no LLM calls.
 */

// ---------------------------------------------------------------------------
// Dimension definitions
// ---------------------------------------------------------------------------

export const PERSPECTIVE_DIMENSIONS = {
  scope: {
    name: '范围梯度',
    description: '从小切口 MVP 到全平台',
    examples: ['scope:mvp', 'scope:mid-product', 'scope:full-platform'],
  },
  user: {
    name: '用户假设',
    description: '挑战原始 topic 的隐含假设，探索不同用户群体',
    examples: ['user:wedding-photographer', 'user:product-photographer', 'user:hobbyist'],
  },
  interaction: {
    name: '交互模式',
    description: '不同的交互方式与产品形态',
    examples: ['interaction:visual', 'interaction:cli', 'interaction:ai-auto'],
  },
  business: {
    name: '商业模式',
    description: '不同的商业变现方式，影响功能边界',
    examples: ['business:free-tool', 'business:saas', 'business:one-time-purchase'],
  },
};

export const DEFAULT_DIMENSIONS = ['scope', 'user', 'interaction'];

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the perspective-diversity instruction block for the ideation prompt.
 *
 * @param {number} count – how many ideas to generate
 * @param {string[]} dimensions – which dimensions to enforce (keys of PERSPECTIVE_DIMENSIONS)
 * @returns {string} multi-line prompt fragment
 */
export function buildPerspectivePrompt(count, dimensions = DEFAULT_DIMENSIONS) {
  const validDims = dimensions.filter(d => PERSPECTIVE_DIMENSIONS[d]);
  if (!validDims.length) return '';

  const dimLines = validDims.map(d => {
    const dim = PERSPECTIVE_DIMENSIONS[d];
    return `- ${dim.name} (${d}): ${dim.description}。示例标签：${dim.examples.join(', ')}`;
  });

  const minDiversity = Math.min(3, validDims.length);
  const dimSet = new Set(validDims);

  // Build dynamic requirement lines based on active dimensions
  const requirementLines = [];
  if (dimSet.has('scope')) {
    requirementLines.push('- 至少 2 个不同的范围粒度（一个小切口 MVP，一个更完整的产品）');
  }
  if (dimSet.has('user')) {
    requirementLines.push('- 至少 2 个不同的用户假设（挑战原始 topic 的隐含假设）');
  }
  if (dimSet.has('interaction')) {
    requirementLines.push('- 至少 2 个不同的交互模式');
  }
  if (dimSet.has('business')) {
    requirementLines.push('- 至少 2 个不同的商业模式');
  }

  return [
    `你需要生成 ${count} 个 idea，它们必须在以下维度上体现差异：`,
    ...dimLines,
    '',
    '要求：',
    `- 至少覆盖 ${minDiversity} 种维度的差异`,
    ...requirementLines,
    '- 明确禁止生成"同一个 idea 的微调变体"——每个 idea 在至少一个维度上有本质差异',
    '',
    '每个 idea 必须包含：',
    '- perspectiveTags: 数组，格式为 ["dimension:value"]，如 ["scope:mvp", "user:wedding-photographer", "interaction:cli"]',
    '- challengesOriginal: 字符串，说明该 idea 对原始 topic 的隐含挑战',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Tag parsing & normalisation
// ---------------------------------------------------------------------------

/**
 * Parse and normalise perspective tags from LLM output.
 * Filters out tags with unknown dimensions or empty values.
 *
 * @param {any[]} rawTags – expected: ["scope:mvp", "user:hobbyist"]
 * @returns {string[]} normalised tags
 */
export function parsePerspectiveTags(rawTags) {
  if (!Array.isArray(rawTags)) return [];

  const validDimensions = new Set(Object.keys(PERSPECTIVE_DIMENSIONS));

  return rawTags
    .map(String)
    .map(tag => tag.trim().toLowerCase())
    .filter(tag => {
      const colon = tag.indexOf(':');
      if (colon < 1) return false;
      const dim = tag.slice(0, colon);
      const val = tag.slice(colon + 1);
      return val.length > 0 && validDimensions.has(dim);
    });
}

// ---------------------------------------------------------------------------
// Diversity scoring
// ---------------------------------------------------------------------------

/**
 * Compute how different a new idea's tags are from existing ideas.
 * Uses Jaccard distance against the most similar existing idea.
 * Returns 1.0 (completely unique) to 0.0 (identical tags).
 *
 * @param {string[]} newTags
 * @param {string[][]} existingTagSets – array of tag arrays from existing ideas
 * @returns {number} 0..1
 */
export function computeDiversityScore(newTags, existingTagSets) {
  if (!existingTagSets.length || !newTags.length) return 1.0;

  const newSet = new Set(newTags);

  const distances = existingTagSets.map(existingTags => {
    const existingSet = new Set(existingTags);
    const intersection = [...newSet].filter(t => existingSet.has(t)).length;
    const union = new Set([...newSet, ...existingSet]).size;
    return union === 0 ? 1.0 : 1 - intersection / union;
  });

  // Return minimum distance (closest to the most similar existing idea)
  return Math.min(...distances);
}

// ---------------------------------------------------------------------------
// Batch diversity validation
// ---------------------------------------------------------------------------

/**
 * Validate that a set of ideas covers enough distinct perspective dimensions.
 *
 * @param {object[]} ideas – each should have `perspectiveTags: string[]`
 * @param {number} minDimensions – required distinct dimensions (default 3)
 * @returns {{ sufficient: boolean, dimensionCount: number, dimensions: string[], required: number }}
 */
export function validateDiversity(ideas, minDimensions = 3) {
  const allDimensions = new Set();
  for (const idea of ideas) {
    const tags = idea.perspectiveTags || [];
    for (const tag of tags) {
      const colon = tag.indexOf(':');
      if (colon > 0) allDimensions.add(tag.slice(0, colon));
    }
  }

  return {
    sufficient: allDimensions.size >= minDimensions,
    dimensionCount: allDimensions.size,
    dimensions: [...allDimensions].sort(),
    required: minDimensions,
  };
}
