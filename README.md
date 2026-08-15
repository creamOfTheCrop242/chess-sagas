# Chess Sagas

Paste a PGN, parse it through a NestJS API, step through the game on an Angular chessboard, and read an OpenAI-generated fantasy saga for each move (Light Kingdom vs Dark Kingdom after the Calamity).

## Prerequisites

- Node.js 20+ (tested with 22)
- npm
- An OpenAI API key

## Configure OpenAI

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and set:

```
OPENAI_API_KEY=sk-...
```

### Google sign-in

Create a Google OAuth client with application type **Web application**. For
local development, configure:

- Authorized JavaScript origin: `http://localhost:4200`
- Authorized redirect URI: `http://localhost:3000/auth/google/callback`

For production, configure:

- Authorized JavaScript origin: `https://chesssagas.com`
- Authorized redirect URI: `https://chesssagas.com/api/auth/google/callback`

Set these backend environment variables (Heroku config vars in production):

```bash
GOOGLE_CLIENT_ID=your-google-web-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
PUBLIC_APP_URL=http://localhost:4200
```

Production uses `https://chesssagas.com/api/auth/google/callback` for
`GOOGLE_CALLBACK_URL` and `https://chesssagas.com` for `PUBLIC_APP_URL`.
Never place `GOOGLE_CLIENT_SECRET` in the frontend or commit it to Git.

### Contact and support email

The public `/contact` page sends bug reports, suggestions, billing questions,
and general support requests through SMTP2GO. Configure these backend values:

```text
SMTP2GO_HOST=mail.smtp2go.com
SMTP2GO_PORT=2525
SMTP2GO_USER=creamofthecrop.tech
SMTP2GO_PASSWORD=YOUR_SMTP2GO_PASSWORD
MAIL_FROM=support@creamofthecrop.tech
CONTACT_TO=don@creamofthecrop.tech
```

`SMTP2GO_PASSWORD` is secret and belongs only in the local backend `.env` and
the Heroku Config Vars. The endpoint validates and limits submissions, uses a
honeypot field for simple bots, and permits at most five accepted attempts per
IP address per hour. The sender's address is used only as the email `Reply-To`.

### Stripe billing (Phase 2)

The backend can create hosted Stripe Checkout sessions for individual saga
credits and monthly plans, open Stripe's customer portal, and fulfill paid
credits from signed webhooks. Add these backend environment variables:

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_SINGLE_SAGA=price_...
STRIPE_PRICE_FIVE_SAGAS=price_...
STRIPE_PRICE_SCRIBE=price_...
STRIPE_PRICE_CHRONICLER=price_...
STRIPE_PRICE_REALM_FOUNDER=price_...
```

The monthly plans grant 4, 9, and 20 saga credits respectively. Product and
price IDs are selected on the server; the browser cannot submit an arbitrary
Stripe price. If Stripe variables are absent, billing endpoints report that
billing is unavailable while existing saga generation continues to work.

For local webhook testing, install the Stripe CLI and run:

```bash
stripe listen --forward-to localhost:3000/billing/webhook
```

Copy the resulting `whsec_...` value into `backend/.env`. In Stripe's
production webhook configuration, send these events to
`https://chesssagas.com/api/billing/webhook`:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `invoice.paid`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `charge.refunded`

Credit fulfillment is idempotent: repeated Stripe event delivery cannot grant
the same checkout or invoice twice. Phase 2 records purchases and balances but
does not yet require a credit to generate a saga; generation enforcement is a
separate Phase 3 change.

### Credit enforcement rollout

Phase 3A provides atomic reservation, consumption, release, and stale-cleanup
operations without changing the generation pipeline. Keep enforcement disabled
until the later generation and purchase-interface phases have been verified:

```text
CREDIT_ENFORCEMENT_ENABLED=false
UNLIMITED_CREDIT_EMAILS=dhudson0242@gmail.com
CREDIT_RESERVATION_STALE_MINUTES=30
```

`UNLIMITED_CREDIT_EMAILS` accepts a comma-separated list and is matched only
against normalized, authenticated account emails. Unlimited accounts are
reported explicitly and do not create or consume credit reservations. The
stale cleanup only releases reservations belonging to terminal generation jobs
or reservations whose job no longer exists; recoverable running jobs retain
their credit.

Phase 3B connects those operations to saga generation. With enforcement still
disabled, generation remains open and uncharged while every new job records a
shadow decision: anonymous, unlimited, credit available, or credit
insufficient. This lets production traffic validate the rules before they can
block a user. When enforcement is enabled, a signed-in account must reserve one
credit before a new job is queued; the credit is consumed only after the saga
has been persisted and is released after a terminal failure. Retrying the same
job reuses its reservation, and opening a game whose completed saga artifacts
already exist is marked as reused and never charged.

### Generation guardrails

New saga generation can be paused without affecting existing records, accounts,
or billing. Production also limits concurrent and rapid generation requests:

```text
SAGA_GENERATION_ENABLED=true
SAGA_GENERATION_ACCOUNT_HOURLY_LIMIT=5
SAGA_GENERATION_IP_HOURLY_LIMIT=20
```

Each account may have only one queued or running saga at a time. The hourly
limits count newly created jobs, not completed-saga reuse or retries of the same
failed job. IP addresses are stored only as one-way hashes on generation jobs.

### Production health monitoring

`GET /health` is a public, non-cached readiness check for the API and Postgres.
It returns HTTP `200` only when both are reachable, and HTTP `503` when the
database is unavailable. Failure responses intentionally omit exception text,
hostnames, credentials, and other internal details.

Configure an external uptime monitor to request this production URL every five
minutes and alert by email after two consecutive failures:

```text
https://chesssagas.com/api/health
```

Also configure recovery notifications so an alert is sent when service returns.
The monitor should expect HTTP `200` and may optionally verify that the JSON
response contains `"status":"ok"`.

### Sign in with Apple

Sign in with Apple for websites requires an Apple Developer Program account, a
primary App ID with Sign in with Apple enabled, a Services ID, and a Sign in
with Apple private key. Configure the Services ID with:

- Domain: `chesssagas.com`
- Return URL: `https://chesssagas.com/api/auth/apple/callback`

Set these backend environment variables:

```bash
APPLE_CLIENT_ID=com.yourcompany.chesssagas.web
APPLE_TEAM_ID=your-apple-team-id
APPLE_KEY_ID=your-sign-in-with-apple-key-id
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
APPLE_CALLBACK_URL=https://chesssagas.com/api/auth/apple/callback
```

`APPLE_CLIENT_ID` is the Services ID, not the primary App ID. The private key
is the contents of the `.p8` file downloaded from Apple. Heroku accepts it as a
multiline value or with newlines represented as `\n`. Apple web return URLs
must use HTTPS, so test this flow on the production domain or an HTTPS test
domain registered in the Services ID.

Never commit `.env`. Restart the backend after changing it.

## Run locally

### 1. Backend (NestJS)

```bash
cd backend
npm install
npm run start:dev
```

API listens on [http://localhost:3000](http://localhost:3000).

### 2. Frontend (Angular)

```bash
cd frontend
npm install
npm start
```

App opens at [http://localhost:4200](http://localhost:4200).

## Monitor AI calls and generation failures

The backend records every OpenAI provider invocation after this logging feature
is started. Records are written as JSON Lines files under:

```text
backend/logs/openai-calls-YYYY-MM-DD.jsonl
```

The `backend/logs` directory is ignored by Git. Restart the backend after
pulling this feature unless it is already running in watch mode.

After using the application, generate a report from the backend directory:

```bash
cd backend
npm run report:ai-calls -- --hours=24
```

Change `24` to report a different rolling window:

```bash
npm run report:ai-calls -- --hours=8
npm run report:ai-calls -- --hours=48
```

The report includes:

- OpenAI calls grouped by stage and model
- Successful and failed call counts and failure rates
- Average call duration
- Serialized request payload size by stage
- Input, output, cached-input, and cache-write token totals
- Estimated API cost at the configured GPT-5.6 standard rates
- Retry-call counts, including targeted repair calls
- OpenAI calls, model time, payload size, and cost grouped by saga
- Individual OpenAI error messages
- Completed and failed pipeline stages from the configured database
- First-pass completions, retry recoveries, and exhausted stages
- End-to-end pipeline duration and cost per completed saga
- Semantic and deterministic validation errors rejected after an OpenAI call

The two failure sections measure different things. **OpenAI call failures**
cover request errors and malformed structured responses. **Pipeline failures**
also include responses that parsed successfully but violated Chess Sagas'
chess, chronology, or narrative validation rules.

Logging begins with the first OpenAI call made after the updated backend starts;
the command does not reconstruct earlier provider calls from old console
output. The pipeline section can still include older database records within
the requested time window.

Game-level call, retry, payload, and cost columns require logs written by the
current telemetry version. Older JSONL entries remain readable, but fields
that were not recorded at the time appear as zero or `unknown`.

To reduce upload and model-processing overhead without shortening the story,
the backend sends a compact game ledger to each AI stage. Every move, piece
identity, capture, wound requirement, and narrative constraint is preserved.
Repeated board-position snapshots are omitted from quiet moves and retained
for captures, checks, checkmates, castling, promotions, and the final position.
Use the report's payload-size columns to compare this reduction across stages.

An optional guarded trial can remove the remaining intermediate capture and
check snapshots because their exact mover, squares, capture attribution,
tactical context, and check facts are already present in the same ledger
events. Checkmate geometry plus final, castling, and promotion positions remain
intact. Enable it with `OPENAI_LOSSLESS_PAYLOAD_COMPACTION=true`. The serializer
verifies that every non-snapshot event fact remains byte-equivalent and falls
back to the existing payload automatically if that invariant fails.

During an active backend session, deterministic game preparation is also
reused across pipeline stages and retries. The normalized ledger, wound-event
selection, battlefield environment, and surrender classification are held in
a bounded 30-minute cache (up to 100 games). Concurrent requests for the same
game share one preparation operation, while generated AI artifacts continue to
be loaded from the database. Backend logs report each preparation as a cache
`hit` or `miss` with its duration, making this optimization directly visible.

The browser checks reusable pipeline work through one consolidated status
request instead of probing every stage separately. A newly generated full
story already contains deterministic validation and scene playback data, so
the browser does not request those stages again. Duplicate generation requests
for the same game share one frontend observable and one backend stage promise.
The active game ID is kept in session storage while work is running, allowing
the Chronicle page to restore the board and reattach after navigating to the
lore, guide, or Hall of Records pages. A page refresh resumes from completed
database stages rather than restarting the whole saga.

To store call logs somewhere else, set `AI_CALL_LOG_DIR` in `backend/.env`:

```text
AI_CALL_LOG_DIR=/absolute/path/to/chess-sagas-ai-logs
```

## Try it

1. Open the app
2. Paste a PGN into the text area
3. Click **Submit**
4. Read the Calamity intro at ply 0
5. Use **← Back** / **Forward →** (or Left/Right arrow keys) — each new ply loads a saga beat (cached; next ply is prefetched)

### Sample PGN

```
[Event "Casual Game"]
[Site "Local"]
[Date "2024.01.01"]
[Round "1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6
8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 13. Nc3 Bb7
14. Bg5 b4 15. Nb1 h6 16. Bh4 c5 17. dxe5 Nxe4 18. Bxe7 Qxe7 19. exd6 Qf6
20. Nbd2 Nxd6 21. Nc4 Nxc4 22. Bxc4 Nb6 23. Ne5 Rae8 24. Bxf7+ Rxf7
25. Nxf7 Rxe1+ 26. Qxe1 Kxf7 27. Qe3 Qg5 28. Qxg5 hxg5 29. b3 Ke6
30. a3 Kd6 31. axb4 cxb4 32. Ra5 Nd5 33. f3 Bc8 34. Kf2 Bf5 35. Ra7 g6
36. Ra6+ Kc5 37. Ke1 Nf4 38. g3 Nxh3 39. Kd2 Kb5 40. Rd6 Kc5 41. Ra6 Nf2
42. g4 Bd3 43. Re6 1-0
```

## API

### `POST /pgn/parse`

Request:

```json
{ "pgn": "[Event \"Demo\"]\\n\\n1. e4 e5 *" }
```

Response includes move metadata, dramatic flags, and fixed realms (`Light Kingdom` / `Dark Kingdom`).

### `POST /story/narrate`

Request includes the current ply’s move fields, `realms`, and optional `previousStories` for continuity.

Response:

```json
{ "ply": 1, "story": "..." }
```

Returns `503` if `OPENAI_API_KEY` is missing.

### Public sagas and profiles

The community API provides the backend foundation for the public Hall of
Records and creator pages:

- `GET /sagas?limit=20&cursor=...&q=...&creator=handle` lists public sagas.
- `GET /sagas/:id` returns one public saga with its PGN, ledger, story, and
  aligned scenes for replay.
- `GET /sagas/mine` lists the signed-in user's sagas, including non-public
  entries.
- `GET /sagas/saved` lists the signed-in user's bookmarked public sagas.
- `POST /sagas/:id/bookmark` and `DELETE /sagas/:id/bookmark` add or remove a
  saved saga.
- `GET /profiles/:handle` returns a public creator profile.
- `GET /profiles/:handle/sagas` lists that creator's attributed public sagas.
- `GET /profiles/me` creates or returns the signed-in user's profile.
- `PATCH /profiles/me` edits `handle`, `displayName`, `bio`, and
  `showCreatorCredit`.

List responses use cursor pagination and cap `limit` at 50. Public endpoints
never expose account IDs or email addresses. When a creator disables
`showCreatorCredit`, their identity is removed from saga responses and their
profile does not enumerate their sagas.

### Administrative reporting (Phase 1)

OpenAI usage is persisted to Postgres for every successful or failed model
call. The record includes stage, model, retry/repair type, duration, payload
size, token categories, error text, and estimated cost. Telemetry persistence
is best-effort and can never fail saga generation.

Grant access with a comma-separated allowlist of authenticated account emails:

```text
REPORTING_ADMIN_EMAILS=dhudson0242@gmail.com
```

The private endpoint `GET /admin/reports/overview` requires an authenticated
session whose normalized email is in that allowlist. It accepts either
`?days=30` (the default) or ISO `from` and `to` parameters, with a maximum
range of 366 days. The response aggregates:

- completed, failed, active, reused, and billed generation jobs
- first-pass, retry-recovered, and exhausted pipeline stages
- AI calls, failures, duration, tokens, retries, and estimated cost
- customer, unlimited-account, anonymous, and reused cost attribution
- credits granted, purchased, consumed, and refunded
- gross Stripe revenue, refunds, net revenue, and estimated customer margin
- grouped AI, pipeline, and terminal generation errors

Apply the accompanying Prisma migration before expecting AI calls to be
recorded. Existing JSONL logs are not imported automatically; reporting begins
with calls made after this migration and backend version are running.
