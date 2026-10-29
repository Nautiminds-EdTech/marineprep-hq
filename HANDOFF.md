# Handoff: MarinePrep HQ

Context for picking this work up in a new conversation. Read this, then `README.md`. App-side context lives in
`../marineprep/revamp-notes/` (start with `00-PRIORITY-fix-first.md` and `HANDOFF.md` there).

Last updated: 29 Oct 2026.

**Status (29 Oct): the SEO section is PAUSED until the user rebuilds the marineprep.app landing site.** Steps 1–4 are
done and **deployed on 29 Oct** (commits `f74d885`, `422b9fd` pushed to `main` at the user's request).
When the user comes back to it, resume at step 5 of "Build order". Every decision below is
already made, so don't ask about it again. Ask only where a step says to. The landing side of the work is in
`../marineprep-landing-page/SEO-BLOG-HQ-CONTRACT.md` (updated 29 Oct); check what the rebuild actually shipped
(redirects, deploy workflow, `/api/webhooks/site-deployed` caller) before step 6.

## Current work: SEO section (started 29 Oct 2026)

### Goal (the user's words, condensed)
A new SEO section in HQ that:
- plans blog topics automatically from research;
- drafts each post with its header image and saves it as a draft;
- sends a Telegram message with the important content and two buttons: **Approve** (makes the post live) and
  **View in HQ** (opens the post in HQ).

HQ also gets the blog editor and every blog feature of the old app `../seo-scribe-one-main`, with better UI and
behaviour and matching HQ's design. Posts must read naturally, not like AI. HQ also covers the other SEO work listed
under step 7 below.

### Decisions already made (don't re-ask)
1. **Cadence:** 3 new posts a week. Refreshes of old posts are extra. Revisit after 6–8 weeks of Search Console data;
   possibly 4 a week in Jan–Apr. Don't publish more for its own sake (Google's scaled-content-abuse policy).
2. **Landing hosting:** stays on Hostinger.
   - The revamp moves the site to a Next.js 16 static export.
   - A GitHub Action in `marineprep-landing-page` rebuilds and deploys when HQ publishes; HQ sends a
     `repository_dispatch` with event type `blog-changed`.
   - No second Vercel account: Hobby is non-commercial only and can't deploy private organization repos.
3. **Header images:** made in code inside HQ (`next/og` `ImageResponse`), with no image AI and no Gemini.
   - Size: 1200×630 PNG in Storage bucket `blog-images`, used as both the hero and `og:image`.
   - One house style in the spirit of the "cadet's nautical chart" landing revamp:
     - Deep Ocean background;
     - chart grid lines, with contour lines seeded from the slug so every image is unique;
     - one marine doodle from a fixed set;
     - a short Outfit headline, a category tag and an "IMU CET 2027" label.
   - Claude picks only the headline words, category and doodle.
   - **Show the user 2–3 sample renders and let them pick before wiring it in.**
   - Header images only, no inline images. Tables are written as HTML.
4. **No author shown.** In JSON-LD, `author` is the Organization (`https://marineprep.app/#org`). Credibility comes
   from inline sources (imu.edu.in, DG Shipping) and a "Last updated" date.
5. **Spending cap:** run the pipeline end to end for one post, report its real cost, then let the user set the
   monthly cap. Per-stage hard limits are always on.
6. **Anthropic key:** use the existing key (workspace "MarinePrep", $20/month limit) for the first run.
7. **Skills installed on the user's machine:**
   - `claude-seo` v2.5.0: `/seo …`, 26 skills plus extensions and 19 agents in `~/.claude`.
   - `claude-blog`: `/blog …`, 31 skills and 5 agents, installed by the user.
   - These run only in Claude Code; HQ on Vercel can't run them. HQ instead puts their methods into its own prompts
     (both MIT): the brief template, quality and E-E-A-T rubric, AI-search rules and the AI-phrase list
     (`~/.claude/skills/seo/scripts/content_humanize.py`).
8. **DB changes only as migrations** in `../marineprep-rag-pipeline/supabase/migrations`, through the Supabase CLI,
   staging first, then prod. **Never through the Supabase MCP.** The user said this explicitly for the `blogs` fix.

### What we know (verified 29 Oct)
- **SEO audit:** `SEO-AUDIT-2026-10-29.md` (untracked, in this repo and in `../marineprep-landing-page`), health
  37/100. Root cause: marineprep.app is a client-rendered SPA, so every URL returns the same HTML shell with the
  homepage title. That means:
  - AI crawlers see no post content;
  - missing pages return 200 (soft 404s);
  - there is no JSON-LD.
- **Landing contract:** written to `../marineprep-landing-page/SEO-BLOG-HQ-CONTRACT.md`. It is the agreement between
  HQ and the landing site:
  - which side does what;
  - the data contract;
  - deploy-dispatch payload `{"event_type":"blog-changed","client_payload":{"slugs":[…],"reason":"published"|"updated"|"unpublished"}}`;
  - callback `POST /api/webhooks/site-deployed` (Bearer `HQ_DEPLOY_WEBHOOK_SECRET`; body `{sha, run_id, slugs}`);
    after it HQ verifies the URLs, pings IndexNow and posts "Live" to Telegram.
  
  Keep HQ's side consistent with that file. The landing revamp hasn't started yet, so HQ must work without it: when
  `GITHUB_LANDING_DISPATCH_TOKEN` is unset, approving just publishes (the SPA shows the post right away) and skips
  the dispatch.
- **`blogs` table (prod):**
  - 14 posts, all `published`, Nov 2025–Feb 2026, all about the 2026 cycle.
  - Columns are in the baseline migration `20260410153455_init_baseline.sql` (around line 305).
  - `status` is constrained to `draft` | `published` | `archived`.
  - `slug` is already unique (`blogs_slug_key` in the baseline, besides the extra index `idx_blogs_slug`).
  - The trigger `update_blogs_updated_at`, combined with RPC `increment_view_count` (called on every page view),
    means **`updated_at` changes on every view**. So HQ adds `content_updated_at` for real modified dates.
- **Security hole (fixed 29 Oct, see build step 1; all 14 posts are owned by ceo@, who keeps access via "Admins manage
  blogs"):** policies "Authenticated can insert blogs" (`author_id = auth.uid()`), "Owner can
  update own blog" and "Owner can delete blogs" let **any signed-in user**, app students included, insert a row with
  status `published`, and it would appear on marineprep.app.
  - "Admins manage blogs" (FOR ALL, cto@ and ceo@) and "Public can view published blogs" already cover the
    legitimate uses.
  - "Admins can view all blogs" also lists admin@nautiminds.com.
- **Storage buckets:** `blog-images`, `images`, `notes`, `invoices`.
- **Old blog app:** `../seo-scribe-one-main` (Vite + React 18 + shadcn, from Lovable). It points at prod Supabase and
  is served from Hostinger at `/admin/blogs/`. Its parts:
  - `src/pages/Index.tsx`: create flow, AI or manual;
  - `src/components/BlogList.tsx`: filters, reorder by `order_index`, delete including images;
  - `BlogEditor.tsx`;
  - `RichTextEditor.tsx` + `CustomImageExtension.tsx`: TipTap 3 with link, image and underline;
  - `ImageCropper.tsx` (react-image-crop);
  - `supabase/functions/generate-blog`: Gemini, to be retired.
  
  Retire the old app once HQ's editor works, but **confirm with the user before removing anything from Hostinger**.
- **HQ sign-in drops the target path.** `src/proxy.ts` redirects to `/login` without a `next` parameter, so the
  Telegram "View in HQ" link must survive sign-in: add `?next=` with same-origin paths only.
- **Vercel Hobby limits:** functions run at most 300s and there's one daily cron. Run each pipeline stage as its own
  invocation, store its state in the DB, and chain stages with `after()` calling the next stage's route (protected by
  `CRON_SECRET`).

### Pipeline design (agreed)
1. **Monthly topic plan:** Opus 5.5 with web search (≤25 searches), plus the existing posts (and Search Console once
   connected). Produces `seo_topics` rows (keyword, intent, category, cluster, links, priority), editable on an HQ
   Plan page.
2. **Per post, 3 a week**, each stage logged to `seo_runs` with tokens and cost:
   1. **Research + brief:** Sonnet 5.5, `web_search_20260209` ≤10 searches, `web_fetch_20260209` ≤6 pages
      (cap each page's content).
   2. **Draft:** Opus 5.5, max 32K output.
   3. **Edit + de-AI + fact-check:** Opus 5.5, ≤5 searches.
   4. **Code checks (free):** AI-phrase hits, sentence-length variety, repeated openers, uniform paragraphs, keyword
      stuffing, em dashes, invisible Unicode. A fail gets one more edit pass.
   5. **Metadata:** Haiku 5.5 writes the meta description (140–155 chars), SEO title (≤60), excerpt, alt text,
      category, `related_slugs` and the Telegram summary.
   6. **Header image** rendered in code.
   7. **Save** as draft.
3. **Telegram:** `sendPhoto` with the header image, title, keyword, word count, a 3-line summary, the headings, the
   quality score and any unverified claims. Buttons: **Approve & publish**, **View in HQ** (URL button to
   `/seo/posts/<id>`), **Needs changes** (the reply text feeds a re-edit) and **Discard**. Only `TELEGRAM_ADMIN_IDS`
   can act.
4. **On approve:**
   - `status=published`, `published_at`, `content_updated_at`;
   - repository dispatch, if configured;
   - after the deploy callback: IndexNow (`INDEXNOW_KEY`) and Search Console sitemap submit.
5. **Voice:** a "MarinePrep voice" prompt file in HQ, plus a matching Claude Code skill (or `BRAND.md`/`VOICE.md`
   via `/blog brand`) covering:
   - tone and the banned-phrase list;
   - varied sentence rhythm, no em dashes;
   - Indian English, ₹ and IST;
   - real specifics: IMU facts with sources, and aggregated anonymised app data such as mock averages.
   
   No FAQPage schema (FAQ rich results ended May 2026); a visible FAQ in the body is fine.

**Estimated cost** (Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50 per MTok; search $10 per 1,000):
- About $1.45 per post typical, $5.80 worst with the caps.
- At 12 posts a month: about $23 typical, $95 worst, including the monthly plan, the weekly Search Console pulse, the
  AI-citation check, refreshes and editor actions.
- The $20 workspace limit will need raising once this runs regularly. Tell the user after the first run.

### Build order (resume here)
1. **DONE 29 Oct: close the `blogs` write hole.** Migration
   `../marineprep-rag-pipeline/supabase/migrations/20261029090000_close_blogs_write_hole.sql`, applied to staging and
   prod. Prod check with the anon key afterwards: all 14 published posts still readable. CLI is linked to prod.
   - **First check:** query which emails own the 14 posts (`author_id` → `auth.users`). Also check whether anyone
     besides cto@ and ceo@ still needs write access through the old app (for example admin@nautiminds.com, which is
     only in the view policy). Ask the user if an unexpected author shows up.
   - Drop "Authenticated can insert blogs", "Owner can update own blog" and "Owner can delete blogs". Keep "Admins
     manage blogs" and "Public can view published blogs".
   - Check staging has the same policies (`supabase migration list` on both projects) so they stay in sync.
   - Prod may need the user to run `supabase db push` from their terminal.
   - Verify with the anon key that published rows are still readable.
2. **SEO schema migration** (staging → prod):
   - **DONE 29 Oct**, applied to staging and prod:
     `../marineprep-rag-pipeline/supabase/migrations/20261029100000_seo_blog_pipeline.sql`. Anon gets "permission
     denied" on `seo_topics`, `blog_pipeline` and `seo_runs`, and can read `blog_redirects`.
   - `blogs`: add `content_updated_at timestamptz` (backfilled from `published_at`, since `updated_at` is bumped by
     views), `image_alt text`, `category text`, `related_slugs text[]`. Slug is already unique.
   - Internal fields (`origin`, `topic_id`, `review jsonb`, `telegram_message_id`, approval state, "Needs changes"
     feedback) go in a new service-role-only table `blog_pipeline` (pk `blog_id`), **not** on `blogs`: anon has
     `GRANT ALL` on `blogs` and published rows are public, so QA notes there would be readable by anyone.
   - New table `blog_redirects` (`from_path` pk, `to_path`, `created_at`; public read).
   - New table `seo_topics` (the plan).
   - New table `seo_runs` (stage, model, input/output/cached tokens, searches, cost_usd, status, error; service-role
     only, like the `hq_*` tables).
   - Keep `status` values as they are; pipeline state lives in its own column or table so the landing site only ever
     looks at `published`.
3. **DONE 29 Oct: header image generator**, style "Logbook" chosen by the user after two rounds.
   - The user rejected the first round as looking AI-made: no dot before the brand, no pill/chip for the category, no
     tracked mono labels. What they liked: cream chart paper (grid, slug-seeded contours, grain), the category as a
     handwritten Caveat note with a pencil arrow, one headline word under an aqua highlighter swipe, a rough.js
     pencil doodle, "IMU CET '27" circled in blue pencil, and the logo with the name **"Marine Prep"** (not
     "marineprep.app"). **The doodle must sit fully inside the frame, never cropped.**
   - Code: `src/lib/seo/header-image.tsx` (`renderHeaderImage(spec)`, `uploadHeaderImage(spec)` →
     `blog-images/headers/<slug>-<hash>.png`, public URL). Spec = `{slug, headline, mark, category, doodle}`; Claude
     picks headline (≤45 chars reads best), the word to `mark`, a lowercase `category` and one of `DOODLES` (compass,
     lighthouse, ship, anchor, lifering, paperboat, books, stopwatch, wheel).
   - Assets in `assets/blog-header/` (Outfit 600/800, Caveat 600, logo, grain), traced into `/api/seo/**` via
     `outputFileTracingIncludes` in `next.config.ts`. New dependency `roughjs` pinned to `4.6.6`.
   - Admin-only preview: `/api/seo/header-image?headline=…&mark=…&category=…&doodle=…&slug=…`.
   - `uploadHeaderImage` hasn't run against Storage yet; the first pipeline run exercises it. Older posts keep their
     images in `blog-images/header-images/`.
4. **HQ blog pages: DONE 29 Oct, commit 422b9fd (not pushed/deployed yet).** Migration
   `20261029120000_blog_versions_and_scheduling.sql` is applied to staging and prod. Tested signed-in on
   localhost at 390px and 1440px (no console errors, no sideways scroll); two bugs found by the user and fixed
   (server page importing `VIEWS` from a client file; opening a post autosaved because TipTap normalises HTML:
   now `onReady` sets the baseline and StarterKit `trailingNode` is off).
   - **Verified on production by the user (29 Oct):** "Ask Claude" works there (Vercel has the real key).
   - **Local `ANTHROPIC_API_KEY` in `.env.local` is invalid** (`sk-ant-usr…`, 401). Ask Claude works only where the
     real key is (Vercel production) unless the user copies it into `.env.local`.
   - Two `blog_pipeline.autosave` rows on prod come from the user's own test session (posts 81405605…, 8bb4efe4…);
     "Discard unsaved changes" in the editor clears them.
   - Code: `src/lib/seo/{content,posts,deploy,claude,assist,assist-kinds,voice}.ts`, pages under `src/app/(hq)/seo/`
     (overview, `posts` list, `posts/[id]` editor with `rich-text`, `header-panel`, `site-preview`, `image-utils`),
     actions in `src/app/(hq)/seo/actions.ts`. Nav "Blog & SEO" (group Growth) with a `postsWaiting` badge; Overview
     signal. Daily cron publishes scheduled posts (`publishDue`). `?next=` on sign-in done (`safeNext` allows
     same-site paths only).
   - Decisions taken while building: HTML is the source (`content_markdown` is set to null on save; only the old app
     read it). Old app's reorder (`order_index`) dropped: the site sorts by `published_at` and never read it.
     Autosave goes to `blog_pipeline.autosave`, so a live post only changes on "Update live post"; every save keeps a
     `blog_versions` snapshot. Publishing and live updates are blocked by checklist blockers
     (`src/lib/seo/content.ts` `checks()`); `cleanHtml()` on save demotes H1, strips scripts/handlers, fixes
     `marineprep.com/download` and scheme-less `marineprep.app` links. Slug is locked once live. Editor "Ask Claude"
     (rewrite/shorten/simplify/FAQ) uses Opus 5.5, effort medium, logged to `seo_runs`. Inline images: WebP ≤1600px,
     alt required, `editor-images/`; custom headers: 1200×630 JPEG via cropper, `header-images/`. TipTap pinned 3.31.4.
   - Checklist run over the 14 live posts (29 Oct): all lack category + header alt; 2 have the parked
     marineprep.com link; 6 have non-https links; 6 have AI phrases; 6 have em dashes; 5 SEO titles > 60.
   - Original plan for this step:
   - **SEO** nav entry with an overview; **Posts** list (port of BlogList); **Editor** (port of TipTap editor, cropper
     and image extension) restyled with HQ tokens and components.
   - New in the editor:
     - autosave and version history;
     - a Google result preview and SEO checklist;
     - a preview styled like marineprep.app;
     - "ask Claude" actions (rewrite a section, shorten, add an FAQ);
     - scheduled publishing, unpublish and archive;
     - WebP compression on upload with required alt text;
     - works on phones.
   - Add `?next=` to the sign-in redirect.
   - Use `next/dist/docs` for this Next version (AGENTS.md).
5. **Pipeline + Telegram approval.** Run it once end to end on one real topic. Report the actual tokens and cost from
   `seo_runs`, then **ask the user to set the monthly cap** (pause the pipeline and notify Telegram when hit).
6. **The 14 existing posts: refresh, merge, retire. Decided by the user on 29 Oct: don't delete them.** Deleting
   throws away indexed URLs (the papers post alone has 1,828 views) and a burst of brand-new posts looks more like
   scaled content than steady refreshes. Build a **"refresh" mode in the step 5 pipeline**: Claude rewrites an existing
   post for 2027 with sources, it goes through the same checks, and each one is approved on Telegram like a new post.
   - Every refresh also fixes: audit C1 links (`cleanHtml()` already does this on save), H1 base64 images → Storage,
     meta description and SEO title, a Logbook header image with alt text, a category, inline sources (imu.edu.in,
     DG Shipping), honest wording about the papers, no waitlist copy.
   - **Before the landing rebuild ships redirects:** refresh content and titles in place, keep every slug (the SPA
     can't 301, so changed slugs would just be dead URLs). **After it ships:** change slugs to yearless ones and do the
     merges by writing rows to `blog_redirects` (`/blogs/<old>/` → `/blogs/<new>/`), then archive the merged posts.
   - Plan per post (views as of 29 Oct; new slugs are proposals, confirm when doing it):

     | Views | Current slug | Action | Proposed slug |
     |---|---|---|---|
     | 1,828 | `unlock-all-5-years-of-imu-cet-previous-year-question-papers` | Refresh; becomes the one papers page | keep (already yearless) |
     | 108 | `imu-cet-previous-year-papers-2015-2025` | Merge into the papers page above, 301 | — |
     | 371 | `the-complete-imu-cet-syllabus-2026-exam-pattern-breakdown` | Refresh for 2027 | `imu-cet-syllabus-exam-pattern` |
     | 121 | `the-best-books-for-imu-cet-preparation-2026` | Refresh for 2027 | `best-books-for-imu-cet` |
     | 80 | `what-is-imu-cet-the-ultimate-guide-for-2026-aspirants` | Refresh for 2027 | `what-is-imu-cet` |
     | 34 | `indian-maritime-university-imu-history-campuses-course-the-ultimate-2026-guide` | Refresh (evergreen) | `indian-maritime-university-campuses-courses` |
     | 19 | `the-proven-6-month-strategy-to-crack-imu-cet-2026` | Refresh (peaks Nov–Dec) | `imu-cet-6-month-study-plan` |
     | 4 | `the-proven-3-month-study-plan-to-crack-imu-cet-2026` | Refresh (peaks Feb–Mar) | `imu-cet-3-month-study-plan` |
     | 54 | `imu-cet-2026-is-officially-here-application-form-academic-brochure-released` | Keep live until the new 2027 registration post is out, then 301 to it | — |
     | 20 | `imu-admissions-2026-27-dates-application-form-imu-cet-guide-official-updates` | Same | — |
     | 11 | `imu-cet-registration-2026` | Same; the new post is "IMU CET 2027 registration and dates" | `imu-cet-registration-dates` (new) |
     | 17 | `imu-cet-online-coaching-2026-why-the-classroom-era-is-over` | Merge into one honest "coaching or self-study" post, 301 | `imu-cet-coaching-or-self-study` (new) |
     | 14 | `the-imu-cet-exam-full-package` | Same | — |
     | 2 | `traditional-coaching-vs-marine-prep-which-method-is-best-for-imu-cet-2026` | Same | — |
   - Checklist results on 29 Oct (all 14): no category and no header alt text; 2 have the parked marineprep.com link;
     6 non-https links; 6 AI phrases; 6 em dashes; 5 SEO titles over 60 characters.
7. **Rest of the SEO funnel in HQ:**
   - Search Console: grant the existing `marineprep@` service account access to the property and reuse the keyless
     WIF token. Shows clicks, impressions and positions, keywords ranked 8–20 that feed the plan, and refresh flags
     for falling posts.
   - Weekly SEO pulse.
   - Monthly AI-citation check.
   - App store listing suggestions (ASO) built from `hq_reviews`.
   - Weekly PageSpeed check.
   - Weekly drift check of titles and canonicals.

## Open items that need the user

| # | What | Where | Why it matters |
|---|---|---|---|
| 1 | ~~Play account-level permission~~ **Resolved:** the bucket import succeeded on 28 Oct 09:11 IST (13 reviews, marker `hq_alerts` `play_history_import`), and the 29 Oct cron re-read the newest two months. | — | — |
| 2 | ~~Reply to the 1★ App Store review~~ **Done by the user in App Store Connect (29 Oct).** | — | — |
| 3 | ~~CEO password~~ **Resolved:** the CEO signs in with their existing Supabase email + password (ceo@ is in `ADMIN_EMAILS`). | — | — |
| 4 | TestFlight sandbox purchase on iOS | TestFlight build → buy a plan | End-to-end test of the new Apple payment flow (should land in `payments` as `Sandbox`, excluded from HQ revenue). |
| 5 | Mobile app priority fixes | `../marineprep/revamp-notes/00-PRIORITY-fix-first.md` | The user does these before the UI revamp. GitHub issue #6 (question bank RangeError) came from HQ's Fix queue. |
| 6 | Decided on 29 Oct: build the SEO section first | see "Current work: SEO section" | — |
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

- **Update 29 Oct:** the Play review history import has worked since 28 Oct (see open item 1); the item below is kept
  for the commands only.

- **Play review history import.** Bucket `pubsite_prod_7752937647078030555` is configured. Once storage access
  works, the next run (09:00 IST cron or "Refresh now" on /reviews) imports every monthly file once (marker:
  `hq_alerts` kind `play_history_import`), then re-reads the newest two months daily. Check with:
  `curl -s https://marineprep-hq.vercel.app/api/cron/daily -H "Authorization: Bearer $CRON_SECRET"` → `reviews.errors`
  should be empty and `reviews.fetched.google_play` > 0. Rerunning the cron is safe (brief and alerts are once per day).
- **Drop alerts** start working once 7 days of snapshots exist (about 1 Nov 2026).

## Next in HQ after the SEO section (planned, in recommended order)

Build each with the new components and tokens above, so new pages match the redesign (check phone width too).

1. **Reply to reviews from HQ: BUILT 29 Oct** (needs migration `20261029140000_hq_review_replies.sql` on staging +
   prod before deploying).
   - `src/lib/replies.ts`: Claude (Opus 5.5, effort low, structured output) drafts in a **professional, courteous
     support-team register** (user feedback 29 Oct: the first drafts sounded too casual; **no sign-off**, no "Team
     Marine Prep"). Code enforces ≤350 characters (Play's cap, used for both stores), no slang/stock phrases, no
     exclamation marks, no trailing signature; up to 2 rewrites when a draft breaks a rule.
   - **Claude decides `needs_followup`** (the user doesn't want to tick a box): bugs, payments, account issues,
     wrong content or vague complaints → ask them to email `support@nautiminds.com` with specific details; praise,
     opinions, suggestions → no email. An admin edit keeps whatever the text says (flag = text contains the email).
   - **Automatic drafts only for 1–3★** (text, real store ID, no reply, last 7 days), by the 09:00 cron and after
     "Refresh now" (max 3 per run), each with one Telegram message: review + draft + Approve & send / Discard +
     "Edit in HQ" (URL to `/reviews/reply/<id>`). 4–5★: drafted only on request from the review card, no Telegram.
     Saving in HQ edits the Telegram message, so Approve there sends the latest text.
   - **Play replies made in Play Console weren't showing (29 Oct):** reply text for older reviews only comes from the
     monthly report CSVs and HQ re-read only the newest two. Now every run reads all files (≤24), merges duplicates
     preferring the copy with a reply, and records per-file counts in `hq_alerts` kind `play_reports_check` (key =
     date) so you can see which files carry replies. Rows without a reply no longer overwrite a saved reply.
   - **Finding (29 Oct, after the user's refreshes):** every report file has the reply column but **0 replies**,
     although the user replied in Play Console on 27 Oct. Google doesn't backfill replies into the CSVs, and the
     list API only covers reviews users created/edited in the last 7 days. So each refresh now also calls
     `reviews.get` for unanswered Play reviews with text (≤30) and records `lookups` {tried, found, replied, error}
     in the same `play_reports_check` row. **Check that row after the next refresh** to see if Google returns old
     reviews by ID. Fallback either way: a "Replied in Play Console" button on Play cards (`markAnswered`).
   - **App facts** (`/reviews/app-facts`, `hq_settings` key `app_facts`, migration
     `20261029160000_hq_settings.sql`): what the app offers now (free vs paid etc.), edited by the user; included in
     every reply prompt with the review date and today's date, so a reply can say what changed since the review.
     Falls back to a built-in starting text if the table or row is missing.
   - Review cards: "Draft a reply" (any answerable review) and "Reply draft waiting" links.
   - Sending: Play `reviews.reply` (production only, keyless); App Store `customerReviewResponses` (existing
     Customer Support key). Old Play reviews may be out of the API's reach: the error says to reply in Play Console.
2. **Counselling revenue in HQ:** counselling payments live in `counselling_bookings` (`payment_status = 'paid'`,
   `amount` in paise; 2 paid at ₹199 on 29–30 Jul, 6 pending), not in `payments`, so Overview revenue and the daily
   brief miss them. Add them as a separate revenue line (a "Counselling" figure in the Overview's Sales block and the
   daily brief), plus a counselling signal when bookings sit in `pending`.
3. **Store installs on the Funnel page: BUILT 29 Oct.** `src/lib/installs.ts` saves `installs_android` (Play
   `stats/installs/*_overview.csv`, "Daily User Installs") and `installs_ios` (App Store Sales and Trends, first-time
   downloads: product types 1, 1F, 1T, F1) per day in `hq_daily_snapshots`; full history once, then recent days, from
   the 09:00 cron and "Refresh now". The Funnel's Installs tile and platform signal use them, PostHog as fallback.
   App Store part needs env `APP_STORE_SALES_KEY_ID`, `APP_STORE_SALES_PRIVATE_KEY_B64` (base64 of the .p8),
   `APP_STORE_VENDOR_NUMBER` (a second key with the **Sales** role).
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
