<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** The notes Google Calendar keeps with an event, shown when it is opened. */
    public function up(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->text('description')->nullable();
        });

        // Read every calendar afresh on the next sync, so events already here get theirs.
        DB::table('google_calendars')->update(['full_synced_at' => null]);
    }

    public function down(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->dropColumn('description');
        });
    }
};
