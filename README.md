# MarinePrep HQ

Private, live company dashboard for MarinePrep. Only the emails in `ADMIN_EMAILS` can sign in (CTO and CEO).
The Flutter admin at `marineprep.app/admin` stays the content tool; HQ is for numbers, quality and decisions.

Live at **https://marineprep-hq.vercel.app** (Vercel, team `nautiminds-projects`, project `marineprep-hq`).

## Deploy

Pushing to `main` on `Nautiminds-EdTech/marineprep-hq` deploys to production (Vercel Git integration).
Manual deploy if needed: `vercel --scope nautiminds-projects deploy --prod --yes`.

Environment variables live in the Vercel project (production). After changing one there, redeploy.
`vercel.json` pins functions to `bom1` (Mumbai, next to Supabase), sets the framework and the daily cron.

## Run locally

```bash
cp .env.example .env.local   # then fill in values
npm install
npm run dev                  # http://localhost:3000
```

Sign in with the same Supabase email + password as the Flutter admin.

## How access works

1. `src/proxy.ts` refreshes the Supabase session and redirects signed-out visitors to `/login` (optimistic).
2. `requireAdmin()` in `src/lib/auth.ts` verifies the JWT and the `ADMIN_EMAILS` allowlist on every data read (authoritative).
3. Database RLS still applies when HQ queries with your login. Cross-user tables without admin policies
   (e.g. `practice_test_sessions`) need `SUPABASE_SERVICE_ROLE_KEY`, used server-side only after `requireAdmin()`.

## What's live

| Page | Source | Freshness |
|---|---|---|
| Overview | Supabase (users, payments, subscriptions, mock sessions, AI messages) | Re-queried every 30 s |
| Funnel | PostHog: ordered funnel install → billing (30 days, by platform), feature reach (7 days); payers from Supabase | Cached a few minutes |
| Quality | Sentry: crash-free sessions/users (7 days), open issues split into crashes, errors and expected noise | Cached a few minutes |
| Reviews | `hq_reviews`: Google Play (last 7 days via API, kept forever here) + App Store, Claude themes, reply status | Daily + "Refresh now" |
| Fix queue | `hq_fix_proposals`: proposals from Sentry issues, Claude's root cause + fix, approve/reject, GitHub issue | Every 20 s |
| Connections | Which integrations have keys set (never shows values) | Per request |

## Automations

| Endpoint | Trigger | Does |
|---|---|---|
| `/api/webhooks/sentry` | Sentry internal integration, `issue.created` (HMAC-verified with `SENTRY_WEBHOOK_SECRET`) | Skips expected noise, alerts Telegram once per issue with a **Propose fix** button |
| `/api/webhooks/telegram` | Telegram bot webhook (`TELEGRAM_WEBHOOK_SECRET` header) | **Propose fix / Approve / Reject** buttons; only `TELEGRAM_ADMIN_IDS` can press them |
| `/api/cron/daily` | Vercel Cron 09:00 IST (`CRON_SECRET`) | Saves yesterday's numbers to `hq_daily_snapshots`, posts the brief to Telegram once, then a drop alert if needed |

Drop alerts (`src/lib/drops.ts`) compare yesterday with the 7 days before and stay silent until 7 days of history
exist. Signups, mocks started and AI messages alert below half their average (only when the average is at least 5
a day); error-free users alert on a fall of 3 points or more. One message per day.

Fix flow: Sentry issue → **Propose fix** (Quality page or Telegram) → Claude drafts root cause, fix and test steps
(`ANTHROPIC_API_KEY`, optional) → **Approve** in HQ or Telegram → GitHub issue in `GITHUB_REPO` → you fix it →
closing the issue marks the proposal done.

## Google Play without a key file

The organisation blocks service-account key files, so HQ signs in keylessly: Vercel's OIDC token for this
project's **production** deployment is exchanged (Google workload identity pool `vercel`, project `nautiminds`,
number `309005205126`) for a short-lived token of `marineprep@nautiminds.iam.gserviceaccount.com`, which is invited
in Play Console. This only works on Vercel production, so locally the Reviews page shows saved Google Play reviews
only. Vercel → Settings → Security → OIDC federation must stay on (issuer mode: Team).

## Database

HQ's tables live in the app's Supabase project, created by
`marineprep-rag-pipeline/supabase/migrations/20261027090000_create_hq_tables.sql`: `hq_fix_proposals`, `hq_alerts`,
`hq_reviews`, `hq_daily_snapshots`. RLS is on with no policies and `anon`/`authenticated` have no grants, so only
the service-role key (HQ's server) can touch them.

## Known data gaps

- **Apple revenue is gross.** App Store amounts are what the customer paid, before Apple's commission.
  Only INR amounts are summed; Sandbox (App Review / TestFlight) purchases are excluded everywhere.
- **Apple payments before 26 Oct 2026 were backfilled** from Apple's records by migration
  `20261026120000_fix_apple_payments_and_backfill.sql` in `marineprep-rag-pipeline`. Their `created_at` is the
  subscription's creation time; `purchase_date` is Apple's.

- **The funnel stops at "Opened billing".** The app sends no purchase event to PostHog, so payers come from Supabase
  and aren't linked to the funnel. `upgrade_page_viewed` has no `source` property, so paywall-by-source isn't
  possible yet. Both are app changes for the UI revamp.

## Next

- `ops` schema + collectors: Sentry (webhook), PostHog, Google Play, App Store Connect → Supabase tables.
- Store installs and sales (Play reports bucket, App Store Sales role) next to the PostHog funnel.
