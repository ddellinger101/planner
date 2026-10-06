<?php

namespace App\Enums;

enum BrainDumpBucket: string
{
    case MustDo = 'must_do';
    case ShouldDo = 'should_do';
    case CouldDo = 'could_do';
    case Call = 'call';
    case Email = 'email';
    case Buy = 'buy';
    case Other = 'other';
    case HealthHabits = 'health_habits';
    case KidsStuff = 'kids_stuff';
    case Only4You = 'only_4_you';

    /** The category pre-selected when an item in this bucket is added to the plan. */
    public function defaultCategorySlug(): string
    {
        return match ($this) {
            self::HealthHabits => 'health',
            self::KidsStuff => 'family',
            self::Only4You => 'only-4-you',
            self::Buy => 'home',
            default => 'other',
        };
    }
}
