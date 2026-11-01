<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One-time cleanup of goals that piled up as duplicates in November 2026, before
 * adding, pulling and carrying learned to recognize a goal already in a period.
 * The extras are dropped, not deleted. Anything that has changed since this list
 * was made (a new title, already closed, or part of a reward) is left alone.
 */
return new class extends Migration
{
    /** The goal to keep, its title, and the goals it replaces. */
    private const MERGES = [
        // November
        [763, 'Quit smoking', [33 => 'Quit smoking']],
        [544, 'Gym 3x a week', [750 => 'Gym 3x a week']],
        [751, 'Limit drinking to 2 days a week', [546 => 'Drink less', 762 => 'Cut the drinking']],
        [760, 'Keep paying credit cards', [547 => 'Credit cards']],
        [759, 'Get the house insulated for winter', [34 => 'Insulate the house']],
        [764, 'Visit my parents', [548 => 'Visit parents']],
        // Week 45
        [789, 'Quit smoking', [766 => 'Quit smoking']],
        [785, 'Gym 3x a week', [776 => 'Gym 3x a week']],
        [790, 'Limit drinking to 2 days a week', [781 => 'Cut the drinking', 787 => 'Drink less']],
        [772, 'Home workout 3x a week', [791 => 'Home Workout 2x']],
        [778, 'Finish The Boy Who Could Fly', [797 => 'Finish The Boy Who Could Fly', 798 => 'Boy Who Could Fly']],
        [796, 'Finish Funny Farm', [799 => 'Funny Farm']],
        [779, 'Structure our practices with a “lesson plan”', [795 => 'Structure our practices with a “lesson plan”']],
        // Week 46
        [768, 'Get the house insulated for winter', [770 => 'Insulate the house']],
        // Week 47
        [783, 'Visit my parents', [774 => 'Visit parents']],
    ];

    /** Kept goals whose link pointed at last month's closed copy, or at nothing. */
    private const PARENTS = [751 => 513, 790 => 751, 796 => 752];

    public function up(): void
    {
        DB::transaction(function () {
            foreach (self::MERGES as [$keepId, $keepTitle, $extras]) {
                if (! $this->isOpen($keepId, $keepTitle)) {
                    continue;
                }

                foreach ($extras as $id => $title) {
                    if ($this->isOpen($id, $title) && ! DB::table('reward_items')->where('item_id', $id)->exists()) {
                        DB::table('items')->where('parent_item_id', $id)->update(['parent_item_id' => $keepId]);
                        DB::table('items')->where('id', $id)->update(['status' => 'dropped', 'updated_at' => now()]);
                    }
                }
            }

            foreach (self::PARENTS as $id => $parentId) {
                if (DB::table('items')->where('id', $parentId)->where('status', 'open')->exists()) {
                    DB::table('items')->where('id', $id)->where('status', 'open')->update(['parent_item_id' => $parentId]);
                }
            }
        });
    }

    private function isOpen(int $id, string $title): bool
    {
        return DB::table('items')
            ->where('id', $id)
            ->where('title', $title)
            ->where('status', 'open')
            ->whereNull('deleted_at')
            ->exists();
    }

    public function down(): void
    {
        // Which goals were dropped here can be read from the lists above, but
        // dropping one was the point: there's nothing to put back automatically.
    }
};
