<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Each reminder is sent once. The key names what it is about ("this
     * task at this time, for this person"), and the table is the record of
     * what has gone out.
     */
    public function up(): void
    {
        Schema::table('scheduled_notifications', function (Blueprint $table) {
            $table->string('dedupe_key')->nullable()->unique();
        });
    }

    public function down(): void
    {
        Schema::table('scheduled_notifications', function (Blueprint $table) {
            $table->dropUnique(['dedupe_key']);
            $table->dropColumn('dedupe_key');
        });
    }
};
