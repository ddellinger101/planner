<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('google_task_lists', function (Blueprint $table) {
            // Null until the list's first full import.
            $table->timestamp('last_synced_at')->nullable();
        });

        Schema::table('google_accounts', function (Blueprint $table) {
            $table->boolean('sync_birthdays')->default(true);
            $table->timestamp('birthdays_synced_at')->nullable();
        });

        // A Google task with no due date waits on the Brain Dump; these link
        // the two so it isn't imported again on every poll.
        Schema::table('brain_dump_items', function (Blueprint $table) {
            $table->string('google_task_id')->nullable()->index();
            $table->foreignId('google_task_list_id')->nullable()->constrained()->nullOnDelete();
            $table->string('google_etag')->nullable();
        });

        Schema::table('important_dates', function (Blueprint $table) {
            // "app" for dates typed in; "google_contacts" for synced birthdays.
            $table->string('source')->default('app');
            $table->string('google_resource_name')->nullable();
            // Whose contacts a synced birthday came from.
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->cascadeOnDelete();

            $table->unique(['owner_user_id', 'google_resource_name']);
        });
    }

    public function down(): void
    {
        Schema::table('important_dates', function (Blueprint $table) {
            $table->dropUnique(['owner_user_id', 'google_resource_name']);
            $table->dropConstrainedForeignId('owner_user_id');
            $table->dropColumn(['source', 'google_resource_name']);
        });

        Schema::table('brain_dump_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('google_task_list_id');
            $table->dropColumn(['google_task_id', 'google_etag']);
        });

        Schema::table('google_accounts', function (Blueprint $table) {
            $table->dropColumn(['sync_birthdays', 'birthdays_synced_at']);
        });

        Schema::table('google_task_lists', function (Blueprint $table) {
            $table->dropColumn('last_synced_at');
        });
    }
};
