# My Planner

A web app that replaces the printed yearly planner (a bullet journal) Dustin builds every year.
Live at https://plan.dustindellinger.com. Two users, Dustin and Elizabeth, share one planner.

The full build plan is [docs/PLAN.md](docs/PLAN.md). Work one phase at
a time, on a branch per phase, and open a PR at the end of each phase with a short summary and
screenshots at mobile and desktop widths. Stop for Dustin's review after each PR. Anything under
the plan's Open Questions must be confirmed with Dustin before building the part that depends on it.

## Project context

The printed book has a Year page, 4 Quarter pages, 12 Month pages, 52 Week pages and a page per
day. The app keeps that structure but is not a digital copy of the book: it should be faster to
plan with, fun to use, and connected to Google Tasks and Google Calendar.

Every page is organized into the same categories:

| Category   | Notes                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| Health     | Includes weight tracking. Many tasks belong to morning/evening routines. |
| Finances   |                                                                        |
| Home       | Many tasks belong to morning/evening routines.                         |
| Family     |                                                                        |
| Only 4 You | Dustin's music project. Has its own custom icon.                       |
| Other      | Tasks that don't fit a category.                                       |

What each view carries over from the book:

- **Year:** 1-year goals by category; Q1–Q4 overview.
- **Quarter:** quarter goals by category (+ weight goal); the three months at a glance.
- **Month:** "Best Part About This Month"; monthly goals by category (+ weight); important dates.
- **Week:** "Best Part About This Week"; weekly goals by category (+ weight); meal plan Mon–Sun.
- **Day:** gratitude; affirmation; main tasks by category (+ weight); meals; today's events.
- Saturday and Sunday use the normal Day view. Notes and Shopping List are dropped.

Beyond the book: checkboxes everywhere, optional times on tasks, recurring and starred tasks,
morning/evening routines and a habit tracker, affirmation carry-over, period rollover review,
a weekly planning flow, weight tracking, rewards, a Brain Dump page, push notifications, two-way
Google Tasks and Google Calendar sync, and meals read from Chef (https://chef.dustindellinger.com)
through its "Menu" Google Calendar. The planner never writes meals.

## Stack

| Concern         | Choice                                                                     |
| --------------- | -------------------------------------------------------------------------- |
| Backend         | Laravel 13, PHP 8.3+                                                       |
| Database        | MySQL/MariaDB on Cloudways; SQLite locally and in tests                    |
| Frontend        | React + TypeScript + Vite, served by Laravel as a single-page app          |
| Layout          | Bootstrap 5 (SCSS) for grid and utilities only; custom components on top   |
| Icons           | Lucide line icons, plus the custom Only 4 You icon                         |
| Data fetching   | TanStack Query (optimistic updates for the instant checkbox feel)          |
| Auth            | Google sign-in (Socialite) with a two-email allowlist; Sanctum SPA session |
| Google APIs     | google/apiclient: Tasks API v1, Calendar API v3                            |
| Background work | Laravel scheduler via Cloudways cron; database queue driver                |
| Push            | Web Push (VAPID); the app is a PWA with a service worker                   |
| Deploy          | GitHub Actions builds, then rsyncs over SSH to Cloudways                   |
| Tests           | Pest for PHP; Vitest + Testing Library for components                      |

## Commands

```sh
composer dev          # PHP server, queue worker, logs and Vite together
php artisan test      # Pest
vendor/bin/pint       # format PHP
npm test              # Vitest
npm run typecheck
npm run lint
npm run format        # Prettier
npm run build
```

## Layout

- `resources/js/main.tsx` is the Vite entry; `App.tsx` is the root component. Don't add a file
  whose name differs from another only by case: the repo is developed on Windows.
- `resources/js/components/AppShell.tsx` is the frame around every signed-in page: the left
  rail (tablet and up), the bottom bar (phones) and the quick-add button. Pages live in
  `resources/js/pages/`; the Day, Week, Month, Quarter and Year views share `PeriodPage.tsx`.
- `resources/js/api/` holds the fetch client and the TanStack Query hooks. Item changes are
  optimistic: the cache updates first and rolls back if the request fails.
- `resources/scss/` holds the styles: `_tokens.scss` (colors, fonts, dark mode), `_shell.scss`
  (navigation and page frame) and `_components.scss`.

## Design system

- Colors and fonts are CSS custom properties on `:root` in `_tokens.scss`, with a second set
  under `[data-bs-theme='dark']`. The theme follows the device setting.
- Category colors come from the API. Wrap anything category-colored in an element with the
  `cat` class and set `--cat` inline; `--cat-strong` and `--cat-highlight` derive from it.
- Sections are `planner-card` boxes with an ink border, not shadows. Headings that name a
  category use `highlight-heading`. The hand-lettered display font is for titles only.
- Every category icon renders through `CategoryIcon`; checkable rows through `TaskRow`.
- Bootstrap supplies the grid, reset and utilities only. Don't use its components.
- Check new screens at 375, 768, 1280 and 1920 px wide, in light and dark mode.
- `routes/web.php` serves `/health` and Google sign-in under `/auth`, and falls through to the
  SPA for every other path. `routes/api.php` is the JSON API, all behind `auth:sanctum`.
- `app/Support/Period.php` and `resources/js/lib/period.ts` are twins. Their tests share the
  same cases; change both together.
- `docs/` holds the plan, deployment notes, Google API notes and inspiration images.

## Data model notes

- Household data uses the `BelongsToHousehold` trait: a global scope limits every query to the
  signed-in user's household and new rows are stamped with it. In jobs and commands there is no
  signed-in user, so set `household_id` explicitly and filter by it yourself.
- "Both people" is a null user id: `items.assignee_user_id` and `rewards.beneficiary_user_id`.
- Weight and journal entries are per person; everything else is shared by the household.
- Categories are seeded by a migration, so `migrate` alone sets up production.
- A repeating task is a series of ordinary items (`app/Services/RecurrenceService.php`). The
  first occurrence holds the RRULE and has no `recurrence_parent_id`; the rest point at it.
  `recurrence_date` is the date the rule produced an occurrence for and never changes, which is
  what stops a moved or deleted occurrence from being generated again. Occurrences exist 60
  days ahead, topped up by a daily scheduled job and whenever items are listed.
- Carrying a goal forward at a rollover copies it into the later period with
  `carried_from_item_id` set and marks the original `dropped`, so it stops counting against
  the period it left. A `period_reviews` row records that a household finished reviewing a
  period, even with items left open.
- A week goal pulled from a month goal, and a day task placed from a week goal, point at their
  source with `parent_item_id`. Finishing one offers to finish the source (`ParentPrompt`).
- Habit streaks and 30-day completion are computed in `app/Support/HabitStats.php`: daily
  habits streak in days, habits with a weekly target in weeks that met it, and a day or week
  still under way never breaks a streak. The `habits` query key holds both lists of habits and
  the stats object, so cache updaters must check `Array.isArray` before mapping.
- Brain Dump buckets are an enum, not categories. Each maps to a default category for
  "Add to Plan" (`BrainDumpBucket::defaultCategorySlug` on the server, `BUCKETS` in
  `resources/js/api/brainDump.ts`); keep the two in step. An item leaves the board when its
  `assigned_item_id` is set.
- A reward is earned when every linked task that still counts is done by the deadline, and
  expires if the deadline passes first (`app/Services/RewardEvaluator.php`). Dropped and deleted
  tasks stop counting. It is re-checked when a linked task changes, when rewards are listed or
  edited, and nightly. Earned, expired and claimed are final, except that giving an expired
  reward a later deadline reopens it.
- The weight chart is hand-drawn SVG (`WeightChart.tsx`), sized to its container. Its line
  color is the `--chart-line` token, which was checked with the dataviz palette validator on
  both themes; re-run it if the color changes. Goals are drawn as neutral levels, not series.
- An important date that repeats yearly is stored once; the API returns it with `occurs_on`
  for each year in the range asked for.
- Goal counts for the Quarter and Year views come from `/api/items/summary`, cached under the
  `item-summary` query key (not `items`, whose caches are lists that optimistic updates edit).
- Google sync lives in `app/Services/Google/`. It calls Google's REST APIs with Laravel's HTTP
  client (no `google/apiclient`), behind `GoogleTasksService`, `GoogleCalendarService` and
  `GoogleContactsService` so
  tests swap in `tests/Fakes/`. Tests forbid stray HTTP requests.
- Signing in grants no API access. Each person connects from Settings (`/auth/google/connect`),
  which asks for Tasks and read-only Contacts; `GoogleAccount::hasGranted()` is the check.
  A revoked grant sets `needs_reconnect` and sync stops until they reconnect.
- Only day-scope tasks sync, each to the Google list mapped to its category
  (`google_task_lists.category_id`), in the account of its assignee (its creator for "Both").
  A star is a `⭐ ` title prefix and a time is a first `⏰ 3:30 PM` notes line
  (`TaskFormat`). Saving an item marks it `dirty` and queues `PushItemToGoogle`; `google:sync`
  polls every five minutes; the newer side wins a conflict. Occurrences of a repeating task
  are sent seven days ahead. `TaskSync::pending()` is the one definition of "waiting to send".
- A Google task with no due date becomes a Brain Dump "Other" item that keeps its Google ids;
  adding it to the plan carries them onto the item, in the category of the list it came from.
- Calendar sync (`CalendarSync`) reads each calendar a person set to "Show events" into
  `events`, and the one set to "Meals from Chef" into `meal_entries` through `ChefMealParser`
  (format in `docs/chef-calendar-format.md`); that calendar is never written to. It asks Google
  for a window of days (60 back, 365 ahead) with repeating events expanded: changes every
  poll, the whole window once a day. There is no sync token.
- Events made in the planner go to their maker's primary Google calendar. An event is
  `editable` unless it is on a read-only calendar or is one occurrence of a repeating event.
  Timed events are stored in UTC, all-day events as first and last day (`ends_on` inclusive,
  unlike Google's). The API returns both people's events; the client filters by person and
  drops duplicates from a calendar both follow (`eventsFor` in `resources/js/api/events.ts`).
- An important date with `add_to_calendar` is mirrored as an all-day (yearly) Google event.
  Its occurrences are skipped when the calendar is read, so it isn't shown twice.
- A 403 from Google is a `GoogleAuthException` with `revoked: false`: the request was refused
  but reconnecting would not help. Calendar sync only asks to reconnect when `revoked`.
- Contacts' birthdays are `important_dates` rows with `source = google_contacts`, owned by the
  person whose contacts they are, shown to the household, read-only in the planner, and stored
  in year 1904 when the contact has no birth year.
- The queue is the database driver, drained every minute by the scheduler (`routes/console.php`),
  so the server needs no worker process beyond the cron entry.
- Scrolling containers that hold task rows need `position: relative`: Bootstrap's
  `visually-hidden` text is absolutely positioned and otherwise widens the whole page.
- On the Day view, tasks with a `routine` appear in the routine checklists and not in the
  category boxes. Every item editor goes through `ItemSheet`, opened with `useItemEditor()`.
- Controllers return models directly. Dates serialize as `YYYY-MM-DD`, item times as `HH:MM`.
- Tests run on SQLite locally; CI runs them again on MariaDB, which is what production uses.

## Conventions

- Timezone is America/New_York by default. Store datetimes in UTC, dates as DATE, and times as
  TIME in the user's local zone.
- Weeks start Monday (ISO weeks).
- Every user-facing list respects the person filter (Dustin / Elizabeth / Both).
- All Google calls go through service classes (`GoogleTasksService`, `GoogleCalendarService`,
  `GoogleContactsService`) behind interfaces so they can be mocked in tests.
- Never block the UI on Google; all pushes to Google are queued.
- Secrets live only in the server's `.env` and in GitHub Actions secrets. Never commit
  credentials or tokens.
- Small, focused commits; a branch and PR per phase; screenshots in each PR at mobile and
  desktop widths.
- When a requirement conflicts with live Google API behavior, stop and tell Dustin instead of
  inventing a workaround.
