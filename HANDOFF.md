# Handoff: MarinePrep HQ

Context for picking this work up in a new conversation. Read this, then `README.md`. App-side context lives in
`../marineprep/revamp-notes/` (start with `00-PRIORITY-fix-first.md` and `HANDOFF.md` there).

Last updated: 27 Oct 2026.

## Open items that need the user

| # | What | Where | Why it matters |
|---|---|---|---|
| 1 | Confirm the Play service account has the **account-level** permission "View app information and download bulk reports (read only)" saved | Play Console → Manage account → Users and permissions → `marineprep@nautiminds.iam.gserviceaccount.com` → Account permissions | Without it HQ can't import Play review history (runs report `history: Play reports 403`). Google can take up to 24 h to apply it after saving. |
| 2 | Reply to the only App Store review (1★, 27 Sep 2026, tagged `bugs_crashes`) | App Store Connect → Ratings and Reviews (or wait for HQ review replies, below) | Unanswered low reviews hurt the rating. |
| 3 | Give the CEO their HQ password | Supabase Auth user `ceo@nautiminds.com` (exists, confirmed) | HQ uses email + password; the CEO can't sign in without it. |
| 4 | TestFlight sandbox purchase on iOS | TestFlight build → buy a plan | End-to-end test of the new Apple payment flow (should land in `payments` as `Sandbox`, excluded from HQ revenue). |
| 5 | Mobile app priority fixes | `../marineprep/revamp-notes/00-PRIORITY-fix-first.md` | The user does these before the UI revamp. GitHub issue #6 (question bank RangeError) came from HQ's Fix queue. |
| 6 | Decide what to build next in HQ | see "Next in HQ" | — |
| 7 | Look over the redesigned HQ on your phone, signed in | https://marineprep-hq.vercel.app | Only the sign-in page was checked live; signed-in pages were checked locally against prod data. |

Resolved on 26 Oct: the 11 Razorpay orders stuck at `created` were checked in the Razorpay dashboard. Nobody paid
without access; the only captured payments since 26 Jun 2026 are 2 counselling calls. So "no plan sale since 26 Jun"
is a conversion problem, not a payment bug. (The priority file's item 1 is therefore done; the conversion side lives in
`../marineprep/revamp-notes/mobile/05-conversion-and-paywall.md`.)

## Done on 26–27 Oct: UI redesign (commit 818631f, live)

The whole HQ was redesigned; every feature from before is kept. Checked at phone (390px) and desktop widths in
light and dark, with no sideways scroll; `next build`, `tsc` and `eslint` pass.

- **Brand:** tokens in `src/app/globals.css` follow `../marineprep_design_system.md` (Deep Ocean `--hull` for
  navigation, Ocean Blue / Light Aqua accent, foam-tinted neutrals, good/warning/critical with `-soft` fills, `--star`).
  Fonts: Outfit (headings, figures: `font-display`, `.display-num`) and Plus Jakarta Sans (text), via `next/font`.
  Dark mode follows the system and also honours `data-theme` on `<html>`.
- **Layout (`src/app/(hq)/layout.tsx`):** desktop sidebar with grouped nav; on phones a sticky top bar with an account
  menu (Connections, Sign out) and a bottom tab bar (`TabBar` in `src/components/nav.tsx`). Both show counters from
  `getAttention()` (`src/lib/attention.ts`): fix proposals waiting for approval and ≤3★ reviews from the last 30 days
  without a reply. Safe-area insets are handled for notched phones.
- **Shared components (`src/components/`):** `PageHeader`/`Section`, `StatTile` (icon, delta chip, sparkline, tone,
  link), `TrendChart` (client; bars or line, hover and arrow-key readout, screen-reader table), `Sparkline`, `Meter`,
  `AttentionList` (signals with icon + label), `Notice`, `PageSkeleton`, `SubmitButton` (pending state), `Menu`.
  Charts follow the dataviz rules: one accent color per series, ≤24px bars, hairline grid, no dual axes.
- **Pages:**
  - Overview: "Needs your attention" signals computed from the page's own numbers (no AI): fixes waiting, unanswered
    low reviews, days since the last plan sale, week-over-week signups, best day. Tiles with 14-day trends; 30-day
    signups chart; sales block with last plan sale; IMUCET countdown with season progress; activity timeline.
  - Funnel: summary tiles (OTP, billing, paid, installs); funnel tracks with the biggest drop flagged; "What stands
    out" (biggest drop, billing without payment, platforms whose installs don't reach sign-in, e.g. iOS 23 → 1).
  - Quality: error-free sessions headline with verdict, meter and a daily line (new `dailyErrorFreeSessions` from
    Sentry's `session.status` series); severity-marked issue rows; noise as a share of events.
  - Fix queue: status counts at the top, severity strip per card; drafts stay open while a decision is pending and
    collapse once decided.
  - Reviews: per-store averages with stars, 5★→1★ breakdown (`reviewStats().distribution`), themes split into 1–2★
    and 3–5★, scrollable filter pills, spinner on "Refresh now".
  - Connections: "N of M connected" summary. Login: branded split screen (stacked on phones).
- **Data additions:** `getOverview()` now returns `series` (30 IST days of signups, purchases, revenue, mocks; reads
  `created_at` a page at a time past PostgREST's 1,000-row cap), `signups.prev7`, `lastPurchaseAt`, `seasonProgress`.
  Time helpers in `src/lib/time.ts`: `istDay`, `lastIstDays`, `formatDay`, `formatTodayIST`, `timeAgo`.
- **Fix:** `requireAdmin()` now awaits `connection()`. Every admin page logged "Next.js encountered the unstable value
  `Date.now()` while prerendering" (runtime prefetch rendered past the cookie check); that's gone.
- **New dependency:** `lucide-react` pinned to `1.53.0` (icons).
- **Checking pages locally while signed in:** HQ needs a login, so screenshots were taken with a throwaway Playwright
  script: the service key creates a one-time magic-link token for an admin email (`auth.admin.generateLink`),
  `@supabase/ssr` verifies it into session cookies, and headless Chrome loads `localhost:3000` with them. It changes
  no password and wasn't committed; rebuild it in the scratchpad if needed.

## Waiting on Google (no action, check next session)

- **Play review history import.** Bucket `pubsite_prod_7752937647078030555` is configured. Once storage access
  works, the next run (09:00 IST cron or "Refresh now" on /reviews) imports every monthly file once (marker:
  `hq_alerts` kind `play_history_import`), then re-reads the newest two months daily. Check with:
  `curl -s https://marineprep-hq.vercel.app/api/cron/daily -H "Authorization: Bearer $CRON_SECRET"` → `reviews.errors`
  should be empty and `reviews.fetched.google_play` > 0. Rerunning the cron is safe (brief and alerts are once per day).
- **Drop alerts** start working once 7 days of snapshots exist (about 1 Nov 2026).

## Next in HQ (planned, in recommended order)

Build each with the new components and tokens above, so new pages match the redesign (check phone width too).

1. **Reply to reviews from HQ:** Claude drafts a reply, approve in HQ or Telegram, HQ posts it (Play Developer API
   `reviews.reply`; App Store Connect `customerReviewResponses`). Both keys already allow replies. UI: a "Draft
   reply" button on unanswered review cards, the draft shown in an editable box with Approve/Discard, the same
   pattern as the Fix queue. The Reviews nav counter then clears as replies go out.
2. **Counselling revenue in HQ:** counselling payments live in `counselling_bookings` (`payment_status = 'paid'`,
   `amount` in paise; 2 paid at ₹199 on 29–30 Jul, 6 pending), not in `payments`, so Overview revenue and the daily
   brief miss them. Add them as a separate revenue line (a "Counselling" figure in the Overview's Sales block and the
   daily brief), plus a counselling signal when bookings sit in `pending`.
3. **Store installs on the Funnel page:** Play installs from the same bucket (`stats/installs/`); App Store downloads
   need a second key with the **Sales** role plus the vendor number. Replaces PostHog's unreliable install count
   on the Funnel page's Installs tile, and could feed an installs trend on the Overview.
4. **Weekly Claude analyst brief:** Monday Telegram message across funnel, quality, reviews and revenue with 2–3
   suggestions (~$0.10/week, inside the $20/month Anthropic workspace limit).
5. **Instagram pipeline:** deferred until the dashboard was done (it now is).

Small follow-ups seen during the redesign (optional):
- Overview's "Revenue, 30 days" tile has no trend line while revenue is ₹0; it fills in once sales happen.
- A light/dark switch in the account menu (the CSS already supports `data-theme`).
- Overview's `series` re-reads 30 days of rows on every 30-second refresh; fine at today's ~370 signups/month, but
  move it to `hq_daily_snapshots` (already saved daily) if volume grows a lot.

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

- Overview (Supabase), Funnel (PostHog), Quality (Sentry), Fix queue, Reviews, Connections (see the redesign section
  for what each shows).
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
