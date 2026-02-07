export type ManifestEntry = {
  date: string;
  title: string;
  desc?: string;
  scenario?: string;
  workflow?: string;
  id?: string;
  indexPath?: string;
  theme?: {
    palette: {
      colors: Record<string, string>;
      gradient?: string;
    };
    metadata?: {
      presetName?: string;
    };
  };
};

export type Manifest = {
  entries: ManifestEntry[];
};
