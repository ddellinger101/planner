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
            'user' => $user->only(['id', 'name', 'email', 'avatar_url', 'color', 'timezone']),
            'household' => [
                'id' => $user->household_id,
                'name' => $user->household->name,
                'members' => $user->household->users()
                    ->orderBy('id')
                    ->get(['id', 'name', 'avatar_url', 'color']),
            ],
        ]);
    }

    public function categories(): JsonResponse
    {
        return response()->json(Category::orderBy('sort')->get());
    }
}
