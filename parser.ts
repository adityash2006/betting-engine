import { Bet, BetCategory, BetMetric } from './types';

const NBSP_REGEX = /\u00a0/g;
const MULTI_SPACE_REGEX = /\s+/g;

const ORDINAL_REGEX = /(\d+)(?:st|nd|rd|th)?/i;
 
export interface BetParserRule {
  name: string;
  category: BetCategory;
  metric: BetMetric;
  pattern: RegExp;
  transform(match: RegExpMatchArray, raw: string, normalized: string): Partial<Bet>;
}

export class BetParser {
  private readonly rules: BetParserRule[];

  constructor(rules: BetParserRule[] = []) {
    this.rules = [...rules];
  }

  registerRule(rule: BetParserRule): void {
    this.rules.push(rule);
  }

  parse(rawName: string): Bet {
    const normalized = normalizeName(rawName);

    for (const rule of this.rules) {
      const execMatch = normalized.match(rule.pattern);
      if (!execMatch) continue;

      const partial = rule.transform(execMatch, rawName, normalized);
      return {
        category: partial.category ?? rule.category,
        metric: partial.metric ?? rule.metric,
        condition: partial.condition,
        value: partial.value,
        context: partial.context ?? {},
        source: partial.source ?? { market: rawName },
      };
    }

    throw new Error(`Unsupported bet name: ${rawName}`);
  }
}


export function parseBet(rawName: string, parser: BetParser = defaultBetParser): Bet {
  return parser.parse(rawName);
}
const ballRunRule: BetParserRule = {
  name: 'ball-run',
  category: 'BALL',
  metric: 'runs',
  pattern: /^(\d{1,2})\.(\d)\s+Ball Run\s+(.+)$/i,
  transform: (match) => {
    const [, over = '0', ball = '0', team] = match;
    return {
      context: {
        over: Number(over),
        ball: Number(ball),
        team: normalizeTeam(team),
      },
    };
  },
};





const overScoreRule: BetParserRule = {
  name: 'over-score',
  category: 'OVER',
  metric: 'runs',
  pattern: /^(\d{1,2})(?:\.(\d))?\s+Over\s+(.+)$/i,
  transform: (match) => {
    const [, over = '0', ball, team] = match;
    return {
      context: {
        over: Number(over),
        ball: ball ? Number(ball) : undefined,
        team: normalizeTeam(team),
      },
    };
  },
};

const overRunsOnlyRule: BetParserRule = {
  name: 'over-runs-only',
  category: 'SESSION',
  metric: 'session_total',
  pattern: /^(\d+)(?:st|nd|rd|th)\s+Over\s+(?:Runs Only\s+)?(.+)$/i,
  transform: (match) => {
    const [, over = '0', team] = match;
    return {
      context: {
        over: Number(over),
        team: normalizeTeam(team),
      },
      condition: 'runs_only',
    };
  },
};

const inningsLineRule: BetParserRule = {
  name: 'innings-line',
  category: 'SESSION',
  metric: 'session_total',
  pattern: /^(\d+)(?:st|nd|rd|th)?\s+Innings\s+(\d{1,2})\s+Overs Line$/i,
  transform: ([, innings, overs]) => ({
    context: {
      innings: Number(innings),
      over: Number(overs),
    },
  }),
};

const inningsOddEvenRule: BetParserRule = {
  name: 'innings-odd-even',
  category: 'SPECIAL',
  metric: 'odd_even',
  pattern: /^MATCH\s+(\d+)(?:ST|ND|RD|TH)\s+INNING\s+(\d{1,2})\s+OVER\s+TOTAL RUN\s+(ODD|EVEN)$/i,
  transform: (match) => {
    const [, innings = '0', over = '0', oddEven = ''] = match;
    return {
      context: {
        innings: Number(innings),
        over: Number(over),
      },
      condition: oddEven ? oddEven.toLowerCase() : undefined,
    };
  },
};

const playerStatRule: BetParserRule = {
  name: 'player-stat',
  category: 'PLAYER',
  metric: 'runs',
  pattern: /^(.+?)\s+(Runs|Boundaries|Run Bhav|Even Run(?:\s*@\s*\d+)?)/i,
  transform: (match) => {
    const [, playerName = '', metricRaw = ''] = match;
    const normalizedMetric = normalizePlayerMetric(metricRaw);
    const isOddEven = /odd|even/i.test(metricRaw);
    return {
      metric: normalizedMetric,
      condition: isOddEven
        ? metricRaw.toLowerCase().includes('odd')
          ? 'odd'
          : 'even'
        : undefined,
      context: {
        player: normalizePlayer(playerName),
      },
    };
  },
};

const playerBallsFacedRule: BetParserRule = {
  name: 'player-balls-faced',
  category: 'PLAYER',
  metric: 'session_total',
  pattern: /^H\.M\.B Face By\s+(.+)$/i,
  transform: (match) => {
    const [, playerName = ''] = match;
    return {
      condition: 'balls_faced',
      context: {
        player: normalizePlayer(playerName),
      },
    };
  },
};

const partnershipRule: BetParserRule = {
  name: 'partnership',
  category: 'PARTNERSHIP',
  metric: 'partnership',
  pattern: /^(\d+)(?:st|nd|rd|th)\s+WKT(?:\s+Pship)?\s*(Boundaries|Runs)?\s+(.+)$/i,
  transform: (match) => {
    const [, wicket, metricRaw, team] = match;
    const token = metricRaw?.toLowerCase();
    return {
      metric: token?.includes('boundaries') ? 'boundaries' : 'partnership',
      context: {
        wicket: parseOrdinal(wicket),
        team: normalizeTeam(team),
      },
    };
  },
};

const wicketRule: BetParserRule = {
  name: 'wicket',
  category: 'WICKET',
  metric: 'wickets',
  pattern: /^(\d+)(?:st|nd|rd|th)\s+WKT.*$/i,
  transform: ([match], raw, normalized) => ({
    context: {
      wicket: parseOrdinal(match),
      team: extractTeam(normalized),
    },
    condition: inferOddEven(normalized),
  }),
};

const multiWicketRule: BetParserRule = {
  name: 'multi-wicket',
  category: 'WICKET',
  metric: 'wickets',
  pattern: /^(\d+)(?:st|nd|rd|th)\s+(\d+)\s+Wkt\s+(.+)$/i,
  transform: (match) => {
    const [, ordinal = '0', wicket = '0', team] = match;
    return {
      context: {
        wicket: Number(wicket),
        team: normalizeTeam(team),
        raw: {
          nthSet: Number(ordinal),
        },
      },
    };
  },
};

const matchWinnerRule: BetParserRule = {
  name: 'match-winner',
  category: 'MATCH',
  metric: 'winner',
  pattern: /^(Who Will Win The Match\?|Match Odds|Tied Match)$/i,
  transform: () => ({
    metric: 'winner',
  }),
};

const specialOddEvenRule: BetParserRule = {
  name: 'special-odd-even',
  category: 'SPECIAL',
  metric: 'odd_even',
  pattern: /(Odd|Even)\s+Run/i,
  transform: (match) => {
    const [, oddEven = ''] = match;
    return {
      condition: oddEven ? (oddEven.toLowerCase() as 'odd' | 'even') : undefined,
    };
  },
};

function normalizeName(input: string): string {
  return input.replace(NBSP_REGEX, ' ').replace(MULTI_SPACE_REGEX, ' ').trim();
}

function normalizeTeam(value?: string): string | undefined {
  const label = stripTrailingTokens(sanitizeLabel(value));
  return label ? label.toUpperCase() : undefined;
}

function normalizePlayer(value?: string): string | undefined {
  const label = sanitizeLabel(value);
  return label || undefined;
}

function sanitizeLabel(value?: string): string {
  if (!value) return '';
  return value
    .replace(NBSP_REGEX, ' ')
    .replace(/@.+$/, '')
    .replace(/\s*\(\d+\)$/, '')
    .replace(MULTI_SPACE_REGEX, ' ')
    .trim();
}

function stripTrailingTokens(value?: string): string {
  if (!value) return '';
  const tokens = ['runs', 'run', 'balls', 'boundaries', 'line', 'bhav', 'only'];
  let output = value.trim();
  for (const token of tokens) {
    output = output.replace(new RegExp(`\\s+${token}$`, 'i'), '');
  }
  return output.trim();
}

function parseOrdinal(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(ORDINAL_REGEX);
  return match ? Number(match[1]) : undefined;
}

const TEAM_TOKEN_BLACKLIST = new Set([
  'balls',
  'ball',
  'runs',
  'run',
  'boundaries',
  'line',
  'bhav',
  'odd',
  'even',
  'lost',
  'to',
  'caught',
  'out',
  'face',
  'by',
  'pship',
  'wkt',
]);

function extractTeam(value: string): string | undefined {
  if (!value) return undefined;
  const sanitized = sanitizeLabel(value);
  const tokens = sanitized.split(' ').filter(Boolean);
  for (let idx = tokens.length - 1; idx >= 0; idx--) {
    const token = tokens[idx];
    if (!token) continue;
    if (!/[A-Za-z]/.test(token)) continue;
    if (TEAM_TOKEN_BLACKLIST.has(token.toLowerCase())) continue;
    let start = idx;
    while (start - 1 >= 0) {
      const prev = tokens[start - 1];
      if (!prev) break;
      if (!/[A-Za-z]/.test(prev)) break;
      if (TEAM_TOKEN_BLACKLIST.has(prev.toLowerCase())) break;
      start -= 1;
    }
    const candidate = tokens.slice(start, idx + 1).join(' ');
    const normalized = stripTrailingTokens(candidate);
    if (normalized) {
      return normalizeTeam(normalized);
    }
  }
  return undefined;
}

function inferOddEven(value: string): string | undefined {
  if (/odd/i.test(value)) return 'odd';
  if (/even/i.test(value)) return 'even';
  return undefined;
}

function normalizePlayerMetric(value?: string): BetMetric {
  const lower = value?.toLowerCase() ?? '';
  if (lower.includes('boundary')) return 'boundaries';
  if (lower.includes('odd') || lower.includes('even')) return 'odd_even';
  return 'runs';
}

export const defaultBetParser = new BetParser(createCricketRules());
function createCricketRules(): BetParserRule[] {
  return [
    ballRunRule,
    overScoreRule,
    overRunsOnlyRule,
    inningsLineRule,
    inningsOddEvenRule,
    playerStatRule,
    playerBallsFacedRule,
    partnershipRule,
    wicketRule,
    multiWicketRule,
    matchWinnerRule,
    specialOddEvenRule,
  ];
}