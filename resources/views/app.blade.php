<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <meta name="theme-color" content="#fbf8f1">

        <title>{{ config('app.name') }}</title>

        @viteReactRefresh
        @vite(['resources/scss/app.scss', 'resources/js/main.tsx'])
    </head>
    <body>
        <div id="app"></div>
    </body>
</html>
