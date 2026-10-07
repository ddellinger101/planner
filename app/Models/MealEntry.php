<?php

namespace App\Models;

use App\Enums\MealSlot;
use App\Models\Concerns\BelongsToHousehold;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;

class MealEntry extends Model
{
    use BelongsToHousehold;

    protected $guarded = [];

    protected $hidden = ['etag', 'google_event_id', 'google_calendar_id'];

    protected $appends = ['source'];

    protected function casts(): array
    {
        return [
            'slot' => MealSlot::class,
            'date' => 'date:Y-m-d',
        ];
    }

    /** "chef" for a meal read from Chef's calendar; "note" for one typed into the planner. */
    protected function source(): Attribute
    {
        return Attribute::get(fn () => $this->google_event_id !== null ? 'chef' : 'note');
    }

    /**
     * The slots that are shown in the same place as this one: a meal Chef
     * didn't label is shown with dinner.
     *
     * @return list<MealSlot>
     */
    public static function slotsShownAs(MealSlot $slot): array
    {
        return in_array($slot, [MealSlot::Dinner, MealSlot::Unknown], true)
            ? [MealSlot::Dinner, MealSlot::Unknown]
            : [$slot];
    }
}
