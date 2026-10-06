# My Planner — Build Plan for Claude Code

**Owner:** Dustin Dellinger
**Live URL:** https://plan.dustindellinger.com (Cloudways application already created)
**Repo:** https://github.com/ddellinger101/planner
**Users:** Dustin and Elizabeth (two Google accounts)
**Plan date:** October 6, 2026

> **How to use this document (Claude Code):** Read the whole thing first. Then complete **Phase 0**, which includes turning the "Project Context" and "Conventions" sections into a `CLAUDE.md` at the repo root. Work one phase at a time, on a branch per phase, and open a PR at the end of each phase with a short summary and screenshots (desktop + mobile width). Stop after each PR for Dustin's review. Anything listed under **Open Questions** must be confirmed with Dustin before you build the part that depends on it — don't guess on those.

---

## 1. Project Context

My Planner replaces a printed, 400+ page yearly planner (a bullet journal) that Dustin builds every year. The printed book has a Year page, 4 Quarter pages, 12 Month pages, 52 Week pages, and a page per day (plus combined "Weekend" pages). Every page is organized into five life categories:

| Category | Notes |
|---|---|
| **Health** | Includes weight tracking. Many tasks are part of morning/evening routines. |
| **Finances** | |
| **Home** | Many tasks are part of morning/evening routines. |
| **Family** | |
| **Only 4 You** | Dustin's music project. Has its own custom icon (see Assets). |
| **Other** *(new)* | The printed book's "Other To-Dos" box: tasks that don't fit a category. |

The app should keep that structure, but it is **not** a digital copy of the book. It should be faster to plan with, fun to use, and connected to Google Tasks and Google Calendar.

### What carries over from the printed planner

| Printed page | Sections to keep | Sections to drop |
|---|---|---|
| **Year** | 1-Year Goals by category; Q1–Q4 overview | — |
| **Quarter** | Quarter Goals by category (+ weight goal); the 3 months at a glance | Notes |
| **Month** | "Best Part About This Month"; Monthly Goals by category (+ weight); Important Dates | Notes |
| **Week** | "Best Part About This Week"; Weekly Goals by category (+ weight); Meal Plan Mon–Sun | Shopping List, Notes |
| **Day** | Gratitude; Affirmation; Main Tasks by category (+ weight); Meal Plan (Breakfast/Lunch/Dinner/Snacks); Today's Events; Other To-Dos | — |
| **Weekend** | — | Drop the combined page. Saturday and Sunday use the normal Day view. |

Dustin confirmed that **Notes** and **Shopping List** were never used and should be omitted.

### New functionality (from the spec)

1. **Checkboxes everywhere**, including Month and Quarter goals (the book lacked them). Checking things off must feel satisfying.
2. **Times on tasks** (optional). Timed tasks appear on the Daily hourly timeline.
3. **Recurring tasks**, matching how Dustin uses recurring tasks in Google Tasks.
4. **Starred (priority) tasks.**
5. **Routines**: morning and evening routines (mostly Health and Home tasks), plus a **habit tracker**.
6. **Affirmation carry-over**: a day's affirmation pre-fills the next day, editable.
7. **Gratitude and reflection**: daily Gratitude; "Best Part About This Week/Month"; Meditation.
8. **Period rollover**: when a new month, quarter or year starts, review the previous one's open items and either push each forward or mark it done.
9. **Weekly planning prompt**: when planning a week, choose from that month's goals and add new ones.
10. **Weight tracking** with a progress graph.
11. **Push notifications.**
12. **Rewards**: pick a task or group of tasks, describe a reward, set a deadline; the reward unlocks if they're all done in time. Dustin and Elizabeth will define the rewards themselves.
13. **Brain Dump page**: categories **Must Do, Should Do, Could Do, Call, Email, Buy, Other, Health Habits, Kids Stuff, Only 4 You**. Each item has **"Add to Plan"** (set date / time / category, which sends it into the planner). Items stay on the Brain Dump until assigned.
14. **Google Tasks two-way sync** (lists matching the categories), including recurring tasks and, ideally, stars.
15. **Google Calendar two-way sync** (events in and out).
16. **Meals come from Chef**: Dustin and Elizabeth already plan meals in their own app, **Chef** (https://chef.dustindellinger.com), which writes the meal plan to a Google Calendar (the "Menu" calendar). The planner's meal sections **read from that calendar**; Chef stays the place where meals are planned (see Section 7).
17. **Two users, one shared planner**: Dustin and Elizabeth share a single planner (confirmed). Both see and can check off every item; each item records who it belongs to so either person can filter to their own. Elizabeth's Google Calendar and Google Tasks are connected too.

---

## 2. Technical Decisions

Cloudways runs a managed PHP / MySQL (MariaDB) stack, so the backend is PHP. Dustin is a long-time PHP/WordPress developer and has built React frontends on top of PHP backends before.

| Concern | Decision | Why |
|---|---|---|
| Backend | **Laravel** (current stable release), PHP 8.3+ | Runs well on Cloudways; first-class scheduler, queues, OAuth (Socialite), migrations and encryption. |
| Database | MySQL / MariaDB (the Cloudways app's database) | Already provisioned. |
| Frontend | **React + TypeScript + Vite**, served by Laravel as a single-page app in the same repo | Same domain, so cookie-based auth (Sanctum SPA mode) with no CORS. |
| Layout | **Bootstrap 5** grid and utilities (SCSS, customized theme) | Spec asks for full-width desktop with Bootstrap-style gutters that stack on mobile. Use Bootstrap for layout/utilities only; custom components on top. |
| Icons | **Lucide** (line icons) + the custom Only 4 You SVG | Spec: "I love iconography — line icons specifically." |
| Charts | Chart.js (via react-chartjs-2) or Recharts | Weight graph and habit stats. |
| Data fetching | TanStack Query | Caching, optimistic updates (instant checkbox feel). |
| Auth | Google sign-in (Laravel Socialite) with an **allowlist of two emails**; Sanctum session | Same OAuth grant also authorizes Tasks + Calendar. |
| Google APIs | `google/apiclient` PHP library | Tasks API v1, Calendar API v3. |
| Background work | Laravel scheduler via Cloudways cron (`* * * * * php artisan schedule:run`); database queue driver | Sync polling, reminder delivery, recurrence generation. |
| Push | **Web Push (VAPID)** via `minishlink/web-push` (or `laravel-notification-channels/webpush`); the app is a **PWA** with a service worker | No native app needed. |
| Deploy | **GitHub Actions** → build (composer + npm) → rsync over SSH to Cloudways → `php artisan migrate --force` + cache clear | Avoids depending on Node being available on the server. |
| Tests | Pest (PHP) for domain logic and sync; Vitest + Testing Library for key components | Sync and rollover logic must be tested. |

### Things Claude Code must verify in Phase 0 (don't assume)

- Which **application type** the Cloudways app was created as (Custom PHP vs. Laravel), its PHP version, and its webroot. Laravel needs the webroot pointed at `/public` (or the `public_html` → `public` symlink approach Cloudways documents).
- That SSH/SFTP credentials and the Cloudways **cron job manager** are available on this plan.
- That the domain has **SSL** (Let's Encrypt in Cloudways). Required for OAuth, service workers, and Web Push.
- The current Google Tasks API capabilities listed under "Known Google API limitations" below, against the live docs.

---

## 3. Known Google API Limitations (design around these)

These shape the sync design. **Re-verify each against current Google documentation in Phase 0** and tell Dustin if anything has changed.

1. **Google Tasks stores a due *date* only.** The API discards the time portion. → Task **times live in the app**. When pushing a timed task, also write the time into the Google Task notes (e.g., a first line `⏰ 3:30 PM`) so it's visible in Google Tasks. Parse that line back on pull.
2. **Starred tasks are not exposed by the Google Tasks API.** → Stars are **app-native**. Optional workaround (ask Dustin, see Open Questions): mirror a star as a `⭐ ` title prefix in Google Tasks and treat that prefix as a star on pull.
3. **Recurrence rules are not exposed by the Tasks API.** Recurring tasks created in Google Tasks appear as their current instance only; when completed, Google creates the next instance, which the app will pick up on its next poll. → For tasks created in the app, the **app owns the recurrence rule** (RRULE) and pushes each generated instance to Google Tasks as a normal task.
4. **No push/webhook for Google Tasks.** → Poll every 5 minutes using `updatedMin`, `showCompleted`, `showDeleted`, `showHidden`.
5. **Google Calendar** supports incremental sync with `syncToken`; use that (poll every 5 min). Webhook channels (`events.watch`) are an optional later optimization.
6. **OAuth "Testing" mode refresh tokens expire after 7 days.** → Publish the OAuth consent screen to **In production**. Tasks and Calendar scopes are sensitive, so Google will show an "unverified app" warning during consent; that's acceptable for two personal users (under the 100-user cap). No verification submission needed.

---

## 4. Domain Model

All tables have `id`, timestamps, and soft deletes where noted. Every user-owned row has `household_id` and an `owner_user_id`.

### Users and household
- **households**: one row (Dustin + Elizabeth). **Confirmed: one shared planner.** All planner data (items, goals, journal "best part" fields, brain dump, rewards, habits) is household-level and visible/editable by both users. Built so separate planners could be added later without a rewrite, but don't build that now.
- **users**: `household_id`, `name`, `email` (allowlisted), `avatar_url`, `color` (each person gets an accent color), `timezone` (default `America/New_York`), notification preferences.
- **google_accounts**: `user_id`, `google_sub`, encrypted `refresh_token`, `access_token`, `expires_at`, granted `scopes`, `tasks_last_synced_at`.
- **google_task_lists**: `google_account_id`, `google_list_id`, `title`, `category_id` (nullable mapping), `etag`.
- **google_calendars**: `google_account_id`, `google_calendar_id`, `summary`, `color`, `role` (`primary | menu | other`), `sync_enabled`, `sync_token`.

### Categories
- **categories**: `slug`, `name`, `color` (hex), `icon` (Lucide name or `custom:only4you`), `sort`, `is_brain_dump_only` flag.
  - Planner categories (seed): Health, Finances, Home, Family, Only 4 You, Other.
  - Brain Dump buckets are a separate enum, not categories (see Brain Dump below).

### Periods
Periods are computed, not stored. A period is identified by a **period key**:
- Year `2027`, Quarter `2027-Q1`, Month `2027-01`, Week `2027-W01` (ISO weeks, **Monday start**, matching the printed planner), Day `2027-01-04`.

Provide a single tested `Period` value object (backend) and matching TS utility (frontend): parse, format, next/previous, contains(date), parent (day→week→month→quarter→year), and children.

> **Edge case:** ISO weeks can straddle months (e.g., Week 5 = Jan 26–Feb 1). A week belongs to the month that contains its **Monday** for planning purposes, but the weekly-planning prompt (Phase 5) should offer goals from **both** months when a week straddles.

### Items (tasks and goals)
One table for everything checkable: **items**.

| Column | Notes |
|---|---|
| `title`, `notes` | |
| `category_id` | Required except Brain Dump items. |
| `scope` | `year | quarter | month | week | day` |
| `period_key` | e.g. `2027-03`. For `day` scope this equals the date. |
| `due_date`, `due_time` (nullable) | `due_time` → appears on Daily timeline. |
| `duration_minutes` (nullable) | For timeline block height. |
| `starred` | bool |
| `status` | `open | done | dropped`; `completed_at` |
| `parent_item_id` | Goal cascade: a week item pulled from a month goal points to it. |
| `carried_from_item_id` | Set when an item is pushed forward during rollover (keeps history). |
| `routine` | `null | morning | evening` |
| `recurrence_rule` (RRULE string), `recurrence_parent_id` | Series template + generated instances. |
| `created_by`, `assignee` | `assignee` = `dustin | elizabeth | both` (default `both` for goals, creator for day tasks). Drives the person filter and which Google account the task syncs to. |
| `sort` | Manual ordering within a box. |
| `source` | `app | google_tasks | brain_dump` |
| Google sync | `google_task_id`, `google_task_list_id`, `google_etag`, `google_updated_at`, `sync_state` (`clean | dirty | error`), `sync_error` |

### Daily / periodic journal fields
- **journal_entries**: `user_id`, `period_key`, `type` (`gratitude | affirmation | best_part | weekend_reflection | meditation`), `body`, `minutes` (meditation). Unique on (user, period_key, type).
  - **Affirmation carry-over:** when a day has no affirmation, the API returns the most recent previous affirmation flagged `carried: true`; the UI shows it pre-filled and editable. Saving creates that day's own row.

### Meals (read from Chef via Google Calendar)
- **meal_entries**: a **read-only cache** of events on the Menu calendar that Chef writes: `household_id`, `date`, `slot` (`breakfast | lunch | dinner | snack | unknown`), `title`, `description`, `google_event_id`, `google_calendar_id`, `etag`, `chef_url` (if Chef puts a recipe link in the event).
  - The Week view's Mon–Sun meal plan and the Day view's Breakfast/Lunch/Dinner/Snacks are **two views of the same rows**.
  - The planner does **not** write meals. Chef is the single writer to the Menu calendar, which avoids two apps fighting over the same events.

### Events and important dates
- **events**: cached + app-created Google Calendar events: `google_calendar_id`, `google_event_id`, `title`, `start`, `end`, `all_day`, `location`, `owner_user_id`, `etag`, `sync_state`.
- **important_dates**: `title`, `date`, `repeats_yearly`, `category_id`, optional linked event. Shown on the Month view (and as chips on the Day/Week views on that date).

### Weight
- **weight_entries**: `user_id`, `date`, `weight` (decimal), `unit` (`lb` default).
- **weight_goals**: `user_id`, `scope` (`year | quarter | month | week`), `period_key`, `target_weight`. These populate the "Weight:" fields that appear next to Health on every page of the printed planner.

### Routines and habits
- **habits**: `user_id`, `title`, `category_id`, `icon`, `color`, `routine` (`morning | evening | anytime`), `target` (`daily` or `n per week`), `active_from`, `active_to`, `sort`.
- **habit_checks**: `habit_id`, `date`, `done`. Unique on (habit, date).
- Routine *tasks* (one-off or recurring items with `routine` set) and *habits* (streak-tracked) are both shown in the routine sections. Keep them separate in the data; show them together in the UI.

### Brain Dump
- **brain_dump_items**: `household_id`, `created_by`, `bucket` (`must_do | should_do | could_do | call | email | buy | other | health_habits | kids_stuff | only_4_you`), `title`, `notes`, `sort`, `assigned_item_id` (null until "Add to Plan"), `assigned_at`.
  - The list shows only unassigned items. "Add to Plan" creates an `items` row and sets `assigned_item_id`.
  - **Suggested default category mapping** for "Add to Plan" (pre-selected, user can change): Health Habits → Health, Kids Stuff → Family, Only 4 You → Only 4 You, Buy → Home, everything else → Other.

### Rewards
- **rewards**: `household_id`, `created_by`, `title`, `description`, `deadline`, `status` (`active | earned | expired | claimed`), `earned_at`, `claimed_at`, optional `beneficiary` (`dustin | elizabeth | both`).
- **reward_items**: `reward_id`, `item_id`. A reward is **earned** when all linked items are `done` with `completed_at <= deadline`; **expired** if the deadline passes first. Evaluate on every item status change and nightly.

### Push notifications
- **push_subscriptions**: `user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`.
- **scheduled_notifications**: `user_id`, `type`, `send_at`, `payload`, `sent_at`, `item_id` (nullable). Built by the scheduler from timed tasks, routines and planning reminders.

---

## 5. Information Architecture and Screens

### Navigation
- **Opening screen:** Daily Agenda (today).
- **Bottom icon nav (mobile), always visible:** Day · Week · Month · Quarter · Year · More.
  - **More** opens: Brain Dump, Routines & Habits, Weight, Rewards, Settings.
- **Desktop:** the same items as a left rail or top nav, with the page content spread full width in a Bootstrap grid. Do not just center the mobile layout on desktop.
- Every period view has **‹ prev / today / next ›** controls and a date-picker jump.
- A floating **+ Quick Add** button on every screen: title, category, date (defaults to the current view), optional time, star, recurrence. Natural-language date parsing is a nice-to-have (e.g., "dentist fri 3pm").
- A **person filter** (Dustin / Elizabeth / Both) in the header, remembered per device.

### Daily Agenda (home)
Desktop layout: three columns. Mobile: stacked in this order.

1. **Header:** day name and date, weather-free; streak/progress ring for today's tasks.
2. **Gratitude** (single line) and **Affirmation** (pre-filled from the previous day, editable, with a small "carried from Mon" label).
3. **Category boxes:** Health (+ today's weight entry), Finances, Home, Family, Only 4 You, Other. Each box: color-coded header with icon, checkbox list, star toggle, inline add.
4. **Hourly timeline:** the day from ~6 AM to 11 PM (configurable), showing **timed tasks and calendar events in time order**, colored by category or calendar. **Untimed tasks for the day are listed above the timeline** (per spec). Drag a task onto the timeline to give it a time (desktop; long-press on mobile is a stretch goal).
5. **Routines:** Morning and Evening routine checklists (routine tasks + habits for today).
6. **Meal Plan:** Breakfast / Lunch / Dinner / Snacks, read from Chef's Menu calendar. Each meal links to its recipe in Chef when the event includes a link; an **"Open in Chef"** button jumps to Chef for that day/week.
7. **Today's Events** (from Google Calendar, both users when filter = Both) and **Important Dates** chips.
8. **Starred** tasks are pinned to the top of their box with a star accent.
9. **Overdue** open tasks from previous days appear in a collapsible "From earlier" strip with one-tap *Move to today* / *Done* / *Drop*.

> Inspiration: the "LM clock" image shows a radial 24-hour day ring. **Stretch goal:** an optional "clock" toggle that renders the timeline as a radial ring. Not required for v1.

### Week
- "Best Part About This Week" field.
- **Weekly Goals** by category (+ weekly weight goal), all with checkboxes and stars.
- **Week strip:** Mon–Sun columns with each day's tasks (compact) so the week can be planned by dragging tasks between days (desktop). Mobile: horizontally swipeable day cards.
- **Meal Plan Mon–Sun** grid (same data as the Day view, from Chef). Empty days show a gentle "Plan in Chef" link.
- **Routine grid for the week** (inspired by the "Housework" M–S check grid): rows = habits/routine items, columns = days.
- **"Plan this week"** button → Weekly Planning flow (Phase 5).

### Month
- "Best Part About This Month".
- **Monthly Goals** by category (+ monthly weight goal), **with checkboxes** (new).
- **Calendar grid** of the month showing dots/chips for tasks, events and important dates; tap a day → Day view.
- **Important Dates** list (add / edit, yearly repeat).
- **Monthly habit tracker** (radial, see Routines).
- Progress summary: % goals done per category.

### Quarter
- **Quarter Goals** by category (+ quarter weight goal), **with checkboxes** (new).
- The 3 months at a glance (mini calendars + each month's goal completion).

### Year
- **1-Year Goals** by category, with checkboxes.
- Q1–Q4 overview cards (goal completion per quarter).
- Year weight graph.

### Brain Dump
Laid out like the "Brain Dump" inspiration template: a grid of boxes with icons.
- Boxes: **Must Do, Should Do, Could Do** (top row), **Call** (phone icon), **Email** (mail icon), **Buy** (cart icon), **Other**, **Health Habits**, **Kids Stuff**, **Only 4 You** (custom icon).
- Fast entry: type and press Enter to add the next item in the same box.
- Each item: **Add to Plan** → sheet with date, optional time, category (pre-selected via mapping), star, recurrence → creates the planner item; the brain-dump item disappears from the board.
- Drag items between boxes.
- Items **persist until assigned**. Show a small count of items assigned this week as a positive nudge.

### Routines & Habits
- **Morning** and **Evening** routine editors: ordered lists of habits/recurring tasks.
- **Habit tracker**, two visualizations from the inspiration images:
  - **Weekly grid** (rows = habits, columns = M–S), like the bullet-journal housework grid.
  - **Monthly radial tracker**, like the circular habit tracker poster: each habit is a ring, each day a segment, filled in the habit's color.
- Streaks and completion % per habit.

### Weight
- Quick entry (today prefilled), history list.
- **Line chart** of weight over time with goal lines (week/month/quarter/year targets) and range toggle (1M / 3M / 6M / 1Y / All).
- Separate series per user; each user sees their own by default.

### Rewards
- List of active rewards as cards: title, description, deadline countdown, **progress bar** (x of n tasks done), linked tasks listed with their checkboxes.
- **Add a Reward:** choose one or more tasks (searchable picker filtered by period/category, or "all starred tasks this week"), write the reward description, set the deadline.
- When earned: celebratory animation + push notification; card moves to "Earned — claim it!" and then "Claimed".

### Settings
- Profile, color, timezone.
- **Google connection** per user: connect/reconnect, choose which calendars sync (and pick which calendar is Chef's **Menu** calendar), map Google Task lists ↔ categories (create missing lists with one click).
- Notifications: enable push on this device, defaults (task reminder lead time, morning/evening routine reminders, weekly planning reminder, rollover reminder).
- Day timeline start/end hours.

---

## 6. Key Flows

### 6.1 Period rollover (month / quarter / year — and week)
Trigger: the first time a user opens the app in a new period (and via a push reminder on the 1st). The app shows a **Review** sheet listing the previous period's **open** items for that scope, grouped by category:
- Per item: **Done ✓** · **Carry forward →** (creates a copy in the new period with `carried_from_item_id`) · **Drop ✕**.
- Bulk actions: "Carry all remaining forward", "Done with review".
- Also prompts for the previous period's **Best Part** if empty (month/week).
- The Year rollover also covers the final quarter and month, in that order (Year → Quarter → Month → Week), so the user isn't hit with four separate sheets at once.
- Unreviewed items never disappear; the period view shows a "Review last month" banner until done.

### 6.2 Weekly planning
Inspired by the "Plan Your Week in 15 Minutes" inspiration image. A guided, skippable stepper:
1. **Capture** — open Brain Dump inline; add anything on your mind.
2. **Review last week** — the rollover sheet for the previous week (6.1).
3. **Pull from the month** — list this month's open goals (both months if the week straddles) with checkboxes; selected ones become week items linked via `parent_item_id`. Plus "Add new" per category.
4. **Big 3** — star up to three priorities for the week.
5. **Place it** — drag week items onto days (and optionally times); see calendar events per day so the plan fits reality.
6. **Meals** — show the week's meals from Chef; if days are empty, an **"Plan meals in Chef"** button opens chef.dustindellinger.com. The step refreshes the Menu calendar when the user returns to the tab.
7. **Done** — summary + optional "Create a reward for this week's Big 3?"

When a linked week item is checked off, show the parent month goal and offer "Mark the month goal done too?"

### 6.3 Add to Plan (from Brain Dump)
Described above. Must be a 2-tap action for the common case: tap **Add to Plan** → choose "Today / Tomorrow / This week / Pick date" → saved with the mapped category.

### 6.4 Recurring tasks
- Recurrence presets: daily, weekdays, weekly on [days], every N weeks, monthly on day N / on the Nth weekday, yearly, custom RRULE.
- The scheduler generates instances a rolling **60 days** ahead (and on demand when viewing a future period). Editing offers "this one / this and following / all".
- Completing an instance never affects the others.

### 6.5 Affirmation carry-over
Covered in the data model. The Day view always shows an affirmation if any previous one exists.

---

## 7. Google Integration Design

### OAuth
- Scopes: `openid email profile`, `https://www.googleapis.com/auth/tasks`, `https://www.googleapis.com/auth/calendar.events`, `https://www.googleapis.com/auth/calendar.readonly` (to list calendars).
- `access_type=offline`, `prompt=consent` on first connect to guarantee a refresh token. Store tokens encrypted (Laravel `encrypted` cast). Auto-refresh; if refresh fails, flag the account and show a "Reconnect Google" banner.
- Redirect URI: `https://plan.dustindellinger.com/auth/google/callback` (plus a local dev URI).
- Sign-in is restricted to an **allowlist** of the two emails (env var).

### Google Tasks ↔ Items
- **Mapping:** each category maps to one Google Task list per user (Health, Finances, Home, Family, Only 4 You, Other). Settings shows the mapping and offers to create missing lists.
- **Which items sync:** `day`-scope items with a `due_date` (including routine and recurring instances). Year/quarter/month/week **goals stay app-only** by default (setting to include week goals as undated tasks is a nice-to-have).
- **Pull (every 5 min per account):** for each mapped list, fetch changes since the last sync.
  - New Google task **with a due date** → create a `day` item in that list's category for that user.
  - New Google task **without a due date** → create a **Brain Dump** item (bucket: Other) so it gets assigned. *(Confirm with Dustin, Open Question 6.)*
  - Updated/completed/deleted → update the matching item.
  - Parse the `⏰ time` note line and optional `⭐` title prefix.
- **Push (queued, on change):** item created/updated/completed/deleted → insert/patch/delete the Google task. Mark `sync_state=dirty` until confirmed.
- **Conflicts:** last-write-wins by comparing `google_updated_at` with the local `updated_at`; log conflicts. Never loop: ignore pulled changes whose etag matches what we just pushed.
- **Ownership:** each item syncs to its **assignee's** Google account. Items assigned to "Both" sync to the creator's account only, to avoid duplicate tasks; since the planner is shared, both people still see and can check them in the app.

### Google Calendar ↔ Events and Meals
- Each user picks which calendars to show. Pull with `syncToken` every 5 min into `events`; show on Day/Week/Month.
- Events created in the app (Quick Add with a time + "This is an event" toggle, or Important Dates with "Add to calendar") are inserted into the user's chosen default calendar.
- **Menu calendar (Chef):** Chef (chef.dustindellinger.com, a separate app Dustin built) already writes the meal plan to a Google Calendar. The planner **reads** that calendar only.
  - Chef's calendar is on **Dustin's** Google account (dustindellinger@gmail.com), so Menu sync runs through Dustin's Google connection and meals show for both users (household-level). In Settings (Dustin's account), pick which calendar is Chef's Menu calendar (`role = menu`). It is synced like other calendars but its events go to `meal_entries`, not `events`, and are hidden from the regular event lists/timeline (no double display).
  - **Before writing the parser, inspect real data:** after connecting, list a few weeks of events on the Menu calendar and document Chef's event format (titles, timed vs. all-day, how slots are indicated, any recipe links in the description) in `docs/chef-calendar-format.md`. Then write a `ChefMealParser` that maps events to slots (by an explicit label in the title/description if Chef provides one, otherwise by start time: before 11 AM breakfast, 11–3 lunch, after 3 dinner, all-day → unknown/dinner as the format suggests). Unit-test it against those real samples.
  - If Dustin can give access to the Chef codebase, read how Chef creates calendar events instead of guessing from samples.
  - **Later option (not v1):** if Chef exposes an API, the planner could read meals from Chef directly. Keep meal reading behind a `MealSource` interface so this can be swapped in.

### Initial import
On first connect: import open tasks (all mapped lists) and the next 90 days + previous 30 days of events. Show a progress indicator.

---

## 8. Look and Feel

**Goal:** fun, colorful, well organized. It should feel like a beautifully kept bullet journal, not a corporate task manager.

### Visual direction (from the inspiration folder)
- **Paper feel:** warm off-white background with a subtle dot grid (like a dotted bullet journal) behind the content; white "cards" for sections.
- **Highlighter headings:** section headings with a marker-style highlight band behind them in the category color (as in the bullet-journal photos).
- **Category colors** (starting palette; check contrast in light and dark mode, tweak as needed):

| Category | Color idea | Lucide icon |
|---|---|---|
| Health | green / teal | `heart-pulse` |
| Finances | amber / gold | `piggy-bank` or `wallet` |
| Home | blue | `house` |
| Family | coral / pink | `users` |
| Only 4 You | purple | custom SVG (see Assets) |
| Other | slate | `list-todo` |

- **Brain Dump buckets** each get an icon: Must Do `alert-circle`, Should Do `arrow-up-circle`, Could Do `circle-dashed`, Call `phone`, Email `mail`, Buy `shopping-cart`, Other `sticky-note`, Health Habits `apple`, Kids Stuff `baby` or `blocks`, Only 4 You custom.
- **Typography:** a friendly hand-lettered display face for page titles and headings (e.g., a script/marker Google Font) paired with a clean, highly legible sans for everything else. Keep the display font to titles only.
- **Line icons everywhere**, consistent stroke width.
- **Dark mode** supported from the start (tokens on `:root`).
- Load the `frontend-design` skill before Phase 2 and make deliberate, non-templated choices within this direction.

### The checkbox (make it great)
Checking a task is the core pleasure of the app.
- Large tap target (≥ 44px), rounded box in the category color.
- On check: quick spring animation of the checkmark, the title gets an animated strike-through, a small burst of confetti/sparkles in the category color, and `navigator.vibrate(10)` on supporting devices. Optional subtle sound (off by default).
- Completing every task in a category box triggers a slightly bigger celebration; completing a reward triggers the biggest one.
- Optimistic update: the UI never waits on the server or Google.
- Respect `prefers-reduced-motion`.

### Responsive behavior
- Desktop: full width, Bootstrap container-fluid with gutters; Day view in 3 columns, Week in 7 day columns, Month as a full calendar grid.
- Tablet: 2 columns. Mobile: single column, bottom nav, sticky header with period navigation.
- Test at 375px, 768px, 1280px, 1920px.

### Assets
- Copy the inspiration images into `docs/inspiration/` in the repo for reference.
- **Only 4 You icon:** two files are provided with this plan; commit both to `resources/js/assets/icons/`:
  - `only-4-you-logo.png` — the **full-color brand logo** (a teal-to-blue "U" cradling an orange-to-yellow oval with four white dots). Use it where the category is shown large and in color: the Only 4 You box header on desktop, the Brain Dump Only 4 You box, and the category picker.
  - `only-4-you.svg` — a **line-icon version** drawn on Lucide's 24×24 grid (stroke 2, `currentColor`) so it matches the other icons and takes the category color. Use it everywhere icons are small or monochrome: task rows, chips, nav, filters, push notifications.
  - All category icons render through one `<CategoryIcon variant="line|brand">` component.
  - Consider borrowing the logo's two gradients (teal→blue, orange→yellow) for the Only 4 You category color treatment.
- PWA icons (192/512 + maskable) and a favicon: generate a simple placeholder; flag for Dustin to replace.

---

## 9. Build Phases

Each phase ends with a PR, passing tests, a deploy to plan.dustindellinger.com, and a short summary. Stop for review after each.

### Phase 0 — Foundation & deploy pipeline
- Clone `ddellinger101/planner`. Scaffold Laravel + React/TS/Vite + Bootstrap SCSS + Lucide. ESLint/Prettier, PHP-CS-Fixer or Pint, Pest, Vitest.
- Create `CLAUDE.md` from sections 1, 2 and the Conventions below. Add this plan as `docs/PLAN.md`.
- Inspect the Cloudways app (Section 2 checklist). Configure webroot, `.env` on server (never committed), database credentials, `APP_URL=https://plan.dustindellinger.com`.
- GitHub Actions: on push to `main` → test → build → rsync via SSH → migrate → cache. Store secrets in GitHub Actions secrets.
- Cloudways cron: `* * * * * cd <app path> && php artisan schedule:run >> /dev/null 2>&1`.
- Health-check page live on the domain over HTTPS.
- Verify Google API limitations (Section 3) against current docs and report.
- **Done when:** a hello-world page deploys automatically from `main` to the live domain.

### Phase 1 — Auth, users, data model
- Google sign-in (Socialite) with email allowlist; household + two users; Sanctum SPA auth.
- All migrations from Section 4 (including Google sync columns, even though sync comes later). Seed categories.
- `Period` value object + TS twin, fully unit-tested (ISO weeks, straddling weeks, quarter/year boundaries, DST).
- REST API (or JSON resources) for items, journal entries, meals, weight, habits, brain dump, rewards. Policies scoped to household.
- **Done when:** both users can sign in; API tests pass.

### Phase 2 — Design system & app shell
- Theme tokens (light/dark), category colors, typography, dot-grid paper background, highlighter headings.
- Components: `CategoryBox`, `TaskRow` (with the great checkbox + star + time + recurrence badges), `QuickAdd`, `PeriodNav`, `BottomNav`/side rail, `PersonFilter`, `EmptyState`, `CategoryIcon`.
- Routing for all pages with placeholder content.
- **Done when:** shell is navigable on mobile and desktop, components demoed with real API data.

### Phase 3 — Daily Agenda
- Everything in the Daily Agenda section: category boxes, untimed list + hourly timeline, gratitude, affirmation carry-over, meals, events placeholder (calendar comes in Phase 10), overdue strip, weight quick entry, routine sections (basic), starred pinning.
- Recurring tasks: RRULE editor, instance generation job, edit-scope dialog.
- **Done when:** Dustin can run a full day in the app.

### Phase 4 — Week, Month, Quarter, Year views
- All four views per Section 5, with checkboxes and stars on every goal, weight goals, best-part fields, meal plan week grid, important dates, month calendar grid, progress summaries.
- Drag tasks between days in the Week view (desktop).
- **Done when:** every page of the printed planner has a working equivalent.

### Phase 5 — Planning flows
- Period rollover review (6.1) for week/month/quarter/year.
- Weekly planning stepper (6.2), including pulling from monthly goals with `parent_item_id` links and the "mark parent done?" prompt.
- **Done when:** a new month and a new week can be planned end-to-end.

### Phase 6 — Routines & habit tracker
- Morning/evening routine editors; habits; weekly grid; monthly radial tracker (SVG); streaks.
- **Done when:** routines appear on the Day view and the tracker fills in as habits are checked.

### Phase 7 — Brain Dump
- Board with all 10 buckets, fast entry, drag between buckets, Add to Plan sheet with category mapping, assigned items leave the board.
- **Done when:** items can be dumped and sent to the planner in two taps.

### Phase 8 — Weight & Rewards
- Weight entry, history, chart with goal lines.
- Rewards: create (task picker), progress, earn/expire evaluation (on item change + nightly), celebration, claim.
- **Done when:** a reward linked to 3 tasks unlocks when the third is checked before the deadline.

### Phase 9 — Google Tasks sync
- OAuth scopes + token storage/refresh; list ↔ category mapping UI; initial import; pull (5-min poll) and push (queued); recurrence and star handling per Section 3; conflict logging; sync status indicator and "Sync now" button; reconnect banner.
- Pest tests with mocked Google client for: create/update/complete/delete both directions, time-note round trip, star prefix round trip, undated task → Brain Dump, no echo loops.
- **Done when:** a task added on Dustin's phone in Google Tasks shows up in the app within 5 minutes on the right day/category, and vice versa.

### Phase 10 — Google Calendar sync & Menu calendar
- Calendar selection, incremental sync, events on Day/Week/Month and timeline, create events from the app.
- Chef meals: pick the Menu calendar, document Chef's event format from real data, `ChefMealParser` + tests, meals on Day/Week views with "Open in Chef" links.
- **Done when:** events round-trip between the app and Google Calendar for both users, and meals planned in Chef appear in the planner within 5 minutes.

### Phase 11 — Elizabeth onboarding & shared use
- Elizabeth connects her Google account; person filter fully working on every view; assignee handling; both users' events side by side on the timeline (distinguished by person color).
- **Done when:** both users plan in the app daily with their own Google data.

### Phase 12 — PWA & push notifications
- Manifest, icons, service worker (app-shell caching; network-first API; offline read of today's view is a nice-to-have).
- VAPID keys, subscription flow in Settings, notifications for: timed task reminders (lead time configurable), morning/evening routine reminders, Sunday weekly-planning reminder, 1st-of-month rollover reminder, reward earned, reward deadline approaching.
- Note in Settings: on iPhone, push works only after **Add to Home Screen** (iOS 16.4+).
- **Done when:** a timed task triggers a push on Dustin's phone.

### Phase 13 — Polish & delight
- Celebration animations, empty states, loading skeletons, keyboard shortcuts on desktop (`n` new task, `t` today, `←/→` period), accessibility pass (labels, focus, contrast), performance pass, error monitoring (Laravel log + optional Sentry).
- Stretch: radial "clock" Day view; natural-language Quick Add; drag-to-time on mobile.

---

## 10. Conventions (put these in CLAUDE.md)

- Timezone `America/New_York` by default; store datetimes in UTC, dates as `DATE`, times as `TIME` in the user's local zone.
- Weeks start **Monday** (ISO).
- Every user-facing list respects the person filter.
- All Google calls go through service classes (`GoogleTasksService`, `GoogleCalendarService`) behind interfaces so they can be mocked in tests.
- Never block the UI on Google; all pushes are queued.
- Secrets only in `.env` (server) and GitHub Actions secrets. Never commit credentials or tokens.
- Small, focused commits; a branch and PR per phase; screenshots in each PR at mobile and desktop widths.
- When a requirement here conflicts with the live Google API behavior, stop and tell Dustin rather than inventing a workaround.

---

## 11. Open Questions for Dustin (answer before the dependent phase)

| # | Question | Needed by | Default if unanswered |
|---|---|---|---|
| 1 | What application type and PHP version is the Cloudways app (Custom PHP or Laravel)? Is SSH access enabled? | Phase 0 | Claude Code inspects and reports. |
| 2 | ~~Shared or separate planners?~~ **Answered: one shared planner for now.** | — | — |
| 3 | ~~Menu calendar?~~ **Answered: meals are planned in Chef (chef.dustindellinger.com), which writes to a calendar on Dustin's Google account (dustindellinger@gmail.com).** The planner reads it. Remaining: can Claude Code get read access to the Chef repo? | Phase 10 | Inspect the calendar's events to learn the format. |
| 4 | ~~Only 4 You icon?~~ **Answered: logo provided** (`only-4-you-logo.png` + line version `only-4-you.svg`; see Assets). | — | — |
| 5 | Google Tasks has no star in its API. OK to mirror stars as a `⭐` title prefix in Google Tasks? | Phase 9 | Yes, mirror with prefix. |
| 6 | Google Tasks **without a due date**: send to the Brain Dump, or put them somewhere else? | Phase 9 | Brain Dump → Other. |
| 7 | What are the exact names of your existing Google Task lists (and Elizabeth's)? | Phase 9 | Map by matching category names; offer to create missing lists. |
| 8 | Weight in lb? Is weight tracked for both of you, and is each person's weight private to them? | Phase 8 | lb; per user; each user sees only their own by default. |
| 9 | Which routine/habit reminders do you want, and at what times? | Phase 12 | Morning 7:00 AM, Evening 8:30 PM, weekly planning Sunday 7:00 PM. |
| 10 | Rewards: shared between you both, or per person? | Phase 8 | Shared, with optional beneficiary. |
| 11 | Should a single Saturday/Sunday "Weekend Reflection" prompt be kept (the printed book had one), or is Daily Gratitude enough? | Phase 3 | Keep an optional reflection prompt on Sundays. |

---

## 12. Inspiration Reference (what to take from each image)

| File | Take from it |
|---|---|
| `brain-dump-template-1024x1024.jpg` | Brain Dump board layout: labelled boxes with icons (Call ☎, Email ✉, Buy 🛒), checkbox circles, a "Top 3" box (map to starring). |
| `81ThQ5pAUCL…webp` (habit tracker poster) | **Radial monthly habit tracker**, plus daily/weekly habit columns. |
| `75ecbdda…jpg` (housework + meals spread) | **Weekly M–S check grid** for routines/housework; **Mon–Sun meal list** with day labels in highlighter colors; "Morning Routine" tracker. |
| `Bullet Journal Inspiration.jpeg` | Month log layout, colored highlighter headings, small habit squares beside the day, quotes/affirmation area. |
| `a05490662272…jpg` ("LM clock") | Radial 24-hour day ring. Stretch goal for an alternate Day view. |
| `22996e028eb4…jpg` ("Plan Your Week in 15 Minutes") | The **weekly planning flow**: Capture → Filter → Big 3 → Time-block → Reset; Goals → Week → Day layering; Friday/Sunday review prompts. |
| `2026_Complete_Planner (1).pdf` / `2026 Planner.pdf` | Source structure of the printed planner (see Section 1 table). |
