import { Bet, Delivery, MatchData, PlayerStats } from './types';

export type EvaluationResult = boolean | null;

export function evaluateBet(bet: Bet, data: MatchData): EvaluationResult {
  switch (bet.category) {
    case 'BALL':
      return evaluateBallBet(bet, data);
    case 'OVER':
    case 'SESSION':
      return evaluateOverBet(bet, data);
    case 'PLAYER':
      return evaluatePlayerBet(bet, data);
    case 'MATCH':
      return evaluateMatchBet(bet, data);
    case 'WICKET':
      return evaluateWicketBet(bet, data);
    case 'PARTNERSHIP':
      return evaluatePartnershipBet(bet, data);
    case 'SPECIAL':
      return evaluateSpecialBet(bet, data);
    default:
      return null;
  }
}

function evaluateBallBet(bet: Bet, data: MatchData): EvaluationResult {
  const over = bet.context.over;
  const ball = bet.context.ball;
  if (over === undefined || ball === undefined) return null;

  const delivery = findDelivery(data.deliveries, over, ball, bet.context.team);
  if (!delivery) {
    return isFutureDelivery(data.deliveries, over, ball, bet.context.team) ? null : false;
  }

  return evaluateNumeric(delivery.runs, bet);
}

function evaluateOverBet(bet: Bet, data: MatchData): EvaluationResult {
  const over = bet.context.over;
  if (over === undefined) return null;
  const ball = bet.context.ball ?? 6;
  const score = scoreAt(data.deliveries, over, ball, bet.context.team);
  if (score === undefined) {
    return isFutureDelivery(data.deliveries, over, ball, bet.context.team) ? null : false;
  }
  if (bet.metric === 'odd_even') {
    return evaluateParity(score, bet.condition);
  }
  return evaluateNumeric(score, bet);
}

function evaluatePlayerBet(bet: Bet, data: MatchData): EvaluationResult {
  const player = findPlayer(data.players, bet.context.player);
  if (!player) return null;

  switch (bet.metric) {
    case 'runs':
      return evaluateNumeric(player.runs, bet);
    case 'boundaries':
      return evaluateNumeric(player.boundaries, bet);
    case 'odd_even':
      return evaluateParity(player.runs, bet.condition);
    case 'session_total':
      if (bet.condition === 'balls_faced') {
        return evaluateNumeric(player.ballsFaced ?? 0, bet);
      }
      return evaluateNumeric(player.runs, bet);
    default:
      return null;
  }
}

function evaluateMatchBet(bet: Bet, data: MatchData): EvaluationResult {
  if (!data.winner) return null;
  const expected = normalizeLabel(bet.condition ?? bet.context.team ?? bet.source?.selection);
  if (!expected) return null;
  return normalizeLabel(data.winner) === expected;
}

function evaluateWicketBet(bet: Bet, data: MatchData): EvaluationResult {
  const wicketNumber = bet.context.wicket;
  const team = normalizeLabel(bet.context.team);
  if (!wicketNumber || !team) return null;

  const deliveries = filterByTeam(data.deliveries, team);
  const wicketDelivery = deliveries.find((delivery) => delivery.wicket?.number === wicketNumber);

  if (!wicketDelivery) {
    const recordedMax = Math.max(
      0,
      ...deliveries.map((delivery) => delivery.wicket?.number ?? 0),
    );
    return recordedMax < wicketNumber ? null : false;
  }

  if (bet.condition === 'odd' || bet.condition === 'even') {
    const total = wicketDelivery.total;
    if (total === undefined) return null;
    return evaluateParity(total, bet.condition);
  }

  return evaluateNumeric(wicketDelivery.total ?? 0, bet);
}

function evaluatePartnershipBet(bet: Bet, data: MatchData): EvaluationResult {
  const wicketNumber = bet.context.wicket;
  const team = normalizeLabel(bet.context.team);
  if (!wicketNumber || !team) return null;

  const deliveries = filterByTeam(data.deliveries, team);
  const targetDelivery = deliveries.find((delivery) => delivery.wicket?.number === wicketNumber);
  if (!targetDelivery) return null;

  const previousDelivery = deliveries
    .filter((delivery) => (delivery.wicket?.number ?? 0) === wicketNumber - 1)
    .pop();

  const prevScore = previousDelivery?.total ?? 0;
  const actualRuns = (targetDelivery.total ?? prevScore) - prevScore;

  if (bet.metric === 'boundaries') {
    const boundaries = countBoundariesBetween(deliveries, previousDelivery, targetDelivery);
    return evaluateNumeric(boundaries, bet);
  }

  return evaluateNumeric(actualRuns, bet);
}

function evaluateSpecialBet(bet: Bet, data: MatchData): EvaluationResult {
  if (bet.metric === 'odd_even') {
    const over = bet.context.over;
    if (over === undefined) return null;
    const ball = bet.context.ball ?? 6;
    const score = scoreAt(data.deliveries, over, ball, bet.context.team);
    if (score === undefined) {
      return isFutureDelivery(data.deliveries, over, ball, bet.context.team) ? null : false;
    }
    return evaluateParity(score, bet.condition);
  }
  return null;
}

function evaluateNumeric(actual: number, bet: Bet): EvaluationResult {
  const target = bet.value;
  const condition = bet.condition?.toLowerCase();

  if (!condition) {
    return target === undefined ? null : actual === target;
  }

  switch (condition) {
    case 'odd':
    case 'even':
      return evaluateParity(actual, condition);
    case 'over':
    case 'higher':
    case 'above':
    case 'yes':
      return target === undefined ? null : actual >= target;
    case 'under':
    case 'lower':
    case 'below':
    case 'no':
      return target === undefined ? null : actual <= target;
    case 'exact':
    case 'runs_only':
      return target === undefined ? null : actual === target;
    default:
      return target === undefined ? null : actual === target;
  }
}

function evaluateParity(value: number, condition?: string): EvaluationResult {
  if (!condition) return null;
  const normalized = condition.toLowerCase();
  if (normalized === 'odd') {
    return Math.abs(value) % 2 === 1;
  }
  if (normalized === 'even') {
    return Math.abs(value) % 2 === 0;
  }
  return null;
}

function scoreAt(
  deliveries: Delivery[],
  over: number,
  ball: number,
  team?: string,
): number | undefined {
  const filtered = filterByTeam(deliveries, team);
  const targetBall = ball;
  let latest: Delivery | undefined;
  for (const delivery of filtered) {
    if (comparePosition(delivery, over, targetBall) <= 0) {
      if (!latest || compareDeliveries(delivery, latest) > 0) {
        latest = delivery;
      }
    }
  }
  return latest?.total;
}

function findDelivery(
  deliveries: Delivery[],
  over: number,
  ball: number,
  team?: string,
): Delivery | undefined {
  const filtered = filterByTeam(deliveries, team);
  return filtered.find((delivery) => delivery.over === over && delivery.ball === ball);
}

function filterByTeam(deliveries: Delivery[], team?: string): Delivery[] {
  if (!team) return deliveries;
  const normalized = normalizeLabel(team);
  return deliveries.filter((delivery) => normalizeLabel(delivery.team) === normalized);
}

function isFutureDelivery(
  deliveries: Delivery[],
  over: number,
  ball: number,
  team?: string,
): boolean {
  const filtered = filterByTeam(deliveries, team);
  const latest = filtered[filtered.length - 1];
  if (!latest) return true;
  return comparePosition(latest, over, ball) < 0;
}

function comparePosition(delivery: Delivery, over: number, ball: number): number {
  if (delivery.over < over) return -1;
  if (delivery.over > over) return 1;
  const deliveryBall = delivery.ball ?? 0;
  if (deliveryBall < ball) return -1;
  if (deliveryBall > ball) return 1;
  return 0;
}

function compareDeliveries(a: Delivery, b: Delivery): number {
  if (a.over !== b.over) return a.over - b.over;
  return (a.ball ?? 0) - (b.ball ?? 0);
}

function countBoundariesBetween(
  deliveries: Delivery[],
  start: Delivery | undefined,
  end: Delivery,
): number {
  const fromOver = start?.over ?? -1;
  const fromBall = start?.ball ?? -1;
  let count = 0;
  for (const delivery of deliveries) {
    if (start && comparePosition(delivery, fromOver, fromBall) <= 0) continue;
    if (compareDeliveries(delivery, end) > 0) break;
    if (delivery.batsmanRuns === 4 || delivery.batsmanRuns === 6) {
      count += 1;
    }
  }
  return count;
}

function findPlayer(players: PlayerStats[], candidate?: string): PlayerStats | undefined {
  if (!candidate) return undefined;
  const needle = normalizeLabel(candidate);
  return players.find((player) => normalizeLabel(player.name) === needle);
}

function normalizeLabel(value?: string): string | undefined {
  return value?.replace(/\s+/g, ' ').trim().toUpperCase();
}
