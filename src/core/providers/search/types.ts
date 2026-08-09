export interface SearchQuery {
  query: string;
  limit: number;
  /** bias toward recent material when the question needs current info */
  freshness?: "day" | "week" | "month" | "year" | undefined;
  signal?: AbortSignal | undefined;
}

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  publishedAt?: string | undefined;
  provider: string;
  rank: number;
}

export interface SearchProvider {
  id: string;
  label: string;
  requiresKey: boolean;
  isAvailable(): Promise<boolean>;
  search(q: SearchQuery): Promise<SearchHit[]>;
}