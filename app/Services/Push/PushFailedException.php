<?php

namespace App\Services\Push;

use RuntimeException;

/** The push service was reached but did not take the notification. The device is kept. */
class PushFailedException extends RuntimeException {}
