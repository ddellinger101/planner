import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useSyncExternalStore } from 'react';
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

// Below Bootstrap's "sm" breakpoint, where the header is a single tight row.
const PHONE = '(max-width: 575.98px)';

function useIsPhone(): boolean {
    return useSyncExternalStore(
        (changed) => {
            const query = window.matchMedia?.(PHONE);
            query?.addEventListener('change', changed);

            return () => query?.removeEventListener('change', changed);
        },
        () => window.matchMedia?.(PHONE).matches ?? false,
    );
}

export const periodPath = (period: Period) => `/${period.scope}/${period.key}`;

/** Previous / next / today controls and a date picker for a period page. */
export default function PeriodNav({ period }: { period: Period }) {
    const navigate = useNavigate();
    const today = useToday();
    const dateInput = useRef<HTMLInputElement>(null);
    // The spoken name stays the long one; only what is drawn is shortened.
    const { title: fullTitle } = periodLabel(period);
    const { title, subtitle } = periodLabel(period, useIsPhone());
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
                <h1
                    // "Wednesday" and "September" are set a little smaller on a phone.
                    className={`page-title${title.length > 8 ? ' is-long' : ''}`}
                    aria-label={title === fullTitle ? undefined : fullTitle}
                >
                    {title}
                </h1>
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
