<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('households', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('household_id')->nullable()->after('id')->constrained();
            $table->string('avatar_url', 2048)->nullable();
            $table->string('color', 7)->default('#2f8f83');
            $table->string('timezone')->default('America/New_York');
            $table->json('notification_preferences')->nullable();
            // Sign-in is Google only.
            $table->string('password')->nullable()->change();
        });

        Schema::create('google_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('google_sub')->unique();
            $table->string('email');
            $table->text('refresh_token')->nullable();
            $table->text('access_token')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->json('scopes')->nullable();
            $table->boolean('needs_reconnect')->default(false);
            $table->timestamp('tasks_last_synced_at')->nullable();
            $table->timestamps();
        });

        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('name');
            $table->string('color', 7);
            $table->string('icon');
            $table->unsignedSmallInteger('sort')->default(0);
            $table->boolean('is_brain_dump_only')->default(false);
            $table->timestamps();
        });

        Schema::create('google_task_lists', function (Blueprint $table) {
            $table->id();
            $table->foreignId('google_account_id')->constrained()->cascadeOnDelete();
            $table->string('google_list_id');
            $table->string('title');
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('etag')->nullable();
            $table->timestamps();

            $table->unique(['google_account_id', 'google_list_id']);
        });

        Schema::create('google_calendars', function (Blueprint $table) {
            $table->id();
            $table->foreignId('google_account_id')->constrained()->cascadeOnDelete();
            $table->string('google_calendar_id');
            $table->string('summary');
            $table->string('color', 7)->nullable();
            $table->string('role')->default('other');
            $table->boolean('sync_enabled')->default(false);
            $table->text('sync_token')->nullable();
            $table->timestamps();

            $table->unique(['google_account_id', 'google_calendar_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('google_calendars');
        Schema::dropIfExists('google_task_lists');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('google_accounts');

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('household_id');
            $table->dropColumn(['avatar_url', 'color', 'timezone', 'notification_preferences']);
        });

        Schema::dropIfExists('households');
    }
};
