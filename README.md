# betting

Cricket bet verification engine that parses raw market names, normalizes Roanuz match data, and evaluates every bet against live data.

## Setup

```bash
bun install
```

## Required environment

Set the following variables before running the pipeline:

- `ROANUZ_PROJECT_KEY` – Roanuz project identifier.
- `ROANUZ_MATCH_KEY` – Match key for the fixture you want to verify.
- `ROANUZ_TOKEN` **or** `ROANUZ_API_KEY` – Provide a session token directly or let the fetcher mint one via the API key.
- `BETS_FILE` (optional) – Path to the events JSON file. Defaults to `events.json` in the repo.

Example:

```bash
ROANUZ_PROJECT_KEY=RS_P_xxx \
ROANUZ_MATCH_KEY=a-rz--cricket--xxxx \
ROANUZ_API_KEY=RS5:secret \
bun run index.ts
```

## What happens

1. `index.ts` loads raw markets from `events.json` (or `BETS_FILE`).
2. `parser.ts` converts each market name into the unified `Bet` schema using regex-driven rules.
3. `fetcher.ts` retrieves ball-by-ball data plus paginated over summaries from the Roanuz v5 API, stopping as soon as the deepest required over is fetched.
4. `adapter.ts` normalizes the API payloads into `MatchData` (score, deliveries, player stats).
5. `evaluator.ts` checks every bet (ball, over, session, player, wicket, match, partnership, special) returning `true`, `false`, or `null` (pending).
6. The final report prints a concise line per bet, indicating the evaluation outcome.

## File overview

- `parser.ts` – Extensible regex parser for cricket bet names.
- `adapter.ts` – Shapes Roanuz responses into the internal `MatchData` format.
- `fetcher.ts` – Handles authentication, pagination, and data retrieval.
- `evaluator.ts` – Contains the bet evaluation engine.
- `index.ts` – Orchestrates the full pipeline end-to-end.

Run `bun run index.ts` anytime to rebuild evaluations against the latest match state.
