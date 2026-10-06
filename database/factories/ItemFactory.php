<?php

namespace Database\Factories;

use App\Enums\Scope;
use App\Models\Category;
use App\Models\Item;
use App\Models\User;
use App\Support\Period;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Item>
 */
class ItemFactory extends Factory
{
    public function definition(): array
    {
        return [
            'title' => fake()->sentence(3),
            'category_id' => fn () => Category::where('slug', 'other')->value('id'),
            'scope' => Scope::Day,
            'period_key' => '2027-01-04',
            'due_date' => '2027-01-04',
        ];
    }

    /** An item created by, and in the household of, the given user. */
    public function ownedBy(User $user): static
    {
        return $this->state([
            'household_id' => $user->household_id,
            'created_by' => $user->id,
        ]);
    }

    public function period(string $key): static
    {
        $period = Period::parse($key);

        return $this->state([
            'scope' => $period->scope,
            'period_key' => $period->key(),
            'due_date' => $period->scope === Scope::Day ? $period->key() : null,
        ]);
    }
}
