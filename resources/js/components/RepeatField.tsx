import { useState } from 'react';
import { repeatOptions, ruleParts, WEEK_DAYS, weeklyRule } from '@/lib/rrule';

type Props = {
    /** The task's date (YYYY-MM-DD); the presets are built from it. */
    date: string;
    value: string | null;
    onChange: (rule: string | null) => void;
};

type Mode = 'preset' | 'days' | 'custom';

/** Which editor suits an existing rule. */
function modeFor(rule: string | null, presets: string[]): Mode {
    if (rule === null || presets.includes(rule)) {
        return 'preset';
    }

    const { FREQ, BYDAY, INTERVAL, ...rest } = ruleParts(rule);
    const plainDays = BYDAY?.split(',').every((code) => WEEK_DAYS.some((day) => day.code === code));

    return FREQ === 'WEEKLY' &&
        plainDays &&
        Object.keys(rest).length === 0 &&
        Number(INTERVAL ?? 1) > 0
        ? 'days'
        : 'custom';
}

/**
 * Chooses how a task repeats: a preset, chosen days of the week every N
 * weeks, or a hand-written RRULE for anything else.
 */
export default function RepeatField({ date, value, onChange }: Props) {
    const presets = repeatOptions(date);
    const [mode, setMode] = useState<Mode>(() =>
        modeFor(
            value,
            presets.map((option) => option.rule),
        ),
    );

    const parts = value ? ruleParts(value) : {};
    const days = mode === 'days' ? (parts.BYDAY?.split(',') ?? []) : [];
    const interval = Number(parts.INTERVAL ?? 1);

    const choose = (choice: string) => {
        if (choice === 'days') {
            setMode('days');
            // Start from the task's own weekday.
            onChange(presets[2].rule);
        } else if (choice === 'custom') {
            setMode('custom');
            onChange(value ?? 'FREQ=DAILY');
        } else {
            setMode('preset');
            onChange(choice || null);
        }
    };

    const toggleDay = (code: string) => {
        const next = days.includes(code) ? days.filter((day) => day !== code) : [...days, code];

        // A weekly rule needs at least one day.
        if (next.length > 0) {
            onChange(weeklyRule(next, interval));
        }
    };

    return (
        <div>
            <label className="field-label" htmlFor="repeat-select">
                Repeat
            </label>
            <select
                id="repeat-select"
                className="field-input"
                value={mode === 'preset' ? (value ?? '') : mode}
                onChange={(event) => choose(event.target.value)}
            >
                <option value="">Doesn’t repeat</option>
                {presets.map((option) => (
                    <option key={option.rule} value={option.rule}>
                        {option.label}
                    </option>
                ))}
                <option value="days">On chosen days of the week…</option>
                <option value="custom">Custom rule…</option>
            </select>

            {mode === 'days' && (
                <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                    <div className="d-flex gap-1" role="group" aria-label="Days of the week">
                        {WEEK_DAYS.map((day) => (
                            <button
                                key={day.code}
                                type="button"
                                className="day-toggle"
                                aria-pressed={days.includes(day.code)}
                                aria-label={day.name}
                                onClick={() => toggleDay(day.code)}
                            >
                                {day.name.charAt(0)}
                            </button>
                        ))}
                    </div>
                    <label className="d-flex align-items-center gap-2 small text-soft mb-0">
                        every
                        <input
                            type="number"
                            className="field-input interval-input"
                            aria-label="Every how many weeks"
                            min={1}
                            max={52}
                            value={interval}
                            onChange={(event) =>
                                onChange(
                                    weeklyRule(days, Math.max(1, Number(event.target.value) || 1)),
                                )
                            }
                        />
                        {interval === 1 ? 'week' : 'weeks'}
                    </label>
                </div>
            )}

            {mode === 'custom' && (
                <div className="mt-2">
                    <input
                        type="text"
                        className="field-input"
                        aria-label="Recurrence rule"
                        aria-describedby="repeat-custom-help"
                        value={value ?? ''}
                        onChange={(event) =>
                            onChange(event.target.value.trim().toUpperCase() || null)
                        }
                        spellCheck={false}
                        autoCapitalize="characters"
                    />
                    <p id="repeat-custom-help" className="small text-soft mt-1 mb-0">
                        An iCalendar rule, for example FREQ=MONTHLY;INTERVAL=3 for every three
                        months.
                    </p>
                </div>
            )}
        </div>
    );
}
