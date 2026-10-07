<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('google_accounts', function (Blueprint $table) {
            $table->timestamp('calendar_last_synced_at')->nullable();
        });

        Schema::table('google_calendars', function (Blueprint $table) {
            // The account's own calendar: where events made in the planner go.
            $table->boolean('is_primary')->default(false);
            // Google's accessRole: owner, writer, reader or freeBusyReader.
            $table->string('access_role')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            // The last time the whole window was re-read, not just what changed.
            $table->timestamp('full_synced_at')->nullable();
        });

        Schema::table('events', function (Blueprint $table) {
            // Set on an occurrence of a repeating Google event.
            $table->string('recurring_event_id')->nullable();
            $table->string('html_link', 1024)->nullable();
        });

        Schema::table('important_dates', function (Blueprint $table) {
            // Whether this date should also be an event in Google Calendar,
            // and the event that was made for it.
            $table->boolean('add_to_calendar')->default(false);
            $table->string('google_event_id')->nullable()->index();
            $table->foreignId('google_calendar_id')->nullable()->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('important_dates', function (Blueprint $table) {
            $table->dropConstrainedForeignId('google_calendar_id');
            $table->dropIndex(['google_event_id']);
            $table->dropColumn(['add_to_calendar', 'google_event_id']);
        });

        Schema::table('events', function (Blueprint $table) {
            $table->dropColumn(['recurring_event_id', 'html_link']);
        });

        Schema::table('google_calendars', function (Blueprint $table) {
            $table->dropColumn(['is_primary', 'access_role', 'last_synced_at', 'full_synced_at']);
        });

        Schema::table('google_accounts', function (Blueprint $table) {
            $table->dropColumn('calendar_last_synced_at');
        });
    }
};
