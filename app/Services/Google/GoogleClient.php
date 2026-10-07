<?php

namespace App\Services\Google;

use App\Models\GoogleAccount;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Makes authorized calls to Google's REST APIs for one connected account,
 * refreshing the access token when it has run out.
 *
 * Plain HTTP rather than Google's PHP library: the app uses a handful of
 * endpoints, and the library is far larger than everything else deployed.
 */
class GoogleClient
{
    public const SCOPE_TASKS = 'https://www.googleapis.com/auth/tasks';

    public const SCOPE_CONTACTS = 'https://www.googleapis.com/auth/contacts.readonly';

    public const SCOPE_CALENDAR_EVENTS = 'https://www.googleapis.com/auth/calendar.events';

    /** Needed to list the account's calendars. */
    public const SCOPE_CALENDAR_LIST = 'https://www.googleapis.com/auth/calendar.readonly';

    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    /**
     * @param  array<string, mixed>  $data  query for GET and DELETE, JSON body otherwise
     *
     * @throws GoogleAuthException when the account has to be reconnected
     * @throws GoogleNotFoundException on a 404
     */
    public function request(GoogleAccount $account, string $method, string $url, array $data = []): Response
    {
        $response = $this->send($account, $method, $url, $data);

        // The token can be revoked or expire early; try once more with a new one.
        if ($response->status() === 401) {
            $this->refresh($account);
            $response = $this->send($account, $method, $url, $data);
        }

        if ($response->status() === 401) {
            throw new GoogleAuthException('Google refused the request (401).');
        }

        // Forbidden: the scope wasn't granted, the API is off, or this one thing isn't allowed.
        if ($response->status() === 403) {
            throw new GoogleAuthException('Google refused the request (403): '.$response->json('error.message', 'no reason given'), revoked: false);
        }

        if ($response->status() === 404 || $response->status() === 410) {
            throw new GoogleNotFoundException("Google has no such resource: {$url}");
        }

        return $response->throw();
    }

    private function send(GoogleAccount $account, string $method, string $url, array $data): Response
    {
        if ($account->access_token === null || $account->expires_at === null || $account->expires_at->subMinute()->isPast()) {
            $this->refresh($account);
        }

        $request = Http::withToken($account->access_token)->acceptJson()->timeout(20);

        return in_array($method, ['GET', 'DELETE'], true)
            ? $request->send($method, $url, ['query' => $data])
            : $request->send($method, $url, ['json' => $data]);
    }

    /** @throws GoogleAuthException */
    private function refresh(GoogleAccount $account): void
    {
        if ($account->refresh_token === null) {
            throw new GoogleAuthException('The account has no refresh token.');
        }

        $response = Http::asForm()->timeout(20)->post(self::TOKEN_URL, [
            'client_id' => config('services.google.client_id'),
            'client_secret' => config('services.google.client_secret'),
            'refresh_token' => $account->refresh_token,
            'grant_type' => 'refresh_token',
        ]);

        // invalid_grant: the refresh token was revoked or has expired.
        if ($response->failed()) {
            throw new GoogleAuthException('Google would not refresh the token: '.$response->json('error', 'unknown'));
        }

        $account->update([
            'access_token' => $response->json('access_token'),
            'expires_at' => now()->addSeconds((int) $response->json('expires_in', 3600)),
        ]);
    }
}
