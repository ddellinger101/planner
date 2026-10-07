<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The calendars of someone else in the household that a person has
     * chosen not to see. Each person decides this for themselves.
     */
    public function up(): void
    {
        Schema::create('hidden_calendars', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('google_calendar_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'google_calendar_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hidden_calendars');
    }
};
