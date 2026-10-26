# Handoff: MarinePrep HQ

Context for picking this work up later. Read this, then `README.md`. App-side context lives in
`../marineprep/revamp-notes/` (start with `00-PRIORITY-fix-first.md` and `HANDOFF.md` there).

## What HQ is

- Private company dashboard for MarinePrep. A separate Next.js 16 app (Cache Components on), live at
  https://marineprep-hq.vercel.app. Code: `Nautiminds-EdTech/marineprep-hq` (commit as `jayachandranmd`, remote
  host alias `git@mdjay`).
- Only `ADMIN_EMAILS` can sign in (CTO, CEO). The Flutter admin stays for content only.
- Vercel team `nautiminds-projects`, project `marineprep-hq`. Functions run in `bom1`. `vercel.json` must keep
  `framework: nextjs`; without it every path 404s. Env vars live in the Vercel project (production, sensitive).
- Data: the app's prod Supabase project (`cumvlrzfokzypalymeqd`). Every DB change goes through a migration in
  `../marineprep-rag-pipeline/supabase/migrations` with the Supabase CLI: staging (`xyqbkytwwxijazyriwdj`) first,
  then prod. Keep staging and prod in sync (migrations, secrets, edge functions). Prod writes may need to be run by the
  user from their own terminal.

## Pages and automations (all live)

- Overview (Supabase), Funnel (PostHog), Quality (Sentry), Fix queue, Connections.
- Sentry webhook → Telegram alert with a **Propose fix** button. Noise (OTP, network, cache fallbacks) is skipped.
- Fix flow: Propose fix → Claude Opus 5.5 drafts root cause, fix and test steps → Approve/Reject in HQ or Telegram
  (only `TELEGRAM_ADMIN_IDS`, currently the CTO only, by choice) → GitHub **issue** in
  `Nautiminds-EdTech/marineprep-user-app` → the user fixes it → closing the issue marks the proposal done.
  The user chose issues only, no automatic PRs.
- Daily cron 09:00 IST: saves yesterday's numbers to `hq_daily_snapshots`, posts the brief to Telegram once, then a
  drop alert when a metric falls well below its 7-day average (`src/lib/drops.ts`; silent until 7 days of history,
  i.e. from about 1 Nov 2026).
- Pushes to `main` deploy to production through Vercel's Git integration.
- HQ tables: `hq_fix_proposals`, `hq_alerts`, `hq_reviews`, `hq_daily_snapshots` (service-role only, RLS on, no grants).
- Messages to the Telegram bot record the sender in `hq_alerts` (kind `telegram_user`), since `getUpdates` no longer
  works with the webhook set.
- Claude runs only when someone proposes a fix. Key is scoped to the Anthropic workspace "MarinePrep", which has a
  $20/month limit and a $10 email alert.

## Data facts worth remembering

- PostHog: `Application Installed` sits on an anonymous ID the app never merges at login, so the funnel starts at
  `otp_requested`. No `source` on `upgrade_page_viewed`. iOS barely appears in the funnel (app-side bug, see the
  priority file).
- Sentry: Flutter Dart errors don't count as crashes, so HQ leads with error-free sessions/users (`session.status`).
  Most open-issue volume is noise from the app's `AppLogger`.
- Revenue: Sandbox Apple payments are excluded everywhere; only INR is summed; Apple amounts are gross.
- Apple IAP server fix (verify-apple-transaction v12 + notifications-v2) is deployed to staging and prod.

## Next

1. Reviews page is built (`src/lib/{reviews,play,appstore}.ts`, `/reviews`, collected in the daily cron, 1–2★ alerts,
   Claude themes). Google Play is keyless (see README); App Store waits for the user's Team key (Customer Support).
2. Later: Instagram pipeline. The user does the mobile priority fixes and UI revamp separately.
