<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MealEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MealController extends Controller
{
    // Read-only: Chef is the only writer of meals.
    public function index(Request $request): JsonResponse
    {
        $range = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        return response()->json(
            MealEntry::whereDate('date', '>=', $range['from'])
                ->whereDate('date', '<=', $range['to'])
                ->orderBy('date')
                ->orderBy('id')
                ->get(),
        );
    }
}
