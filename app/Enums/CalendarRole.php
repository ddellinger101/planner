<?php

namespace App\Enums;

enum CalendarRole: string
{
    case Primary = 'primary';
    case Menu = 'menu';
    case Other = 'other';
}
