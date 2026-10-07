<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Jobs\SyncGoogleAccount;
use App\Models\GoogleAccount;
use App\Models\Household;
use App\Models\User;
use App\Services\Google\CalendarSync;
use App\Services\Google\GoogleClient;
use App\Services\Google\TaskSync;
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
    /** The APIs the planner syncs with, beyond knowing who signed in. */
    private const SYNC_SCOPES = [
        GoogleClient::SCOPE_TASKS,
        GoogleClient::SCOPE_CONTACTS,
        GoogleClient::SCOPE_CALENDAR_EVENTS,
        GoogleClient::SCOPE_CALENDAR_LIST,
    ];

    /** Sign in: who you are, and nothing more. */
    public function redirect(): SymfonyRedirect
    {
        return Socialite::driver('google')
            ->scopes(['openid', 'email', 'profile'])
            // Report access granted earlier too, so signing in doesn't look like losing it.
            ->with(['include_granted_scopes' => 'true'])
            ->redirect();
    }

    /**
     * Connect Google Tasks, Calendar and Contacts. Asked for separately from sign-in,
     * from Settings, so the planner only gets this access when it is wanted.
     */
    public function connect(Request $request): SymfonyRedirect
    {
        $request->session()->put('google_connecting', true);

        return Socialite::driver('google')
            ->scopes(['openid', 'email', 'profile', ...self::SYNC_SCOPES])
            // Offline access with a fresh consent is what makes Google issue a refresh token.
            ->with(['access_type' => 'offline', 'prompt' => 'consent', 'include_granted_scopes' => 'true'])
            ->redirect();
    }

    public function callback(Request $request, TaskSync $sync, CalendarSync $calendars): RedirectResponse
    {
        $connecting = (bool) $request->session()->pull('google_connecting', false);

        try {
            $google = Socialite::driver('google')->user();
        } catch (Throwable $e) {
            report($e);

            return redirect($connecting ? '/settings?google=failed' : '/?auth_error=failed');
        }

        $email = strtolower((string) $google->getEmail());
        $verified = (bool) ($google->user['email_verified'] ?? $google->user['verified_email'] ?? false);

        if (! $verified || ! in_array($email, config('planner.allowed_emails'), true)) {
            return redirect('/?auth_error=not_allowed');
        }

        [$user, $account] = DB::transaction(function () use ($google, $email) {
            $household = Household::query()->first()
                ?? Household::create(['name' => config('planner.household_name')]);

            $user = User::firstOrNew(['email' => $email]);

            if (! $user->exists) {
                // Each person gets their own color, so their things can be told apart.
                $user->color = User::nextColorFor($household->id);
            }

            $user->fill([
                'household_id' => $user->household_id ?? $household->id,
                'name' => $user->name ?? $google->getName() ?? $email,
                'avatar_url' => $google->getAvatar(),
                'email_verified_at' => $user->email_verified_at ?? now(),
            ])->save();

            $account = GoogleAccount::updateOrCreate(
                ['google_sub' => (string) $google->getId()],
                ['user_id' => $user->id, 'email' => $email],
            );

            return [$user, $account];
        });

        $this->storeTokens($account, $google);

        Auth::login($user, remember: true);
        $request->session()->regenerate();

        if (! $connecting) {
            return redirect('/');
        }

        if (! $account->refresh()->canSyncTasks() && ! $account->hasGranted(GoogleClient::SCOPE_CONTACTS) && ! $account->canSyncCalendar()) {
            // The consent screen's boxes were left unticked.
            return redirect('/settings?google=declined');
        }

        try {
            if ($account->canSyncTasks()) {
                $sync->refreshLists($account);
            }

            if ($account->canSyncCalendar()) {
                $calendars->refreshCalendars($account);
            }
        } catch (Throwable $e) {
            report($e);
        }

        SyncGoogleAccount::dispatch($account->id, withBirthdays: true);

        return redirect('/settings?google=connected');
    }

    public function logout(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    /**
     * Keep what Google handed back. A plain sign-in returns no refresh token
     * and may list fewer scopes, so it must never erase a working connection.
     */
    private function storeTokens(GoogleAccount $account, object $google): void
    {
        $scopes = array_values((array) ($google->approvedScopes ?? []));
        $grantsSync = array_intersect(self::SYNC_SCOPES, $scopes) !== [];

        if (! empty($google->refreshToken)) {
            $account->refresh_token = $google->refreshToken;
            $account->needs_reconnect = false;
        }

        if ($grantsSync || $account->refresh_token === null) {
            $account->scopes = $scopes;
        }

        if ($grantsSync && ! empty($google->token)) {
            $account->access_token = $google->token;
            $account->expires_at = now()->addSeconds((int) ($google->expiresIn ?? 3600));
        }

        $account->save();
    }
}
