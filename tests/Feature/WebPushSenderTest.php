<?php

use App\Models\PushSubscription;
use App\Models\User;
use App\Services\Push\PushFailedException;
use App\Services\Push\PushNotifier;
use App\Services\Push\PushSender;
use App\Services\Push\WebPushSender;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use Minishlink\WebPush\VAPID;

/*
 * These run the real push library end to end, stopping only at the network:
 * signing, encrypting and the request it builds are all exercised. The other
 * push tests stand in for the sender, which is how a call the library didn't
 * accept once reached production.
 */

beforeEach(function () {
    try {
        $keys = VAPID::createVapidKeys();
    } catch (RuntimeException) {
        // PHP on Windows often can't find OpenSSL's configuration; set OPENSSL_CONF to run these.
        $this->markTestSkipped('This machine\'s OpenSSL cannot make EC keys.');
    }

    config([
        'planner.vapid.public_key' => $keys['publicKey'],
        'planner.vapid.private_key' => $keys['privateKey'],
        'planner.vapid.subject' => 'https://plan.example.com',
    ]);

    // A device's keys: a P-256 public key and 16 random bytes, both URL-safe base64.
    $this->device = PushSubscription::create([
        'user_id' => User::factory()->create()->id,
        'endpoint' => 'https://web.push.apple.com/abc123',
        'p256dh' => VAPID::createVapidKeys()['publicKey'],
        'auth' => rtrim(strtr(base64_encode(random_bytes(16)), '+/', '-_'), '='),
    ]);

    $this->requests = [];
    $this->respondWith = function (Response ...$responses) {
        $stack = HandlerStack::create(new MockHandler($responses));
        $stack->push(Middleware::history($this->requests));

        return new WebPushSender(new Client(['handler' => $stack]));
    };

    $this->payload = ['title' => 'Call the plumber', 'body' => 'At 3:30 PM', 'url' => '/day/2027-01-04', 'tag' => 'task:1'];
});

it('signs, encrypts and posts a notification to the device\'s push service', function () {
    $sender = ($this->respondWith)(new Response(201));

    expect($sender->configured())->toBeTrue()
        ->and($sender->send($this->device, $this->payload))->toBeTrue()
        ->and($this->requests)->toHaveCount(1);

    $request = $this->requests[0]['request'];

    expect($request->getMethod())->toBe('POST')
        ->and((string) $request->getUri())->toBe('https://web.push.apple.com/abc123')
        ->and($request->getHeaderLine('Authorization'))->toStartWith('vapid t=')
        ->and($request->getHeaderLine('Content-Encoding'))->toBe('aes128gcm')
        ->and($request->getHeaderLine('TTL'))->toBe('3600')
        // The body is encrypted for the device: the title is not readable in it.
        ->and((string) $request->getBody())->not->toBe('')->not->toContain('Call the plumber');
});

it('reports a device the push service says is gone', function () {
    expect(($this->respondWith)(new Response(410))->send($this->device, $this->payload))->toBeFalse();
});

it('keeps a device when the push service refuses for another reason', function () {
    ($this->respondWith)(new Response(403, [], '{"reason":"BadJwtToken"}'))->send($this->device, $this->payload);
})->throws(PushFailedException::class);

it('sends through the notifier, dropping only devices that are gone', function () {
    $gone = PushSubscription::create([...$this->device->only(['user_id', 'p256dh', 'auth']), 'endpoint' => 'https://web.push.apple.com/gone']);

    $this->app->instance(PushSender::class, ($this->respondWith)(new Response(201), new Response(410)));

    $sent = app(PushNotifier::class)->notify(User::find($this->device->user_id), $this->payload);

    expect($sent)->toBe(1)
        ->and(PushSubscription::pluck('endpoint')->all())->toBe(['https://web.push.apple.com/abc123'])
        ->and(PushSubscription::whereKey($gone->id)->exists())->toBeFalse();
});

it('does nothing, and loses no device, without keys', function () {
    config(['planner.vapid.private_key' => null]);
    $sender = ($this->respondWith)();

    expect($sender->configured())->toBeFalse()
        ->and($sender->send($this->device, $this->payload))->toBeTrue()
        ->and($this->requests)->toBe([]);
});

it('can be built by the container, which is how the app gets it', function () {
    $sender = app(PushSender::class);

    expect($sender)->toBeInstanceOf(WebPushSender::class)->and($sender->configured())->toBeTrue();
});
