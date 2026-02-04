export type ManifestEntry = {
  date: string;
  title: string;
  desc?: string;
  id?: string;
  indexPath?: string;
};

export type Manifest = {
  entries: ManifestEntry[];
};
