@extends('legal.layout')

@section('title', 'Terms of Service')

@section('content')
    <p>
        {{ config('app.name') }} is a private planning app for one household. By signing in, you
        agree to these terms.
    </p>

    <h2 class="h4 mt-4">Who can use it</h2>
    <p>
        The app is not open to the public. Only the Google accounts its owner has approved can
        sign in, and the owner can remove that access at any time.
    </p>

    <h2 class="h4 mt-4">Your content</h2>
    <p>
        What you enter in the planner remains yours. You give the app permission to store it and
        show it to you and the other member of your household, which is how a shared planner
        works. How your information is handled is described in the
        <a href="/privacy">Privacy Policy</a>.
    </p>

    <h2 class="h4 mt-4">Google services</h2>
    <p>
        If you connect Google Tasks or Google Calendar, the app reads and changes your tasks and
        events on your behalf. Your use of those services is also covered by Google's own terms.
    </p>

    <h2 class="h4 mt-4">Acceptable use</h2>
    <p>
        Use the app for personal planning. Don't try to access another person's account, disrupt
        the service, or use it for anything unlawful.
    </p>

    <h2 class="h4 mt-4">No warranty</h2>
    <p>
        The app is a personal project provided as is, without warranties of any kind. It may be
        unavailable, change, or lose data, so don't rely on it as the only record of anything
        important. To the extent the law allows, the owner is not liable for any loss arising from
        its use.
    </p>

    <h2 class="h4 mt-4">Changes and contact</h2>
    <p>
        These terms may be updated; the new version will be posted on this page with a new date.
        @if (config('planner.contact_email'))
            Questions can be sent to
            <a href="mailto:{{ config('planner.contact_email') }}">{{ config('planner.contact_email') }}</a>.
        @else
            Questions can be sent to the app's owner.
        @endif
    </p>
@endsection
