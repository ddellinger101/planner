<?php

namespace App\Rules;

use App\Enums\Scope;
use App\Support\Period;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class PeriodKey implements ValidationRule
{
    /** @param  list<Scope>|null  $scopes  Restrict the key to these scopes. */
    public function __construct(private ?array $scopes = null) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $period = is_string($value) ? Period::tryParse($value) : null;

        if ($period === null) {
            $fail('The :attribute must be a period key such as 2027, 2027-Q1, 2027-01, 2027-W01 or 2027-01-04.');

            return;
        }

        if ($this->scopes !== null && ! in_array($period->scope, $this->scopes, true)) {
            $allowed = implode(', ', array_map(fn (Scope $scope) => $scope->value, $this->scopes));

            $fail("The :attribute must be a {$allowed} period.");
        }
    }
}
