<?php

namespace App\Services\Google;

use RuntimeException;

/** The task or list no longer exists on Google's side. */
class GoogleNotFoundException extends RuntimeException {}
