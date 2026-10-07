<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // The date the recurrence rule produced this occurrence for. It
            // stays put when the task is moved, so the occurrence is never
            // generated a second time.
            $table->date('recurrence_date')->nullable()->after('recurrence_parent_id');
            $table->index(['recurrence_parent_id', 'recurrence_date']);
        });

        Schema::table('users', function (Blueprint $table) {
            // The hours the Day view's timeline covers, in the user's timezone.
            $table->unsignedTinyInteger('day_start_hour')->default(6);
            $table->unsignedTinyInteger('day_end_hour')->default(23);
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropIndex(['recurrence_parent_id', 'recurrence_date']);
            $table->dropColumn('recurrence_date');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['day_start_hour', 'day_end_hour']);
        });
    }
};
