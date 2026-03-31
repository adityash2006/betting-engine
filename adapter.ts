import { Delivery, DeliveryWicket, MatchData, PlayerStats } from './types';

export interface RoanuzOverSummaryPage {
  data?: {
    summaries?: RoanuzOverSummary[];
    next_page_key?: string | null;
    previous_page_key?: string | null;
    next_page_index?: RoanuzPageIndex | null;
    previous_page_index?: RoanuzPageIndex | null;
  };
  meta?: unknown;
  cache?: unknown;
}

export interface RoanuzOverSummary {
  index: RoanuzPageIndex;
  runs?: number;
  wickets?: number;
  match_score?: {
    runs?: number;
    wickets?: number;
    title?: string;
    winner?: string;
  };
}

export interface RoanuzPageIndex {
  innings?: string;
  over_number?: number;
}

export interface RoanuzBallByBallResponse {
  data?: {
    over?: RoanuzOverPayload;
    overs?: RoanuzOverPayload[];
    innings?: RoanuzOverPayload[];
    teams?: Record<string, RoanuzTeamInfo>;
    match?: {
      result?: {
        winner?: string;
      };
      teams?: Record<string, RoanuzTeamInfo>;
    };
    players?: Record<string, RoanuzPlayerInfo>;
  };
  cache?: {
    expires?: number;
  };
}

export interface RoanuzOverPayload {
  index?: RoanuzPageIndex;
  balls?: RoanuzBallPayload[];
}

export interface RoanuzBallPayload {
  key?: string;
  overs?: [number, number];
  innings?: string;
  batting_team?: string;
  batsman?: {
    player_key?: string;
    runs?: number;
    is_four?: boolean;
    is_six?: boolean;
  };
  bowler?: {
    player_key?: string;
    runs?: number;
    is_wicket?: boolean;
  };
  team_score?: {
    ball_count?: number;
    runs?: number;
    extras?: number;
    is_wicket?: boolean;
  };
  wicket?: {
    kind?: string;
    player_out_key?: string;
    player_out_name?: string;
    wicket_number?: number;
  } | null;
  display_score?: string;
  entry_time?: number;
  updated_time?: number;
}

interface RoanuzTeamInfo {
  name?: string;
  short_name?: string;
  code?: string;
}

interface RoanuzPlayerInfo {
  fullname?: string;
  short_name?: string;
  name?: string;
}

export function normalizeMatchData(
  overSummaryPages: RoanuzOverSummaryPage[],
  ballByBall: RoanuzBallByBallResponse,
): MatchData {
  const deliveries = extractDeliveries(ballByBall);
  const players = aggregatePlayers(deliveries);
  const score = deriveScore(deliveries, overSummaryPages);
  const overs = deriveOvers(deliveries, overSummaryPages);
  const winner =
    ballByBall.data?.match?.result?.winner ?? deriveWinnerFromSummary(overSummaryPages);

  return {
    score,
    overs,
    deliveries,
    players,
    winner,
    innings: deliveries[0]?.innings,
    updatedAt: toIsoTimestamp(ballByBall.cache?.expires),
  };
}

function extractDeliveries(response: RoanuzBallByBallResponse): Delivery[] {
  const overPayloads = collectOvers(response);
  const teamLookup = buildTeamLookup(response);
  const playerLookup = buildPlayerLookup(response);
  const deliveries: Delivery[] = [];

  for (const overPayload of overPayloads) {
    const inningsKey = overPayload.index?.innings;
    const innings = parseInnings(inningsKey);
    const baseOverNumber = Math.max((overPayload.index?.over_number ?? 1) - 1, 0);

    overPayload.balls?.forEach((ball, idx) => {
      const ballNumber = inferBallNumber(ball, idx);
      const totalRuns = ball.team_score?.runs ?? 0;
      const batsmanRuns = ball.batsman?.runs ?? 0;
      deliveries.push({
        over: baseOverNumber,
        ball: ballNumber,
        runs: totalRuns,
        batsmanRuns,
        extras: Math.max(totalRuns - batsmanRuns, 0),
        total: parseDisplayScore(ball.display_score)?.runs,
        team: resolveTeam(ball, inningsKey, teamLookup),
        batsman: resolvePlayer(ball.batsman?.player_key, playerLookup),
        bowler: resolvePlayer(ball.bowler?.player_key, playerLookup),
        wicket: mapWicket(ball, teamLookup, playerLookup),
        innings,
        timestamp: toIsoTimestamp(ball.updated_time ?? ball.entry_time),
      });
    });
  }

  return deliveries.sort((a, b) => (a.over - b.over) || (a.ball - b.ball));
}

function aggregatePlayers(deliveries: Delivery[]): PlayerStats[] {
  const map = new Map<string, PlayerStats>();
  for (const delivery of deliveries) {
    if (!delivery.batsman) continue;
    const entry = map.get(delivery.batsman) ?? {
      name: delivery.batsman,
      runs: 0,
      boundaries: 0,
      ballsFaced: 0,
      team: delivery.team,
    };
    entry.runs += delivery.batsmanRuns ?? 0;
    entry.ballsFaced = (entry.ballsFaced ?? 0) + 1;
    if (!entry.team && delivery.team) {
      entry.team = delivery.team;
    }
    if (delivery.batsmanRuns === 4 || delivery.batsmanRuns === 6) {
      entry.boundaries += 1;
    }
    map.set(delivery.batsman, entry);
  }

  return [...map.values()]
    .map((player) => ({
      ...player,
      strikeRate:
        player.ballsFaced && player.ballsFaced > 0
          ? Number(((player.runs / player.ballsFaced) * 100).toFixed(2))
          : undefined,
    }))
    .sort((a, b) => b.runs - a.runs);
}

function deriveScore(deliveries: Delivery[], pages: RoanuzOverSummaryPage[]): number {
  const lastDelivery = deliveries[deliveries.length - 1];
  if (lastDelivery?.total !== undefined) {
    return lastDelivery.total;
  }
  const lastSummary = findLatestSummary(pages);
  return lastSummary?.match_score?.runs ?? 0;
}

function deriveOvers(deliveries: Delivery[], pages: RoanuzOverSummaryPage[]): number {
  const lastDelivery = deliveries[deliveries.length - 1];
  if (lastDelivery) {
    return Number(`${lastDelivery.over}.${lastDelivery.ball}`);
  }
  const lastSummary = findLatestSummary(pages);
  if (lastSummary?.index?.over_number) {
    const over = Math.max((lastSummary.index.over_number ?? 1) - 1, 0);
    return over;
  }
  return 0;
}

function deriveWinnerFromSummary(pages: RoanuzOverSummaryPage[]): string | undefined {
  for (const page of pages) {
    const summaries = page.data?.summaries ?? [];
    for (const summary of summaries) {
      const winner = summary.match_score?.winner;
      if (winner) return winner;
    }
  }
  return undefined;
}

function collectOvers(response: RoanuzBallByBallResponse): RoanuzOverPayload[] {
  const overs: RoanuzOverPayload[] = [];
  if (response.data?.over) overs.push(response.data.over);
  if (Array.isArray(response.data?.overs)) overs.push(...response.data.overs);
  if (Array.isArray(response.data?.innings)) overs.push(...response.data.innings);
  return overs;
}

function buildTeamLookup(response: RoanuzBallByBallResponse): Record<string, string> {
  const lookup: Record<string, string> = {};
  const teamSources = [response.data?.teams, response.data?.match?.teams];
  for (const source of teamSources) {
    if (!source) continue;
    for (const [key, info] of Object.entries(source)) {
      const label = info.short_name ?? info.code ?? info.name;
      if (label) lookup[key] = label;
    }
  }
  return lookup;
}

function buildPlayerLookup(response: RoanuzBallByBallResponse): Record<string, string> {
  const lookup: Record<string, string> = {};
  const players = response.data?.players ?? {};
  for (const [key, info] of Object.entries(players)) {
    const label = info.short_name ?? info.fullname ?? info.name;
    if (label) lookup[key] = label;
  }
  return lookup;
}

function resolveTeam(
  ball: RoanuzBallPayload,
  inningsKey: string | undefined,
  lookup: Record<string, string>,
): string | undefined {
  const key = ball.batting_team ?? inningsKey ?? ball.innings;
  if (!key) return undefined;
  return lookup[key] ?? key.toUpperCase();
}

function resolvePlayer(key: string | undefined, lookup: Record<string, string>): string | undefined {
  if (!key) return undefined;
  return lookup[key] ?? humanizeKey(key);
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function mapWicket(
  ball: RoanuzBallPayload,
  teamLookup: Record<string, string>,
  playerLookup: Record<string, string>,
): DeliveryWicket | null {
  if (!ball.wicket && !ball.bowler?.is_wicket) return null;
  const wicket = ball.wicket ?? undefined;
  return {
    playerOut:
      resolvePlayer(wicket?.player_out_key, playerLookup) ?? wicket?.player_out_name,
    type: wicket?.kind,
    number: wicket?.wicket_number,
    team: resolveTeam(ball, ball.innings, teamLookup),
    score: parseDisplayScore(ball.display_score)?.runs,
  };
}

function parseDisplayScore(display?: string): { runs: number; wickets?: number } | undefined {
  if (!display) return undefined;
  const match = display.match(/(\d+)\/(\d+)/);
  if (!match) return undefined;
  return {
    runs: Number(match[1]),
    wickets: Number(match[2]),
  };
}

function inferBallNumber(ball: RoanuzBallPayload, index: number): number {
  if (Array.isArray(ball.overs) && ball.overs.length > 1) {
    return ball.overs[1];
  }
  return (index % 6) + 1;
}

function parseInnings(inningsKey?: string): number | undefined {
  if (!inningsKey) return undefined;
  const match = inningsKey.match(/_(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function findLatestSummary(pages: RoanuzOverSummaryPage[]): RoanuzOverSummary | undefined {
  let latest: RoanuzOverSummary | undefined;
  for (const page of pages) {
    const summaries = page.data?.summaries ?? [];
    for (const summary of summaries) {
      if (!latest) {
        latest = summary;
        continue;
      }
      const currentOver = summary.index?.over_number ?? 0;
      const bestOver = latest.index?.over_number ?? 0;
      if (currentOver > bestOver) {
        latest = summary;
      }
    }
  }
  return latest;
}

function toIsoTimestamp(epochSeconds?: number): string | undefined {
  if (!epochSeconds) return undefined;
  return new Date(epochSeconds * 1000).toISOString();
}
