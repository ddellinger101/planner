<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A meal can now be a note typed into the planner, which has no Google
     * event behind it. Chef's meals keep theirs.
     */
    public function up(): void
    {
        Schema::table('meal_entries', function (Blueprint $table) {
            $table->string('google_event_id')->nullable()->change();
            $table->unsignedBigInteger('google_calendar_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('meal_entries', function (Blueprint $table) {
            $table->string('google_event_id')->nullable(false)->change();
            $table->unsignedBigInteger('google_calendar_id')->nullable(false)->change();
        });
    }
};
