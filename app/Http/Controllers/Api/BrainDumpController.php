<?php

namespace App\Http\Controllers\Api;

use App\Enums\BrainDumpBucket;
use App\Enums\ItemSource;
use App\Enums\Scope;
use App\Http\Controllers\Controller;
use App\Models\BrainDumpItem;
use App\Models\Category;
use App\Models\GoogleTaskList;
use App\Models\Item;
use App\Rules\PeriodKey;
use App\Services\Google\GoogleTasksService;
use App\Services\RecurrenceService;
use App\Support\Period;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Throwable;

class BrainDumpController extends Controller
{
    public function __construct(private RecurrenceService $recurrence) {}

    public function index(Request $request): JsonResponse
    {
        $week = Period::today(Scope::Week, $request->user()->timezone);

        return response()->json([
            // Items stay on the board until they are added to the plan.
            'items' => BrainDumpItem::whereNull('assigned_item_id')
                ->with('googleTaskList')
                ->orderBy('sort')
                ->orderBy('id')
                ->get(),
            'assigned_this_week' => BrainDumpItem::whereNotNull('assigned_at')
                ->where('assigned_at', '>=', $week->start->shiftTimezone($request->user()->timezone)->utc())
                ->count(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'bucket' => ['required', Rule::enum(BrainDumpBucket::class)],
            'title' => ['required', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'sort' => ['integer', 'min:0'],
        ]);

        $item = BrainDumpItem::create([...$data, 'created_by' => $request->user()->id]);

        return response()->json($item->refresh(), 201);
    }

    public function update(Request $request, BrainDumpItem $brainDumpItem): JsonResponse
    {
        $brainDumpItem->update($request->validate([
            'bucket' => [Rule::enum(BrainDumpBucket::class)],
            'title' => ['sometimes', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'sort' => ['integer', 'min:0'],
        ]));

        return response()->json($brainDumpItem->refresh());
    }

    public function destroy(Request $request, BrainDumpItem $brainDumpItem, GoogleTasksService $google): Response
    {
        // Deleting something that came from Google Tasks deletes it there too,
        // or the next poll would bring it straight back.
        $list = $brainDumpItem->google_task_id ? GoogleTaskList::find($brainDumpItem->google_task_list_id) : null;

        if ($list !== null && $list->googleAccount->canSyncTasks()) {
            try {
                $google->deleteTask($list->googleAccount, $list->google_list_id, $brainDumpItem->google_task_id);
            } catch (Throwable $e) {
                // Already gone, or Google is unreachable: the poll will settle it.
            }
        }

        $brainDumpItem->delete();

        return response()->noContent();
    }

    /** "Add to Plan": turn the brain-dump item into a planner item. */
    public function assign(Request $request, BrainDumpItem $brainDumpItem): JsonResponse
    {
        abort_if($brainDumpItem->assigned_item_id !== null, 409, 'This item is already in the plan.');

        $data = $request->validate([
            'period_key' => ['required', new PeriodKey],
            'category_id' => ['integer', Rule::exists('categories', 'id')],
            'due_time' => ['nullable', 'date_format:H:i'],
            'starred' => ['boolean'],
            'recurrence_rule' => [
                'nullable', 'string', 'max:255',
                function (string $attribute, mixed $value, Closure $fail) {
                    if (! RecurrenceService::isValidRule($value)) {
                        $fail('The :attribute is not a valid recurrence rule.');
                    }
                },
            ],
        ]);

        $period = Period::parse($data['period_key']);
        $isDay = $period->scope === Scope::Day;

        $item = DB::transaction(function () use ($request, $brainDumpItem, $data, $period, $isDay) {
            $item = Item::create([
                'title' => $brainDumpItem->title,
                'notes' => $brainDumpItem->notes,
                'category_id' => $data['category_id']
                    ?? $brainDumpItem->suggested_category_id
                    ?? Category::where('slug', $brainDumpItem->bucket->defaultCategorySlug())->value('id'),
                'scope' => $period->scope,
                'period_key' => $period->key(),
                'due_date' => $isDay ? $period->key() : null,
                'due_time' => $isDay ? ($data['due_time'] ?? null) : null,
                'starred' => $data['starred'] ?? false,
                // Only day tasks repeat.
                'recurrence_rule' => $isDay ? ($data['recurrence_rule'] ?? null) : null,
                // A task that came from Google keeps its link, so planning it
                // here gives the Google task its date instead of making a second one.
                'source' => $brainDumpItem->google_task_id ? ItemSource::GoogleTasks : ItemSource::BrainDump,
                'google_task_id' => $brainDumpItem->google_task_id,
                'google_task_list_id' => $brainDumpItem->google_task_list_id,
                'google_etag' => $brainDumpItem->google_etag,
                'created_by' => $request->user()->id,
                'assignee_user_id' => $isDay ? $request->user()->id : null,
            ]);

            $brainDumpItem->update(['assigned_item_id' => $item->id, 'assigned_at' => now()]);

            if ($item->recurrence_rule) {
                $this->recurrence->start($item, $request->user());
            }

            return $item;
        });

        return response()->json($item->refresh(), 201);
    }
}
