<?php

namespace App\Enums;

enum JournalType: string
{
    case Gratitude = 'gratitude';
    case Affirmation = 'affirmation';
    case BestPart = 'best_part';
    case Meditation = 'meditation';
}
