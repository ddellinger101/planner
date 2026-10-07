import { useQuery } from '@tanstack/react-query';
import { CircleAlert, MapPinOff } from 'lucide-react';
import { useCreateItem, useDeleteItem, useItems, useUpdateItem } from '@/api/items';
import { fetchCategories } from '@/api/session';
import CategoryBox from '@/components/CategoryBox';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import PeriodNav from '@/components/PeriodNav';
import { usePersonFilter } from '@/context/PersonFilterContext';
import { useSession } from '@/context/SessionContext';
import type { Period, Scope } from '@/lib/period';
import { useCurrentPeriod } from '@/lib/useCurrentPeriod';

const SECTION_TITLES: Record<Scope, string> = {
    day: 'Today’s tasks',
    week: 'Weekly goals',
    month: 'Monthly goals',
    quarter: 'Quarter goals',
    year: 'One-year goals',
};

/** The Day, Week, Month, Quarter and Year views share this page. */
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

    return (
        <>
            <PageHeader>
                <PeriodNav period={period} />
            </PageHeader>
            <main className="container-fluid page-body">
                <PeriodItems period={period} />
            </main>
        </>
    );
}

function PeriodItems({ period }: { period: Period }) {
    const { household } = useSession();
    const { person } = usePersonFilter();
    const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
    const items = useItems({ periodKey: period.key, person });
    const createItem = useCreateItem();
    const updateItem = useUpdateItem();
    const deleteItem = useDeleteItem();

    if (categories.isError || items.isError) {
        return (
            <EmptyState icon={CircleAlert} title="This page didn’t load">
                Check your connection and try again.
            </EmptyState>
        );
    }

    return (
        <>
            <h2 className="visually-hidden">{SECTION_TITLES[period.scope]}</h2>
            <div className="row g-3" aria-busy={items.isPending}>
                {categories.data?.map((category) => (
                    <div key={category.id} className="col-12 col-md-6 col-xl-4">
                        <CategoryBox
                            category={category}
                            items={(items.data ?? []).filter(
                                (item) => item.category_id === category.id,
                            )}
                            members={household.members}
                            noun={period.scope === 'day' ? 'task' : 'goal'}
                            onAdd={(title) =>
                                createItem.mutate({
                                    title,
                                    category_id: category.id,
                                    scope: period.scope,
                                    period_key: period.key,
                                })
                            }
                            onChange={(item, changes) =>
                                updateItem.mutate({ id: item.id, changes })
                            }
                            onDelete={(item) => deleteItem.mutate(item.id)}
                        />
                    </div>
                ))}
            </div>
        </>
    );
}
