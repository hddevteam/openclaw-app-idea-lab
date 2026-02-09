/**
 * Targeted Research – module barrel export.
 *
 * MVP-0: pure functions (config, campaign, tagging, perspective_slots).
 * MVP-0.5: pipeline integration (runner, providers, shared pipeline).
 */

export { parseTargetedConfig, parseCliArgs, DEFAULTS } from './config.mjs';
export { buildCampaignId, buildTopicTag, createCampaignMeta, normalizeCampaignList } from './campaign.mjs';
export { tagIdea, tagIdeas, buildIdeaId, mergeIntoBacklog } from './tagging.mjs';
export {
  PERSPECTIVE_DIMENSIONS,
  DEFAULT_DIMENSIONS,
  buildPerspectivePrompt,
  parsePerspectiveTags,
  computeDiversityScore,
  validateDiversity,
} from './perspective_slots.mjs';
export { runTargetedResearch, targetedPhases } from './runner.mjs';
