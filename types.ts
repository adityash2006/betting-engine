export type BetCategory =
  | 'BALL'
  | 'OVER'
  | 'SESSION'
  | 'PLAYER'
  | 'MATCH'
  | 'WICKET'
  | 'PARTNERSHIP'
  | 'SPECIAL';

export type BetMetric =
  | 'runs'
  | 'boundaries'
  | 'winner'
  | 'odd_even'
  | 'partnership'
  | 'wickets'
  | 'session_total'
  | 'result';

export interface BetContext {
  over?: number;
  ball?: number;
  team?: string;
  player?: string;
  innings?: number;
  wicket?: number;
  partnership?: number;
  raw?: Record<string, unknown>;
}

export interface Bet {
  category: BetCategory;
  metric: BetMetric;
  condition?: string;
  value?: number;
  context: BetContext;
  source?: {
    market: string;
    selection?: string;
  };
}

export interface DeliveryWicket {
  playerOut?: string;
  type?: string;
  number?: number;
  score?: number;
  team?: string;
}

export interface Delivery {
  over: number;
  ball: number;
  runs: number;
  total?: number;
  team?: string;
  batsman?: string;
  batsmanRuns?: number;
  bowler?: string;
  extras?: number;
  innings?: number;
  wicket?: DeliveryWicket | null;
  timestamp?: string;
}

export interface PlayerStats {
  name: string;
  runs: number;
  boundaries: number;
  team?: string;
  ballsFaced?: number;
  strikeRate?: number;
}

export interface MatchData {
  score: number;
  overs: number;
  deliveries: Delivery[];
  players: PlayerStats[];
  winner?: string;
  target?: number;
  innings?: number;
  updatedAt?: string;
}
