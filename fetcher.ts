import { normalizeMatchData, RoanuzBallByBallResponse, RoanuzOverSummaryPage } from './adapter';
import { MatchData } from './types';

export interface RoanuzConfig {
  projectKey: string;
  matchKey: string;
  apiKey?: string;
  token?: string;
  baseUrl?: string;
}

export class RoanuzFetcher {
  private readonly baseUrl: string;
  private token?: string;

  constructor(private readonly config: RoanuzConfig) {
    this.baseUrl = config.baseUrl ?? 'https://api.sports.roanuz.com/v5';
    this.token = config.token;
  }

  async fetchMatchData(targetOver?: number, innings = 1): Promise<MatchData> {
    const overPagesPromise = targetOver === undefined
      ? this.fetchOverSummaryPage(undefined, innings).then((page) => [page])
      : this.fetchOverSummaryUntil(targetOver, innings);

    const [overPages, ballByBall] = await Promise.all([
      overPagesPromise,
      this.fetchBallByBall(),
    ]);

    return normalizeMatchData(overPages, ballByBall);
  }

  async fetchBallByBall(): Promise<RoanuzBallByBallResponse> {
    return this.request<RoanuzBallByBallResponse>(
      `/cricket/${this.config.projectKey}/match/${this.config.matchKey}/ball-by-ball/`,
      { method: 'GET' },
    );
  }

  async fetchOverSummaryPage(
    pageKey?: string,
    innings = 1,
  ): Promise<RoanuzOverSummaryPage> {
    const cursor = pageKey ?? defaultPageKey(innings);
    return this.request<RoanuzOverSummaryPage>(
      `/cricket/${this.config.projectKey}/match/${this.config.matchKey}/over-summary/${cursor}/`,
      { method: 'GET' },
    );
  }

  async fetchOverSummaryUntil(
    targetOver: number,
    innings = 1,
    maxPages = 40,
  ): Promise<RoanuzOverSummaryPage[]> {
    const pages: RoanuzOverSummaryPage[] = [];
    let cursor: string | null | undefined = defaultPageKey(innings);
    let pageCount = 0;

    while (cursor && pageCount < maxPages) {
      const page = await this.fetchOverSummaryPage(cursor, innings);
      pages.push(page);
      pageCount += 1;

      if (pageContainsOver(page, targetOver, innings)) {
        break;
      }

      cursor = page.data?.next_page_key ?? null;
    }

    return pages;
  }

  async refreshToken(): Promise<string> {
    this.token = await this.authenticate();
    return this.token;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const token = await this.ensureToken();
    const headers = new Headers(init.headers ?? {});
    headers.set('rs-token', token);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const message = await extractError(response);
      throw new Error(`Roanuz request failed (${response.status}): ${message}`);
    }

    return response.json() as Promise<T>;
  }

  private async ensureToken(): Promise<string> {
    if (this.token) {
      return this.token;
    }

    if (!this.config.apiKey) {
      throw new Error('Roanuz token missing and apiKey not provided.');
    }

    this.token = await this.authenticate();
    return this.token;
  }

  private async authenticate(): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error('Roanuz apiKey is required to fetch an auth token.');
    }

    const response = await fetch(
      `${this.baseUrl}/core/${this.config.projectKey}/auth/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.config.apiKey }),
      },
    );

    if (!response.ok) {
      const message = await extractError(response);
      throw new Error(`Roanuz auth failed (${response.status}): ${message}`);
    }

    const json = await response.json();
    const token = json?.data?.token ?? json?.data?.auth?.token ?? json?.token;
    if (!token) {
      throw new Error('Roanuz auth response did not include a token.');
    }
    return token;
  }
}

function defaultPageKey(innings: number): string {
  return `a_${innings}_1`;
}

function pageContainsOver(
  page: RoanuzOverSummaryPage,
  targetOver: number,
  innings: number,
): boolean {
  const summaries = page.data?.summaries ?? [];
  return summaries.some((summary) => {
    const summaryInnings = parseInningsKey(summary.index?.innings);
    if (summaryInnings && summaryInnings !== innings) {
      return false;
    }
    const scoreboardOver = (summary.index?.over_number ?? 1) - 1;
    return scoreboardOver === targetOver;
  });
}

function parseInningsKey(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/_(\d+)/);
  return match ? Number(match[1]) : undefined;
}

async function extractError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data?.error?.message ?? data?.message ?? JSON.stringify(data);
  } catch {
    return response.statusText;
  }
}
