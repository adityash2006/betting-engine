
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { evaluateBet, EvaluationResult } from './evaluator';
import { RoanuzFetcher, RoanuzConfig } from './fetcher';
import { parseBet } from './parser';
import type { Bet } from './types';

type NumericLike = number | string | null | undefined;

type RawEventsFile = Record<string, RawEventEnvelope>;

interface RawEventEnvelope {
  events?: Record<string, RawMarket>;
}

type RawMarket = RawSelection | RawSelectionGroup;

interface RawSelection {
  back?: NumericLike;
  lay?: NumericLike;
  run_back?: NumericLike;
  run_lay?: NumericLike;
  cat?: string;
}

type RawSelectionGroup = Record<string, RawSelection>;

async function main(): Promise<void> {
  const eventsPath = process.env.BETS_FILE ?? fileURLToPath(new URL('./events.json', import.meta.url));
  const rawEvents = await loadEvents(eventsPath);
  const bets = flattenBets(rawEvents);

  if (!bets.length) {
    console.warn('No bets parsed from events file.');
    return;
  }

  const config = loadConfigFromEnv();
  const fetcher = new RoanuzFetcher(config);

  const targetOver = determineMaxOver(bets);
  const matchData = await fetcher.fetchMatchData(targetOver);

  const evaluation = bets.map((bet) => ({ bet, result: evaluateBet(bet, matchData) }));
  printReport(evaluation);
}

async function loadEvents(path: string): Promise<RawEventsFile> {
  const buffer = await readFile(path, 'utf-8');
  return JSON.parse(buffer) as RawEventsFile;
}

function flattenBets(rawEvents: RawEventsFile): Bet[] {
  const bets: Bet[] = [];
  for (const envelope of Object.values(rawEvents)) {
    const markets = envelope.events ?? {};
    for (const [marketName, marketValue] of Object.entries(markets)) {
      let baseBet: Bet;
      try {
        baseBet = parseBet(marketName);
      } catch {
        continue;
      }

      if (isSelectionGroup(marketValue)) {
        for (const [selectionName, selectionData] of Object.entries(marketValue)) {
          const bet = cloneBet(baseBet);
          bet.condition = selectionName;
          bet.value = deriveNumericValue(selectionData);
          bet.source = { market: marketName, selection: selectionName };
          if (!bet.context.team && shouldAttachTeam(bet.category)) {
            bet.context.team = selectionName.toUpperCase();
          }
          bets.push(bet);
        }
      } else {
        const bet = cloneBet(baseBet);
        bet.value = deriveNumericValue(marketValue);
        bet.source = { market: marketName };
        bets.push(bet);
      }
    }
  }
  return bets;
}

function cloneBet(bet: Bet): Bet {
  return {
    category: bet.category,
    metric: bet.metric,
    condition: bet.condition,
    value: bet.value,
    context: { ...bet.context },
    source: bet.source ? { ...bet.source } : undefined,
  };
}

function deriveNumericValue(selection: RawSelection): number | undefined {
  const candidates: NumericLike[] = [selection.run_back, selection.run_lay, selection.back, selection.lay];
  for (const candidate of candidates) {
    const value = toNumber(candidate);
    if (value !== undefined && !Number.isNaN(value)) {
      return value;
    }
  }
  return undefined;
}

function toNumber(value: NumericLike): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isSelectionGroup(value: RawMarket): value is RawSelectionGroup {
  return Object.values(value).every((entry) => typeof entry === 'object' && entry !== null);
}

function shouldAttachTeam(category: Bet['category']): boolean {
  return ['MATCH', 'BALL', 'OVER', 'SESSION', 'WICKET', 'PARTNERSHIP'].includes(category);
}

function determineMaxOver(bets: Bet[]): number | undefined {
  const overs: number[] = [];
  for (const bet of bets) {
    if (!('over' in bet.context) || bet.context.over === undefined) continue;
    if (['MATCH', 'PLAYER'].includes(bet.category)) continue;
    overs.push(Math.floor(bet.context.over));
  }
  if (!overs.length) return undefined;
  return overs.reduce((max, over) => Math.max(max, over), 0);
}

function loadConfigFromEnv(): RoanuzConfig {
  const projectKey = process.env.ROANUZ_PROJECT_KEY ?? process.env.PROJECT_KEY;
  const matchKey = process.env.ROANUZ_MATCH_KEY ?? process.env.MATCH_KEY;
  const token = process.env.ROANUZ_TOKEN ?? process.env.RS_TOKEN;
  const apiKey = process.env.ROANUZ_API_KEY ?? process.env.API_KEY;

  if (!projectKey) throw new Error('Missing ROANUZ_PROJECT_KEY environment variable.');
  if (!matchKey) throw new Error('Missing ROANUZ_MATCH_KEY environment variable.');
  if (!token && !apiKey) {
    throw new Error('Provide either ROANUZ_TOKEN or ROANUZ_API_KEY for authentication.');
  }

  return {
    projectKey,
    matchKey,
    token: token ?? undefined,
    apiKey: apiKey ?? undefined,
  };
}

function printReport(results: Array<{ bet: Bet; result: EvaluationResult }>): void {
  for (const { bet, result } of results) {
    const status = formatResult(result);
    const label = bet.source?.selection
      ? `${bet.source.market} → ${bet.source.selection}`
      : bet.source?.market ?? 'Unknown';
    console.log(`${status} [${bet.category}] ${label}`);
  }
}

function formatResult(result: EvaluationResult): string {
  if (result === null) return '⏳ PENDING';
  return result ? '✅ TRUE ' : '❌ FALSE';
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});