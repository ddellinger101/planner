import { MapPinOff } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import PeriodNav from '@/components/PeriodNav';
import { useCurrentPeriod } from '@/lib/useCurrentPeriod';
import DayPage from './DayPage';
import { MonthPage, QuarterPage, WeekPage, YearPage } from './GoalPages';

const PAGES = {
    week: WeekPage,
    month: MonthPage,
    quarter: QuarterPage,
    year: YearPage,
};

/** The route for every period: it picks the view for the period's scope. */
export default function PeriodPage() {
    const period = useCurrentPeriod();

    if (!period) {
        return (
            <>
                <PageHeader showPersonFilter={false}>Not found</PageHeader>
                <main className="container-fluid page-body">
                    <EmptyState icon={MapPinOff} title="That date doesn’t exist">
                        Use the navigation to pick a day, week, month, quarter or year.
                    </EmptyState>
                </main>
            </>
        );
    }

    if (period.scope === 'day') {
        // Keyed by date so each day starts with fresh form fields.
        return <DayPage key={period.key} period={period} />;
    }

    const Page = PAGES[period.scope];

    return (
        <>
            <PageHeader>
                <PeriodNav period={period} />
            </PageHeader>
            <main className="container-fluid page-body">
                <Page period={period} />
            </main>
        </>
    );
}
