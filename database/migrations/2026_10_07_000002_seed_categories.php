<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    // Seeded in a migration so every environment, production included, gets
    // the planner categories from a plain `migrate`.
    public function up(): void
    {
        $categories = [
            ['health', 'Health', '#2f8f83', 'heart-pulse'],
            ['finances', 'Finances', '#d99a1c', 'piggy-bank'],
            ['home', 'Home', '#3b7dd8', 'house'],
            ['family', 'Family', '#e8677a', 'users'],
            ['only-4-you', 'Only 4 You', '#8257d6', 'custom:only4you'],
            ['other', 'Other', '#64748b', 'list-todo'],
        ];

        foreach ($categories as $sort => [$slug, $name, $color, $icon]) {
            DB::table('categories')->insert([
                'slug' => $slug,
                'name' => $name,
                'color' => $color,
                'icon' => $icon,
                'sort' => $sort,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        DB::table('categories')->delete();
    }
};
