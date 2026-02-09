export interface IdeaSource {
  title: string;
  url: string;
}

export interface Similarity {
  score: number;
  match?: {
    id: string;
    date: string;
    title: string;
  };
}

export interface ComplexityBudget {
  minutes: number;
  screens: number;
  interactions: number;
}

export interface Idea {
  id: string;
  title: string;
  hudScenario: string;
  output: string;
  coreInteractions: string[];
  selfHealing: string[];
  keywords: string[];
  visualTheme?: string;
  complexityBudget?: ComplexityBudget;
  sources: IdeaSource[];
  similarity?: Similarity;
  createdAt?: string;
  implementedAt?: string;
  outputDate?: string;
  status?: 'new' | 'filtered' | 'backlog' | 'implemented' | 'picked';

  // Targeted Research fields
  campaignId?: string;
  topicTag?: string;
  isTargeted?: boolean;
  originalAnchor?: string;
  perspectiveTags?: string[];
  challengesOriginal?: string;
}

export interface Campaign {
  campaignId: string;
  topicTag: string;
  title?: string;
  originalAnchor: string;
  createdAt: string;
  options?: { creative?: number; count?: number; lang?: string };
  stats: { total: number; built: number; failed: number; running: number };
  perspectiveConfig?: {
    dimensions: string[];
    selectionSignals: unknown[];
  };
}
