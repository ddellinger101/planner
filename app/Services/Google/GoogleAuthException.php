<?php

namespace App\Services\Google;

use RuntimeException;

/** Google no longer accepts the account's credentials: it must be reconnected. */
class GoogleAuthException extends RuntimeException {}
