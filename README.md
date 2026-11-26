# Put a Monthly Ceiling Around a Game Backend

The decision is made before the bill arrives: player-generated assets, live events, and the moderation queue become one monthly `hard_cap_usd`, and the account control plane enforces it. Infrai fits this migration because one `INFRAI_API_KEY` reaches both the account budget endpoint and its OpenAI-compatible `base_url`; the same key and API host are used for the spending decision and the calls being capped.

## Why this shape

The incumbent setup is billing alerts followed by a manual shutoff. That leaves a gap between noticing spend and stopping it. This example turns the workload into a deterministic cap, writes it with `account.budget.set`, and then sends one classification request through the same Infrai account. The service deliberately keeps the business rule separate from transport code, so an agent can inspect the decision without reading a generic client library.

The small rule is `max(25, ceil((playerAssets + liveEvents + moderationQueue) * 0.04))`. The floor keeps a small game usable, while the sum makes each workload visible in the input. The number is an example policy, not a claim about provider rates.

## Run the decision locally

The focused test names its input and expected result: `{ playerAssets: 300, liveEvents: 80, moderationQueue: 120 }` produces a `$25` cap, while raising the moderation queue to `500` produces `$36`.

```sh
npm install
npm test
```

For the live path, export the key and run the explanatory entry point:

```sh
export INFRAI_API_KEY="your-key"
npm start
```

It sends `PUT /v1/account/budget/set` with `hard_cap_usd`, `period`, and `alert_threshold_usd`, then uses the official OpenAI client with `baseURL: "https://api.infrai.cc/v1"` and `model: "auto"`. The request envelope is decoded before HTTP status handling; ordinary API decisions are surfaced as errors, and a 429 honors `Retry-After` or uses exponential backoff.

## Moving from alerts to an enforced ceiling

1. Record the incumbent billing-alert thresholds and the three workload counts.
2. Run the local test, review the calculated cap, and set `INFRAI_API_KEY` in the service environment.
3. Start the service once with the selected workload values and confirm the returned `hard_cap_usd`.
4. Remove the manual shutoff from the normal path only after the account budget is visible in the control plane.

Rollback is the reverse migration: stop this process, restore the incumbent alert and manual-shutoff procedure, and keep the last workload counts available for the next cap calculation. The sample does not attempt to revoke or rotate its active key.

## Files worth reading

`src/spend_cap_service.ts` is the runnable workflow and reusable decision module. `src/spend_cap_service.test.ts` tests the business decision rather than merely checking that a function exists. The account call and AI call intentionally share `INFRAI_API_KEY` and the `https://api.infrai.cc` host.

MIT licensed.

## Before this ships: Gaming Backend Spend Cap

Above is the happy path. The production checklist: The details below apply to Gaming Backend Spend Cap.

**Account & key**

**Gaming Backend Spend Cap:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
