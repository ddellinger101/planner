<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ImportantDate;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class ImportantDateController extends Controller
{
    /**
     * The important dates that fall in a range. A date that repeats yearly
     * is returned once for each year it occurs in; `occurs_on` is when.
     */
    public function index(Request $request): JsonResponse
    {
        $range = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        $from = CarbonImmutable::parse($range['from'], 'UTC');
        $to = CarbonImmutable::parse($range['to'], 'UTC');
        $occurrences = [];

        foreach (ImportantDate::orderBy('date')->orderBy('id')->get() as $date) {
            $years = $date->repeats_yearly ? range($from->year, $to->year) : [$date->date->year];

            foreach ($years as $year) {
                // A yearly date can't happen before the year it was first set for.
                if ($year < $date->date->year) {
                    continue;
                }

                // February 29 is kept on the 28th in other years.
                $occursOn = CarbonImmutable::create($year, $date->date->month, 1, 0, 0, 0, 'UTC')
                    ->day(min($date->date->day, CarbonImmutable::create($year, $date->date->month, 1)->daysInMonth));

                if ($occursOn->betweenIncluded($from, $to)) {
                    $occurrences[] = [...$date->toArray(), 'occurs_on' => $occursOn->toDateString()];
                }
            }
        }

        usort($occurrences, fn ($a, $b) => [$a['occurs_on'], $a['id']] <=> [$b['occurs_on'], $b['id']]);

        return response()->json($occurrences);
    }

    public function store(Request $request): JsonResponse
    {
        return response()->json(ImportantDate::create($this->validated($request))->refresh(), 201);
    }

    public function update(Request $request, ImportantDate $importantDate): JsonResponse
    {
        abort_if($importantDate->source !== 'app', 403, 'Birthdays from Google Contacts are edited in Google Contacts.');

        $importantDate->update($this->validated($request, $importantDate));

        return response()->json($importantDate->refresh());
    }

    public function destroy(ImportantDate $importantDate): Response
    {
        abort_if($importantDate->source !== 'app', 403, 'Birthdays from Google Contacts are removed in Google Contacts.');

        $importantDate->delete();

        return response()->noContent();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?ImportantDate $date = null): array
    {
        $required = $date ? 'sometimes' : 'required';

        return $request->validate([
            'title' => [$required, 'string', 'max:255'],
            'date' => [$required, 'date_format:Y-m-d'],
            'repeats_yearly' => ['boolean'],
            'category_id' => ['nullable', 'integer', Rule::exists('categories', 'id')],
        ]);
    }
}
