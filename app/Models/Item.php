<?php

namespace App\Models;

use App\Enums\ItemSource;
use App\Enums\ItemStatus;
use App\Enums\Routine;
use App\Enums\Scope;
use App\Enums\SyncState;
use App\Jobs\PushItemToGoogle;
use App\Models\Concerns\BelongsToHousehold;
use App\Services\Google\TaskSync;
use App\Services\RewardEvaluator;
use Database\Factories\ItemFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Item extends Model
{
    /** @use HasFactory<ItemFactory> */
    use BelongsToHousehold, HasFactory, SoftDeletes;

    protected $guarded = [];

    /** Set while saving a change that should be sent to Google once it is stored. */
    public bool $pushAfterSave = false;

    /** The fields a Google task mirrors. */
    private const SYNCED_FIELDS = [
        'title', 'notes', 'period_key', 'due_date', 'due_time', 'starred', 'status', 'category_id', 'assignee_user_id',
    ];

    protected $attributes = [
        'status' => 'open',
        'starred' => false,
        'source' => 'app',
        'sync_state' => 'clean',
        'sort' => 0,
    ];

    protected function casts(): array
    {
        return [
            'scope' => Scope::class,
            'status' => ItemStatus::class,
            'routine' => Routine::class,
            'source' => ItemSource::class,
            'sync_state' => SyncState::class,
            'due_date' => 'date:Y-m-d',
            'recurrence_date' => 'date:Y-m-d',
            'starred' => 'boolean',
            'completed_at' => 'datetime',
            'google_updated_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // completed_at follows status, whoever changes it.
        static::saving(function (Item $item) {
            if ($item->isDirty('status')) {
                $item->completed_at = $item->status === ItemStatus::Done
                    ? ($item->completed_at ?? now())
                    : null;
            }

            // A change Google should hear about, unless it came from Google.
            if (
                $item->scope === Scope::Day
                && ! TaskSync::isApplyingRemote()
                && $item->isDirty(self::SYNCED_FIELDS)
                && TaskSync::accountFor($item)?->canSyncTasks()
            ) {
                $item->sync_state = SyncState::Dirty;
                $item->pushAfterSave = true;
            }
        });

        static::saved(function (Item $item) {
            // A task finishing, reopening or going away can earn a reward.
            if ($item->wasChanged('status')) {
                app(RewardEvaluator::class)->evaluateForItem($item);
            }

            if ($item->pushAfterSave) {
                $item->pushAfterSave = false;
                PushItemToGoogle::dispatch($item->id)->afterCommit();
            }
        });

        static::deleted(function (Item $item) {
            app(RewardEvaluator::class)->evaluateForItem($item);

            // A soft delete skips the saving hook, so flag it for Google here.
            if ($item->google_task_id !== null && ! TaskSync::isApplyingRemote()) {
                $item->newQueryWithoutScopes()->whereKey($item->id)->update(['sync_state' => SyncState::Dirty]);
                PushItemToGoogle::dispatch($item->id)->afterCommit();
            }
        });
    }

    /** Always HH:MM; MySQL returns TIME columns with seconds. */
    protected function dueTime(): Attribute
    {
        return Attribute::get(fn (?string $value) => $value === null ? null : substr($value, 0, 5));
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_user_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_item_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_item_id');
    }

    public function carriedFrom(): BelongsTo
    {
        return $this->belongsTo(self::class, 'carried_from_item_id');
    }
}
