<?php

namespace App\Enums;

enum SyncState: string
{
    case Clean = 'clean';
    case Dirty = 'dirty';
    case Error = 'error';
}
