<?php

namespace App\Services\Google;

use RuntimeException;

/**
 * Google would not accept the account's credentials. When `$revoked`, the
 * saved access is gone and the account must be reconnected; otherwise Google
 * refused this one request (an API that isn't enabled, a calendar that can't
 * be written to) and reconnecting would not help.
 */
class GoogleAuthException extends RuntimeException
{
    public function __construct(string $message, public readonly bool $revoked = true)
    {
        parent::__construct($message);
    }
}
