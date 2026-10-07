# Chef's calendar events

How Chef (chef.dustindellinger.com) writes the meal plan to Google Calendar, and how the
planner reads it. This was taken from Chef's code (`app/Services/Google/GoogleCalendar.php`
and `app/Enums/MealSlot.php` in the Chef application), not guessed from samples. If Chef's
format changes, update `app/Services/Google/ChefMealParser.php` and its tests with it.

## What Chef writes

One event per meal slot that has something in it. Chef writes one way: it never reads the
calendar back, and it overwrites an event the next time its slot changes. Emptying a slot
deletes its event.

| Field       | Value                                                                              |
| ----------- | ---------------------------------------------------------------------------------- |
| Time        | Timed, never all-day, in Chef's household time zone                                |
| Breakfast   | 8:00 AM, 30 minutes                                                                |
| Lunch       | 12:30 PM, 30 minutes                                                               |
| Dinner      | 6:00 PM, 60 minutes                                                                |
| Title       | The main dish's name. With no main dish: `Lunch: Sandwiches, Fruit`                |
| Description | See below                                                                          |
| Source      | Title "What's For Dinner", linking to Chef                                         |
| Reminders   | None                                                                               |

Chef has no snack slot.

The description lists every dish, main dish first, then the servings and a link to that day:

```
• Chicken Tikka Masala
• Naan
• Cucumber salad

Serves 4.
https://chef.dustindellinger.com/tonight?date=2027-01-05
```

## How the planner reads it

- **Slot**: from a `Breakfast:` / `Lunch:` / `Dinner:` / `Snack:` prefix in the title when
  there is one (the prefix is then dropped from the title). Otherwise from the start time:
  before 11 AM is breakfast, before 3 PM is lunch, later is dinner. An all-day event, which
  only a person adding one by hand would create, has no slot and is shown with dinner.
- **Date**: the day the event starts on in the planner user's time zone.
- **Sides**: the `•` lines other than the main dish, shown as "with Naan, Cucumber salad".
- **Link**: the first URL in the description, which opens that day in Chef.

A day and slot with no Chef meal can hold a note typed into the planner. The note is deleted
when Chef's event for that day and slot is read, so Chef's plan always wins.

The planner never writes to this calendar. Meals are household-wide: they come through
whichever person's Google account has the calendar set to "Meals from Chef" in Settings.
