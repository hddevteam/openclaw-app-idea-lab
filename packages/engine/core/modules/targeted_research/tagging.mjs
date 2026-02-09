/**
 * Tagging – inject campaign metadata fields into idea objects.
 * Pure functions, no IO.
 */

/**
 * Tag a single idea with campaign metadata.
 * @param {object} idea – raw idea object
 * @param {{ campaignId: string, topicTag: string, originalAnchor: string }} meta
 * @returns {object} idea with injected fields
 */
export function tagIdea(idea, { campaignId, topicTag, originalAnchor }) {
  return {
    ...idea,
    campaignId,
    topicTag,
    isTargeted: true,
    originalAnchor,
  };
}

/**
 * Tag an array of ideas with campaign metadata.
 */
export function tagIdeas(ideas, campaignMeta) {
  return ideas.map(idea => tagIdea(idea, campaignMeta));
}

/**
 * Build a stable, deterministic idea ID from campaign + index.
 * Avoids random IDs so test assertions are predictable.
 *
 * @param {string} campaignId
 * @param {number} index – 0-based
 * @returns {string}
 */
export function buildIdeaId(campaignId, index) {
  return `${campaignId}_idea_${String(index).padStart(3, '0')}`;
}

/**
 * Merge new ideas into an existing backlog list.
 * Skips duplicates (by `id`).
 *
 * @param {object[]} existingIdeas
 * @param {object[]} newIdeas
 * @returns {object[]} merged list (existing first, then unique new)
 */
export function mergeIntoBacklog(existingIdeas, newIdeas) {
  const existingIds = new Set(existingIdeas.map(i => i.id));
  const toAdd = newIdeas.filter(i => !existingIds.has(i.id));
  return [...existingIdeas, ...toAdd];
}
