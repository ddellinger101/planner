<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Auth\SessionGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cookie;
use Symfony\Component\HttpFoundation\Response;

/**
 * Laravel sets the remember-me cookie once, at sign-in, and browsers keep a
 * cookie for 400 days at most. Handing it out again whenever it is used to
 * sign someone back in means anyone who opens the planner stays signed in.
 */
class RenewRememberCookie
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $guard = Auth::guard('web');

        if ($guard instanceof SessionGuard && $guard->viaRemember()) {
            $name = $guard->getRecallerName();
            $value = $request->cookies->get($name);

            if (is_string($value)) {
                Cookie::queue(Cookie::forever($name, $value));
            }
        }

        return $response;
    }
}
