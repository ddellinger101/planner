# Google API limitations: verification

Checked on October 6, 2026 against Google's live documentation. Nothing has changed from what
the plan assumes.

| # | Plan's assumption                                             | Result    | Source                         |
| - | ------------------------------------------------------------- | --------- | ------------------------------ |
| 1 | Tasks stores a due date only; the time is discarded           | Confirmed | Tasks REST reference, `due`    |
| 2 | Starred tasks are not exposed                                 | Confirmed | No such field on the resource  |
| 3 | Recurrence rules are not exposed                              | Confirmed | No such field on the resource  |
| 4 | No push/webhook for Tasks                                     | Confirmed | Methods: clear, delete, get, insert, list, move, patch, update |
| 5 | Calendar supports incremental sync with `syncToken`           | Not re-checked | Long-standing behavior; verify in Phase 10 |
| 6 | Refresh tokens expire after 7 days while the app is "Testing" | Confirmed | OAuth 2.0 overview             |

The `due` field's documentation reads: "Only date information is recorded; the time portion of
the timestamp is discarded when setting this field."

On item 6, Google exempts apps that request only the name, email and profile scopes. The planner
requests Tasks and Calendar scopes, so the exemption doesn't apply and the consent screen must be
published to "In production".

The Task resource also has an `assignmentInfo` field, which the plan doesn't mention. It
describes tasks assigned from Google Docs or Chat spaces and has no bearing on the sync design.

Sources:

- https://developers.google.com/workspace/tasks/reference/rest/v1/tasks
- https://developers.google.com/identity/protocols/oauth2
