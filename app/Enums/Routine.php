<?php

namespace App\Enums;

enum Routine: string
{
    case Morning = 'morning';
    case Evening = 'evening';
    // Habits only; items use null for "no routine".
    case Anytime = 'anytime';
}
