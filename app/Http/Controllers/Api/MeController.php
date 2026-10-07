<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'user' => $user->only([
                'id', 'name', 'email', 'avatar_url', 'color', 'timezone', 'day_start_hour', 'day_end_hour',
            ]),
            'household' => [
                'id' => $user->household_id,
                'name' => $user->household->name,
                'members' => $user->household->users()
                    ->orderBy('id')
                    ->get(['id', 'name', 'avatar_url', 'color']),
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'color' => ['hex_color'],
            'day_start_hour' => ['integer', 'between:0,22'],
            // 24 means the timeline runs to midnight.
            'day_end_hour' => ['integer', 'between:1,24'],
        ]);

        $start = $data['day_start_hour'] ?? $user->day_start_hour;
        $end = $data['day_end_hour'] ?? $user->day_end_hour;

        abort_if($end <= $start, 422, 'The day must end after it starts.');

        $user->update($data);

        return $this->show($request);
    }

    public function categories(): JsonResponse
    {
        return response()->json(Category::orderBy('sort')->get());
    }
}
