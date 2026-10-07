<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A row means the household has finished its rollover review of that
        // week, month, quarter or year, even if some items were left open.
        Schema::create('period_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('household_id')->constrained()->cascadeOnDelete();
            $table->string('period_key', 10);
            $table->foreignId('reviewed_by')->constrained('users');
            $table->timestamps();

            $table->unique(['household_id', 'period_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('period_reviews');
    }
};
