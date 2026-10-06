<?php

namespace App\Enums;

enum RewardStatus: string
{
    case Active = 'active';
    case Earned = 'earned';
    case Expired = 'expired';
    case Claimed = 'claimed';
}
