<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PushSubscription;
use App\Services\Push\PushNotifier;
use App\Services\Push\PushSender;
use App\Support\NotificationPreferences;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** Push notifications: which reminders a person wants, and which of their devices get them. */
class NotificationController extends Controller
{
    public function __construct(private PushSender $sender, private PushNotifier $notifier) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json([
            // Without keys on the server, nothing can be sent.
            'configured' => $this->sender->configured(),
            'vapid_public_key' => config('planner.vapid.public_key'),
            'devices' => PushSubscription::where('user_id', $request->user()->id)->count(),
            'preferences' => NotificationPreferences::for($request->user()),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $changes = $request->validate(NotificationPreferences::rules());

        $request->user()->update([
            'notification_preferences' => [...NotificationPreferences::for($request->user()), ...$changes],
        ]);

        return $this->show($request);
    }

    /** Remember a device that has agreed to notifications. */
    public function subscribe(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => ['required', 'url:https', 'max:500'],
            'keys.p256dh' => ['required', 'string', 'max:255'],
            'keys.auth' => ['required', 'string', 'max:255'],
        ]);

        // A device belongs to whoever signed in on it last.
        PushSubscription::updateOrCreate(['endpoint' => $data['endpoint']], [
            'user_id' => $request->user()->id,
            'p256dh' => $data['keys']['p256dh'],
            'auth' => $data['keys']['auth'],
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 255),
        ]);

        return $this->show($request);
    }

    public function unsubscribe(Request $request): Response
    {
        $endpoint = $request->validate(['endpoint' => ['required', 'string', 'max:500']])['endpoint'];

        PushSubscription::where('user_id', $request->user()->id)->where('endpoint', $endpoint)->delete();

        return response()->noContent();
    }

    /** Send a notification to every device the person has, to check that it arrives. */
    public function test(Request $request): JsonResponse
    {
        abort_unless($this->sender->configured(), 409, 'Notifications are not set up on the server.');

        $sent = $this->notifier->notify($request->user(), [
            'title' => 'Notifications are working',
            'body' => 'This is what a reminder from the planner looks like.',
            'url' => '/settings',
            'tag' => 'test',
        ]);

        return response()->json(['sent' => $sent]);
    }
}
