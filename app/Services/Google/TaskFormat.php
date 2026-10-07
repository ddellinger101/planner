<?php

namespace App\Services\Google;

use App\Enums\ItemStatus;
use App\Models\Item;

/**
 * Translates between a planner item and a Google task.
 *
 * Google Tasks keeps a due date but no time, and its API exposes no star.
 * So a time is written as the first line of the notes ("⏰ 3:30 PM") and a
 * star as a "⭐ " at the start of the title, and both are read back the same
 * way. That also lets someone set either from the Google Tasks app.
 */
final class TaskFormat
{
    private const STAR = '⭐';

    private const CLOCK = '⏰';

    /**
     * The Google task fields for an item.
     *
     * @return array<string, mixed>
     */
    public static function encode(Item $item): array
    {
        $notes = trim((string) $item->notes);

        if ($item->due_time !== null) {
            $notes = trim(self::CLOCK.' '.self::formatTime($item->due_time)."\n".$notes);
        }

        $done = $item->status === ItemStatus::Done;

        return [
            'title' => ($item->starred ? self::STAR.' ' : '').$item->title,
            'notes' => $notes,
            // Midnight UTC: Google discards the time and keeps the date.
            'due' => $item->due_date->format('Y-m-d').'T00:00:00.000Z',
            'status' => $done ? 'completed' : 'needsAction',
            // Reopening a task needs its completion time cleared too.
            ...($done ? [] : ['completed' => null]),
        ];
    }

    /**
     * The planner's view of a Google task.
     *
     * @param  array<string, mixed>  $task
     * @return array{title: string, starred: bool, notes: string|null, due_time: string|null, due_date: string|null, done: bool}
     */
    public static function decode(array $task): array
    {
        $title = trim((string) ($task['title'] ?? ''));
        $starred = str_starts_with($title, self::STAR);

        if ($starred) {
            $title = trim(mb_substr($title, mb_strlen(self::STAR)));
        }

        $lines = preg_split('/\R/u', (string) ($task['notes'] ?? '')) ?: [];
        $time = isset($lines[0]) ? self::parseTime($lines[0]) : null;

        if ($time !== null) {
            array_shift($lines);
        }

        $notes = trim(implode("\n", $lines));

        return [
            'title' => $title === '' ? '(untitled)' : mb_substr($title, 0, 255),
            'starred' => $starred,
            'notes' => $notes === '' ? null : $notes,
            'due_time' => $time,
            'due_date' => isset($task['due']) ? substr($task['due'], 0, 10) : null,
            'done' => ($task['status'] ?? null) === 'completed',
        ];
    }

    /** "15:30" → "3:30 PM". */
    private static function formatTime(string $time): string
    {
        [$hours, $minutes] = array_map('intval', explode(':', $time));

        return sprintf('%d:%02d %s', $hours % 12 ?: 12, $minutes, $hours < 12 ? 'AM' : 'PM');
    }

    /** A "⏰ 3:30 PM" (or "⏰ 15:30", "⏰ 3pm") line as HH:MM, or null if it isn't one. */
    private static function parseTime(string $line): ?string
    {
        if (! preg_match('/^\s*'.self::CLOCK.'\x{FE0F}?\s*(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?m\.?)?\s*$/iu', $line, $m)) {
            return null;
        }

        $hours = (int) $m[1];
        $hasMinutes = ($m[2] ?? '') !== '';
        $minutes = $hasMinutes ? (int) $m[2] : 0;
        $meridiem = strtolower($m[3] ?? '');

        if ($meridiem !== '') {
            if ($hours < 1 || $hours > 12) {
                return null;
            }

            $hours = $hours % 12 + ($meridiem === 'p' ? 12 : 0);
        } elseif (! $hasMinutes) {
            // A bare "⏰ 3" could be morning or afternoon; don't guess.
            return null;
        }

        return $hours <= 23 && $minutes <= 59 ? sprintf('%02d:%02d', $hours, $minutes) : null;
    }
}
