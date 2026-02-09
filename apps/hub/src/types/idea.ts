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
}
