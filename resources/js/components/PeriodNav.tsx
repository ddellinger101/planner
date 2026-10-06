import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef } from 'react';
import { useNavigate } from 'react-router';
import {
    nextPeriod,
    periodContains,
    periodFromDate,
    previousPeriod,
    type Period,
} from '@/lib/period';
import { periodLabel, SCOPE_NAMES } from '@/lib/periodLabels';
import { useToday } from '@/lib/useCurrentPeriod';

export const periodPath = (period: Period) => `/${period.scope}/${period.key}`;

/** Previous / next / today controls and a date picker for a period page. */
export default function PeriodNav({ period }: { period: Period }) {
    const navigate = useNavigate();
    const today = useToday();
    const dateInput = useRef<HTMLInputElement>(null);
    const { title, subtitle } = periodLabel(period);
    const scopeName = SCOPE_NAMES[period.scope].toLowerCase();
    const go = (target: Period) => navigate(periodPath(target));

    const openDatePicker = () => {
        const input = dateInput.current;

        // showPicker opens the platform's own date picker; older browsers
        // fall back to focusing the field.
        try {
            input?.showPicker();
        } catch {
            input?.focus();
        }
    };

    return (
        <nav className="period-nav" aria-label="Period">
            <button
                type="button"
                className="icon-button"
                aria-label={`Previous ${scopeName}`}
                onClick={() => go(previousPeriod(period))}
            >
                <ChevronLeft aria-hidden="true" />
            </button>

            {/* The heading doubles as the "jump to a date" control. */}
            <div className="period-nav-title">
                <h1 className="page-title">{title}</h1>
                <button type="button" className="page-subtitle date-jump" onClick={openDatePicker}>
                    {subtitle}
                    <CalendarDays aria-hidden="true" size={14} />
                    <span className="visually-hidden">Pick a date</span>
                </button>
                <input
                    ref={dateInput}
                    type="date"
                    tabIndex={-1}
                    aria-label="Jump to a date"
                    value={period.start}
                    onChange={(event) => {
                        if (event.target.value) {
                            go(periodFromDate(period.scope, event.target.value));
                        }
                    }}
                />
            </div>

            <button
                type="button"
                className="icon-button"
                aria-label={`Next ${scopeName}`}
                onClick={() => go(nextPeriod(period))}
            >
                <ChevronRight aria-hidden="true" />
            </button>

            {!periodContains(period, today) && (
                <button
                    type="button"
                    className="today-button"
                    onClick={() => go(periodFromDate(period.scope, today))}
                >
                    Today
                </button>
            )}
        </nav>
    );
}
