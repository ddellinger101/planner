<?php

namespace App\Models;

use App\Enums\BrainDumpBucket;
use App\Models\Concerns\BelongsToHousehold;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BrainDumpItem extends Model
{
    use BelongsToHousehold;

    protected $guarded = [];

    protected $attributes = ['sort' => 0];

    protected $hidden = ['google_task_id', 'google_task_list_id', 'google_etag', 'googleTaskList'];

    protected $appends = ['from_google', 'suggested_category_id'];

    protected function casts(): array
    {
        return [
            'bucket' => BrainDumpBucket::class,
            'assigned_at' => 'datetime',
        ];
    }

    public function assignedItem(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'assigned_item_id');
    }

    public function googleTaskList(): BelongsTo
    {
        return $this->belongsTo(GoogleTaskList::class);
    }

    /** True for an undated task that arrived from Google Tasks. */
    protected function fromGoogle(): Attribute
    {
        return Attribute::get(fn () => $this->google_task_id !== null);
    }

    /**
     * The category to pre-select when this is added to the plan. A task from
     * Google belongs to the category of the list it came from, so planning
     * it doesn't move it to another list.
     */
    protected function suggestedCategoryId(): Attribute
    {
        return Attribute::get(fn () => $this->googleTaskList?->category_id);
    }
}
