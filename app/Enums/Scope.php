<?php

namespace App\Enums;

enum Scope: string
{
    case Year = 'year';
    case Quarter = 'quarter';
    case Month = 'month';
    case Week = 'week';
    case Day = 'day';
}
