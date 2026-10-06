<?php

namespace App\Enums;

enum ItemStatus: string
{
    case Open = 'open';
    case Done = 'done';
    case Dropped = 'dropped';
}
