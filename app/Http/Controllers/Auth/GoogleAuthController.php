<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\GoogleAccount;
use App\Models\Household;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Laravel\Socialite\Facades\Socialite;
use Symfony\Component\HttpFoundation\RedirectResponse as SymfonyRedirect;
use Throwable;

class GoogleAuthController extends Controller
{
    public function redirect(): SymfonyRedirect
    {
        // Tasks and Calendar scopes are added when sync is built (Phase 9).
        return Socialite::driver('google')
            ->scopes(['openid', 'email', 'profile'])
            ->redirect();
    }

    public function callback(Request $request): RedirectResponse
    {
        try {
            $google = Socialite::driver('google')->user();
        } catch (Throwable $e) {
            report($e);

            return redirect('/?auth_error=failed');
        }

        $email = strtolower((string) $google->getEmail());
        $verified = (bool) ($google->user['email_verified'] ?? $google->user['verified_email'] ?? false);

        if (! $verified || ! in_array($email, config('planner.allowed_emails'), true)) {
            return redirect('/?auth_error=not_allowed');
        }

        $user = DB::transaction(function () use ($google, $email) {
            $household = Household::query()->first()
                ?? Household::create(['name' => config('planner.household_name')]);

            $user = User::firstOrNew(['email' => $email]);
            $user->fill([
                'household_id' => $user->household_id ?? $household->id,
                'name' => $user->name ?? $google->getName() ?? $email,
                'avatar_url' => $google->getAvatar(),
                'email_verified_at' => $user->email_verified_at ?? now(),
            ])->save();

            GoogleAccount::updateOrCreate(
                ['google_sub' => (string) $google->getId()],
                ['user_id' => $user->id, 'email' => $email],
            );

            return $user;
        });

        Auth::login($user, remember: true);
        $request->session()->regenerate();

        return redirect('/');
    }

    public function logout(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }
}
