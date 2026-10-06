@extends('legal.layout')

@section('title', 'Privacy Policy')

@section('content')
    <p>
        {{ config('app.name') }} is a private planning app for one household. It is not offered to
        the public: only the Google accounts its owner has approved can sign in. This policy
        explains what the app stores about those people and what it does with it.
    </p>

    <h2 class="h4 mt-4">What the app collects</h2>
    <ul>
        <li>
            <strong>Your Google account details.</strong> When you sign in with Google, the app
            receives your name, email address and profile picture, and uses them to identify you
            and show who is signed in.
        </li>
        <li>
            <strong>What you put in the planner.</strong> Tasks, goals, journal entries, habits,
            weight entries, rewards and anything else you type into the app.
        </li>
        <li>
            <strong>Google Tasks and Google Calendar data, if you connect them.</strong> With your
            permission, the app reads and updates your task lists and calendar events so they can
            be shown and edited in the planner.
        </li>
        <li>
            <strong>Technical data.</strong> A session cookie that keeps you signed in, and
            ordinary server logs used to diagnose problems.
        </li>
    </ul>

    <h2 class="h4 mt-4">How the app uses it</h2>
    <p>
        Your information is used only to run the planner for you and the other member of your
        household. It is not sold, not used for advertising, and not used to train AI models.
    </p>
    <p>
        The app's use of information received from Google APIs adheres to the
        <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
        including the Limited Use requirements.
    </p>

    <h2 class="h4 mt-4">Who can see it</h2>
    <p>
        The members of your household share one planner and can see each other's tasks, goals and
        calendar events in it. Journal entries and weight entries are visible only to the person
        who wrote them. Nothing is shared with anyone outside the household, except the hosting
        provider that runs the server and Google, when the app syncs your tasks and calendar at
        your request.
    </p>

    <h2 class="h4 mt-4">Where it is kept and for how long</h2>
    <p>
        Data is stored in a database on a server operated for the app's owner, and sent over
        encrypted connections. Google access tokens are encrypted before they are stored. Data is
        kept until you delete it or ask for it to be deleted.
    </p>

    <h2 class="h4 mt-4">Your choices</h2>
    <ul>
        <li>You can edit or delete what you have entered at any time in the app.</li>
        <li>
            You can remove the app's access to your Google account at any time at
            <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
        </li>
        <li>You can ask for your account and everything stored about you to be deleted.</li>
    </ul>

    <h2 class="h4 mt-4">Changes and contact</h2>
    <p>
        If this policy changes, the new version will be posted on this page with a new date.
        @if (config('planner.contact_email'))
            Questions and deletion requests can be sent to
            <a href="mailto:{{ config('planner.contact_email') }}">{{ config('planner.contact_email') }}</a>.
        @else
            Questions and deletion requests can be sent to the app's owner.
        @endif
    </p>
@endsection
