<?php

namespace App\Enums;

enum ItemSource: string
{
    case App = 'app';
    case GoogleTasks = 'google_tasks';
    case BrainDump = 'brain_dump';
}
