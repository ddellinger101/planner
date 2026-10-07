<?php

namespace App\Services\Google;

use App\Enums\MealSlot;
use Carbon\CarbonImmutable;

/**
 * Reads a meal out of an event that Chef wrote to the Menu calendar.
 * The format is described in docs/chef-calendar-format.md.
 */
class ChefMealParser
{
    /**
     * @param  array<string, mixed>  $event  as GoogleCalendarService returns it
     * @return array{date: string, slot: MealSlot, title: string, description: string|null, chef_url: string|null}|null
     */
    public function parse(array $event, string $timezone): ?array
    {
        $title = trim((string) ($event['title'] ?? ''));

        if ($title === '' || empty($event['start'])) {
            return null;
        }

        $slot = null;

        // A slot with no main dish is titled "Lunch: Sandwiches, Fruit".
        if (preg_match('/^(breakfast|lunch|dinner|snacks?)\s*:\s*(.+)$/iu', $title, $match)) {
            $slot = MealSlot::from(rtrim(strtolower($match[1]), 's') === 'snack' ? 'snack' : strtolower($match[1]));
            $title = trim($match[2]);
        }

        if ($event['all_day']) {
            $date = (string) $event['start'];
            $slot ??= MealSlot::tryFrom(strtolower($title)) ?? MealSlot::Unknown;
        } else {
            $start = CarbonImmutable::parse($event['start'])->setTimezone($timezone);
            $date = $start->toDateString();
            $slot ??= $this->slotAt($start);
        }

        [$sides, $url] = $this->readDescription((string) ($event['description'] ?? ''), $title);

        return [
            'date' => $date,
            'slot' => $slot,
            'title' => mb_substr($title, 0, 255),
            'description' => $sides,
            'chef_url' => $url,
        ];
    }

    /** Chef puts breakfast at 8:00, lunch at 12:30 and dinner at 6:00. */
    private function slotAt(CarbonImmutable $start): MealSlot
    {
        $minutes = $start->hour * 60 + $start->minute;

        return match (true) {
            $minutes < 11 * 60 => MealSlot::Breakfast,
            $minutes < 15 * 60 => MealSlot::Lunch,
            default => MealSlot::Dinner,
        };
    }

    /**
     * The description lists each dish on a "• " line, then how many it
     * serves, then a link back to that day in Chef.
     *
     * @return array{0: string|null, 1: string|null} the other dishes, one per line, and the link
     */
    private function readDescription(string $description, string $title): array
    {
        // Google may hand the text back with HTML line breaks.
        $text = html_entity_decode(strip_tags(preg_replace('/<br\s*\/?>/i', "\n", $description)), ENT_QUOTES | ENT_HTML5);
        $sides = [];
        $url = null;

        foreach (preg_split('/\R/u', $text) as $line) {
            $line = trim($line);

            if (preg_match('/^[•\-*]\s*(.+)$/u', $line, $match)) {
                $dish = trim($match[1]);

                // The main dish is already the title.
                if (mb_strtolower($dish) !== mb_strtolower($title) && ! str_contains(mb_strtolower($title), mb_strtolower($dish))) {
                    $sides[] = $dish;
                }
            } elseif ($url === null && preg_match('/https?:\/\/\S+/u', $line, $match)) {
                $url = mb_substr(rtrim($match[0], '.,)'), 0, 2048);
            }
        }

        return [$sides === [] ? null : implode("\n", $sides), $url];
    }
}
