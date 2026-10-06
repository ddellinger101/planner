<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="theme-color" content="#fbf8f1">

        <title>@yield('title') · {{ config('app.name') }}</title>

        @vite(['resources/scss/app.scss'])
    </head>
    <body>
        <main class="container py-5">
            <div class="row justify-content-center">
                <div class="col-12 col-lg-8">
                    <div class="card shadow-sm border-0">
                        <div class="card-body p-4 p-md-5">
                            <p class="mb-4"><a href="/">&larr; {{ config('app.name') }}</a></p>
                            <h1 class="h2">@yield('title')</h1>
                            <p class="text-secondary">Last updated October 6, 2026</p>

                            @yield('content')

                            <hr class="my-4">
                            <p class="mb-0 small">
                                <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </body>
</html>
