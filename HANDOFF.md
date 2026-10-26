# Handoff: MarinePrep HQ

Context for picking this work up in a new conversation. Read this, then `README.md`. App-side context lives in
`../marineprep/revamp-notes/` (start with `00-PRIORITY-fix-first.md` and `HANDOFF.md` there).

Last updated: 26 Oct 2026.

## Open items that need the user

| # | What | Where | Why it matters |
|---|---|---|---|
| 1 | Confirm the Play service account has the **account-level** permission "View app information and download bulk reports (read only)" saved | Play Console → Manage account → Users and permissions → `marineprep@nautiminds.iam.gserviceaccount.com` → Account permissions | Without it HQ can't import Play review history (runs report `history: Play reports 403`). Google can take up to 24 h to apply it after saving. |
| 2 | Reply to the only App Store review (1★, 27 Sep 2026, tagged `bugs_crashes`) | App Store Connect → Ratings and Reviews (or wait for HQ review replies, below) | Unanswered low reviews hurt the rating. |
| 3 | Give the CEO their HQ password | Supabase Auth user `ceo@nautiminds.com` (exists, confirmed) | HQ uses email + password; the CEO can't sign in without it. |
| 4 | TestFlight sandbox purchase on iOS | TestFlight build → buy a plan | End-to-end test of the new Apple payment flow (should land in `payments` as `Sandbox`, excluded from HQ revenue). |
| 5 | Mobile app priority fixes | `../marineprep/revamp-notes/00-PRIORITY-fix-first.md` | The user does these before the UI revamp. GitHub issue #6 (question bank RangeError) came from HQ's Fix queue. |
| 6 | Decide what to build next in HQ | see "Next in HQ" | — |

Resolved on 26 Oct: the 11 Razorpay orders stuck at `created` were checked in the Razorpay dashboard. Nobody paid
without access; the only captured payments since 26 Jun 2026 are 2 counselling calls. So "no plan sale since 26 Jun"
is a conversion problem, not a payment bug. (The priority file's item 1 is therefore done; the conversion side lives in
`../marineprep/revamp-notes/mobile/05-conversion-and-paywall.md`.)

## Waiting on Google (no action, check next session)

- **Play review history import.** Bucket `pubsite_prod_7752937647078030555` is configured. Once storage access
  works, the next run (09:00 IST cron or "Refresh now" on /reviews) imports every monthly file once (marker:
  `hq_alerts` kind `play_history_import`), then re-reads the newest two months daily. Check with:
  `curl -s https://marineprep-hq.vercel.app/api/cron/daily -H "Authorization: Bearer $CRON_SECRET"` → `reviews.errors`
  should be empty and `reviews.fetched.google_play` > 0. Rerunning the cron is safe (brief and alerts are once per day).
- **Drop alerts** start working once 7 days of snapshots exist (about 1 Nov 2026).

## Next in HQ (options, in recommended order)

1. **Reply to reviews from HQ:** Claude drafts a reply, approve in HQ or Telegram, HQ posts it (Play Developer API
   `reviews.reply`; App Store Connect `customerReviewResponses`). Both keys already allow replies.
2. **Counselling revenue in HQ:** counselling payments live in `counselling_bookings` (`payment_status = 'paid'`,
   `amount` in paise; 2 paid at ₹199 on 29–30 Jul, 6 pending), not in `payments`, so Overview revenue and the daily
   brief miss them. Add them as a separate revenue line.
3. **Store installs on the Funnel page:** Play installs from the same bucket (`stats/installs/`); App Store downloads
   need a second key with the **Sales** role plus the vendor number. Replaces PostHog's unreliable install count.
4. **Weekly Claude analyst brief:** Monday Telegram message across funnel, quality, reviews and revenue with 2–3
   suggestions (~$0.10/week, inside the $20/month Anthropic workspace limit).
5. **Instagram pipeline:** deferred until the dashboard was done.

## What HQ is

- Private company dashboard for MarinePrep. A separate Next.js 16 app (Cache Components on), live at
  https://marineprep-hq.vercel.app. Code: `Nautiminds-EdTech/marineprep-hq`. Commit as `jayachandranmd
  <jayachandranmd.contact@gmail.com>` via the `git@mdjay` SSH alias, with **no** AI attribution in commits.
- Only `ADMIN_EMAILS` can sign in (CTO, CEO). The Flutter admin stays for content only.
- Vercel team `nautiminds-projects`, project `marineprep-hq`. Pushes to `main` deploy to production. Functions run
  in `bom1`. `vercel.json` must keep `framework: nextjs`; without it every path 404s. Env vars live in the Vercel
  project (production, sensitive); after changing one, redeploy. Vercel CLI can't parse the `mdjay` remote, so use the
  dashboard for Git settings.
- Data: the app's prod Supabase project (`cumvlrzfokzypalymeqd`). Every DB change goes through a migration in
  `../marineprep-rag-pipeline/supabase/migrations` with the Supabase CLI: staging (`xyqbkytwwxijazyriwdj`) first,
  then prod. Keep staging and prod in sync (migrations, secrets, edge functions). Prod writes may need to be run by the
  user from their own terminal.

## Pages and automations (all live)

- Overview (Supabase), Funnel (PostHog), Quality (Sentry), Fix queue, Reviews, Connections.
- Sentry webhook → Telegram alert with a **Propose fix** button. Noise (OTP, network, cache fallbacks) is skipped.
- Fix flow: Propose fix → Claude Opus 5.5 drafts root cause, fix and test steps → Approve/Reject in HQ or Telegram
  (only `TELEGRAM_ADMIN_IDS`, currently the CTO only, by choice) → GitHub **issue** in
  `Nautiminds-EdTech/marineprep-user-app` → the user fixes it → closing the issue marks the proposal done.
  The user chose issues only, no automatic PRs.
- Reviews: Google Play (keyless, see below) and App Store (key `55GLRZ8TJN`, Customer Support role) into
  `hq_reviews`; Claude tags themes; new 1–2★ reviews (last 3 days) alert Telegram once.
- Daily cron 09:00 IST: collects reviews, saves yesterday's numbers to `hq_daily_snapshots`, posts the brief to
  Telegram once, then a drop alert when a metric falls well below its 7-day average (`src/lib/drops.ts`).
- HQ tables: `hq_fix_proposals`, `hq_alerts`, `hq_reviews`, `hq_daily_snapshots` (service-role only, RLS on, no grants).
- Messages to the Telegram bot record the sender in `hq_alerts` (kind `telegram_user`), since `getUpdates` no longer
  works with the webhook set.
- Claude runs only on Propose fix and review tagging. Key is scoped to the Anthropic workspace "MarinePrep", which has
  a $20/month limit and a $10 email alert.

## Google Play access (keyless)

The `nautiminds.com` Google Cloud organisation blocks service-account key files, and `tech@nautiminds.com` isn't an
organisation admin. So Vercel's OIDC token for this project's **production** deployment is exchanged through the
workload identity pool `vercel` (project `nautiminds`, number `309005205126`) for a token of
`marineprep@nautiminds.iam.gserviceaccount.com`. Only production can do this; locally the Reviews page shows saved
reviews only. Vercel → Settings → Security → OIDC federation (issuer mode Team) must stay on.

## Data facts worth remembering

- PostHog: `Application Installed` sits on an anonymous ID the app never merges at login, so the funnel starts at
  `otp_requested`. No `source` on `upgrade_page_viewed`. iOS barely appears in the funnel (app-side bug, see the
  priority file).
- Sentry: Flutter Dart errors don't count as crashes, so HQ leads with error-free sessions/users (`session.status`).
  Most open-issue volume is noise from the app's `AppLogger`.
- Revenue: Sandbox Apple payments are excluded everywhere; only INR is summed; Apple amounts are gross. Counselling
  revenue isn't included yet (see Next in HQ).
- Apple IAP server fix (verify-apple-transaction v12 + notifications-v2) is deployed to staging and prod.
