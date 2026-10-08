<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A contact's birthday that was removed here. Its row is kept, so the next
     * read of Google Contacts doesn't bring it back.
     */
    public function up(): void
    {
        Schema::table('important_dates', function (Blueprint $table) {
            $table->timestamp('hidden_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('important_dates', function (Blueprint $table) {
            $table->dropColumn('hidden_at');
        });
    }
};
