<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // How many periods this goal has rolled over from, since it was last reworded.
            $table->unsignedSmallInteger('times_carried')->default(0)->after('carried_from_item_id');
        });

        // Goals already carried start with the count they've earned. A copy
        // always has a later id than what it came from, so in id order each
        // goal's count is known by the time something is carried from it.
        $counts = [];

        DB::table('items')->whereNotNull('carried_from_item_id')->orderBy('id')
            ->get(['id', 'carried_from_item_id'])
            ->each(function ($item) use (&$counts) {
                $counts[$item->id] = ($counts[$item->carried_from_item_id] ?? 0) + 1;

                DB::table('items')->where('id', $item->id)->update(['times_carried' => $counts[$item->id]]);
            });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('times_carried');
        });
    }
};
