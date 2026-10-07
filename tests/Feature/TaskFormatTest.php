<?php

use App\Models\Item;
use App\Services\Google\TaskFormat;

function formatted(array $attributes = []): array
{
    return TaskFormat::encode(new Item([
        'title' => 'Call the plumber', 'due_date' => '2027-01-04', 'status' => 'open', ...$attributes,
    ]));
}

describe('encode', function () {
    it('writes a plain task', function () {
        expect(formatted())->toBe([
            'title' => 'Call the plumber',
            'notes' => '',
            'due' => '2027-01-04T00:00:00.000Z',
            'status' => 'needsAction',
            'completed' => null,
        ]);
    });

    it('puts a star in the title and the time on the first line of the notes', function () {
        $task = formatted(['starred' => true, 'due_time' => '15:30', 'notes' => "Upstairs sink\nAsk about the tap"]);

        expect($task['title'])->toBe('⭐ Call the plumber')
            ->and($task['notes'])->toBe("⏰ 3:30 PM\nUpstairs sink\nAsk about the tap");
    });

    it('formats times around noon and midnight', function (string $time, string $text) {
        expect(formatted(['due_time' => $time])['notes'])->toBe("⏰ {$text}");
    })->with([['00:05', '12:05 AM'], ['06:30', '6:30 AM'], ['12:00', '12:00 PM'], ['23:59', '11:59 PM']]);

    it('marks a finished task completed, without clearing its completion time', function () {
        expect(formatted(['status' => 'done']))
            ->toMatchArray(['status' => 'completed'])
            ->not->toHaveKey('completed');
    });
});

describe('decode', function () {
    it('reads a plain task', function () {
        expect(TaskFormat::decode(['title' => 'Call the plumber', 'due' => '2027-01-04T00:00:00.000Z', 'status' => 'needsAction']))
            ->toBe([
                'title' => 'Call the plumber', 'starred' => false, 'notes' => null,
                'due_time' => null, 'due_date' => '2027-01-04', 'done' => false,
            ]);
    });

    it('round-trips a starred, timed task with notes', function () {
        $decoded = TaskFormat::decode(formatted([
            'starred' => true, 'due_time' => '15:30', 'notes' => "Upstairs sink\nAsk about the tap", 'status' => 'done',
        ]));

        expect($decoded)->toBe([
            'title' => 'Call the plumber', 'starred' => true, 'notes' => "Upstairs sink\nAsk about the tap",
            'due_time' => '15:30', 'due_date' => '2027-01-04', 'done' => true,
        ]);
    });

    it('understands times typed by hand in Google Tasks', function (string $line, ?string $time) {
        expect(TaskFormat::decode(['title' => 'x', 'notes' => $line])['due_time'])->toBe($time);
    })->with([
        ['⏰ 3:30 PM', '15:30'],
        ['⏰3:30pm', '15:30'],
        ['⏰ 3pm', '15:00'],
        ['⏰ 12 AM', '00:00'],
        ['⏰ 12:15 p.m.', '12:15'],
        ['⏰ 15:30', '15:30'],
        ['⏰ 9:05', '09:05'],
        'the emoji with its variation selector' => ["⏰\u{FE0F} 7:00 AM", '07:00'],
        'no minutes and no AM or PM is ambiguous' => ['⏰ 3', null],
        'not a time' => ['⏰ soon', null],
        'out of range' => ['⏰ 25:00', null],
        'thirteen o’clock PM' => ['⏰ 13 PM', null],
        'not on a clock line' => ['3:30 PM', null],
    ]);

    it('keeps a clock line that isn\'t a time as part of the notes', function () {
        expect(TaskFormat::decode(['title' => 'x', 'notes' => "⏰ soon\nmore"])['notes'])->toBe("⏰ soon\nmore");
    });

    it('only treats the first line as the time', function () {
        $decoded = TaskFormat::decode(['title' => 'x', 'notes' => "Bring ID\n⏰ 3:30 PM"]);

        expect($decoded['due_time'])->toBeNull()
            ->and($decoded['notes'])->toBe("Bring ID\n⏰ 3:30 PM");
    });

    it('handles a star with or without a space, an empty title and no due date', function () {
        expect(TaskFormat::decode(['title' => '⭐Pay rent'])['title'])->toBe('Pay rent')
            ->and(TaskFormat::decode(['title' => '⭐  Pay rent'])['starred'])->toBeTrue()
            ->and(TaskFormat::decode(['title' => '  '])['title'])->toBe('(untitled)')
            ->and(TaskFormat::decode(['title' => 'x'])['due_date'])->toBeNull()
            // A star elsewhere in the title is just part of the title.
            ->and(TaskFormat::decode(['title' => 'Five ⭐ review'])['starred'])->toBeFalse();
    });

    it('reads the date from any time of day Google sends', function () {
        expect(TaskFormat::decode(['title' => 'x', 'due' => '2027-03-14T00:00:00.000Z'])['due_date'])->toBe('2027-03-14');
    });
});
