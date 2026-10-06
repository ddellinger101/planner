<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('household_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            // Null means the item belongs to both people.
            $table->foreignId('assignee_user_id')->nullable()->constrained('users');
            $table->foreignId('category_id')->nullable()->constrained();
            $table->string('title');
            $table->text('notes')->nullable();
            $table->string('scope');
            $table->string('period_key', 10);
            $table->date('due_date')->nullable();
            $table->time('due_time')->nullable();
            $table->unsignedSmallInteger('duration_minutes')->nullable();
            $table->boolean('starred')->default(false);
            $table->string('status')->default('open');
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('parent_item_id')->nullable()->constrained('items')->nullOnDelete();
            $table->foreignId('carried_from_item_id')->nullable()->constrained('items')->nullOnDelete();
            $table->string('routine')->nullable();
            $table->string('recurrence_rule')->nullable();
            $table->foreignId('recurrence_parent_id')->nullable()->constrained('items')->nullOnDelete();
            $table->unsignedInteger('sort')->default(0);
            $table->string('source')->default('app');
            $table->string('google_task_id')->nullable();
            $table->foreignId('google_task_list_id')->nullable()->constrained()->nullOnDelete();
            $table->string('google_etag')->nullable();
            $table->timestamp('google_updated_at')->nullable();
            $table->string('sync_state')->default('clean');
            $table->text('sync_error')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['household_id', 'scope', 'period_key']);
            $table->index(['household_id', 'due_date']);
            $table->index('google_task_id');
        });

        Schema::create('journal_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('period_key', 10);
            $table->string('type');
            $table->text('body')->nullable();
            $table->unsignedSmallInteger('minutes')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'period_key', 'type']);
        });

        Schema::create('meal_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('household_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('slot')->default('unknown');
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('google_event_id');
            $table->foreignId('google_calendar_id')->constrained()->cascadeOnDelete();
            $table->string('etag')->nullable();
            $table->string('chef_url', 2048)->nullable();
            $table->timestamps();

            $table->unique(['google_calendar_id', 'google_event_id']);
            $table->index(['household_id', 'date']);
        });

        Schema::create('events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('household_id')->constrained()->cascadeOnDelete();
            $table->foreignId('owner_user_id')->constrained('users');
            $table->foreignId('google_calendar_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('google_event_id')->nullable();
            $table->string('title');
            // UTC for timed events. All-day events use starts_on / ends_on instead.
            $table->dateTime('starts_at')->nullable();
            $table->dateTime('ends_at')->nullable();
            $table->date('starts_on')->nullable();
            $table->date('ends_on')->nullable();
            $table->boolean('all_day')->default(false);
            $table->string('location')->nullable();
            $table->string('etag')->nullable();
            $table->string('sync_state')->default('clean');
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['google_calendar_id', 'google_event_id']);
            $table->index(['household_id', 'starts_at']);
            $table->index(['household_id', 'starts_on']);
        });

        Schema::create('important_dates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('household_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->date('date');
            $table->boolean('repeats_yearly')->default(false);
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('event_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['household_id', 'date']);
        });

        Schema::create('weight_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->decimal('weight', 5, 1);
            $table->string('unit', 2)->default('lb');
            $table->timestamps();

            $table->unique(['user_id', 'date']);
        });

        Schema::create('weight_goals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('scope');
            $table->string('period_key', 10);
            $table->decimal('target_weight', 5, 1);
            $table->timestamps();

            $table->unique(['user_id', 'period_key']);
        });

        Schema::create('habits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('household_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('icon')->nullable();
            $table->string('color', 7)->nullable();
            $table->string('routine')->default('anytime');
            // 7 means every day; anything lower is "n times per week".
            $table->unsignedTinyInteger('target_per_week')->default(7);
            $table->date('active_from');
            $table->date('active_to')->nullable();
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('habit_checks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('habit_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->boolean('done')->default(true);
            $table->timestamps();

            $table->unique(['habit_id', 'date']);
        });

        Schema::create('brain_dump_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('household_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->string('bucket');
            $table->string('title');
            $table->text('notes')->nullable();
            $table->unsignedInteger('sort')->default(0);
            $table->foreignId('assigned_item_id')->nullable()->constrained('items')->nullOnDelete();
            $table->timestamp('assigned_at')->nullable();
            $table->timestamps();

            $table->index(['household_id', 'assigned_at']);
        });

        Schema::create('rewards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('household_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            // Null means the reward is for both people.
            $table->foreignId('beneficiary_user_id')->nullable()->constrained('users');
            $table->string('title');
            $table->text('description')->nullable();
            $table->dateTime('deadline');
            $table->string('status')->default('active');
            $table->timestamp('earned_at')->nullable();
            $table->timestamp('claimed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('reward_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reward_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();

            $table->unique(['reward_id', 'item_id']);
        });

        Schema::create('push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('endpoint', 500)->unique();
            $table->string('p256dh');
            $table->string('auth');
            $table->string('user_agent')->nullable();
            $table->timestamps();
        });

        Schema::create('scheduled_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type');
            $table->dateTime('send_at');
            $table->json('payload')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->foreignId('item_id')->nullable()->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->index(['sent_at', 'send_at']);
        });
    }

    public function down(): void
    {
        foreach ([
            'scheduled_notifications', 'push_subscriptions', 'reward_items', 'rewards',
            'brain_dump_items', 'habit_checks', 'habits', 'weight_goals', 'weight_entries',
            'important_dates', 'events', 'meal_entries', 'journal_entries', 'items',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
