<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <meta name="theme-color" content="#fbf8f1" media="(prefers-color-scheme: light)">
        <meta name="theme-color" content="#1b1a21" media="(prefers-color-scheme: dark)">

        {{-- Installable: Add to Home Screen opens the planner as its own app. --}}
        <link rel="manifest" href="/manifest.webmanifest">
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
        <meta name="mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-title" content="Planner">
        <meta name="apple-mobile-web-app-status-bar-style" content="default">

        <title>{{ config('app.name') }}</title>

        {{-- Use the chosen theme, and follow the device's light or dark setting, before first paint. --}}
        <script>
            (() => {
                // The look chosen in Settings, remembered on this device (see lib/theme.ts).
                try {
                    document.documentElement.dataset.theme = localStorage.getItem('planner.theme') || 'fun';
                } catch {
                    document.documentElement.dataset.theme = 'fun';
                }

                const dark = window.matchMedia('(prefers-color-scheme: dark)');
                const apply = () => (document.documentElement.dataset.bsTheme = dark.matches ? 'dark' : 'light');
                apply();
                dark.addEventListener('change', apply);
            })();
        </script>

        @viteReactRefresh
        @vite(['resources/scss/app.scss', 'resources/js/main.tsx'])
    </head>
    <body>
        <div id="app"></div>
    </body>
</html>
