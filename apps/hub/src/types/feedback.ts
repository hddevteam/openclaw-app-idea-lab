export type Feedback = {
  date: string;
  rating: number;
  tags?: Record<string, string[]>;
  notes?: string;
  updatedAt?: string;
};
