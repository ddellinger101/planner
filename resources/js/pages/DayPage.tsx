import { useQuery } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { useCheckHabit, useHabitsOn } from '@/api/day';
import { eventMinutes, eventsFor, eventsOn, useEvents } from '@/api/events';
import {
    useCreateItem,
    useDeleteItem,
    useItems,
    useOverdueItems,
    useUpdateItem,
    type Item,
    type ItemChanges,
} from '@/api/items';
import { useImportantDates } from '@/api/planning';
import { fetchCategories } from '@/api/session';
import CategoryBox from '@/components/CategoryBox';
import { DayEvents, MealPlan, OverdueStrip, ProgressRing } from '@/components/day/DaySidebar';
import JournalCard from '@/components/day/JournalCard';
import Routines from '@/components/day/Routines';
import Timeline, { useNowMinutes } from '@/components/day/Timeline';
import WeightEntry from '@/components/day/WeightEntry';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import PeriodNav from '@/components/PeriodNav';
import { useItemEditor } from '@/context/ItemEditorContext';
import { usePersonFilter } from '@/context/PersonFilterContext';
import { useSession } from '@/context/SessionContext';
import type { Period } from '@/lib/period';
import { useToday } from '@/lib/useCurrentPeriod';

/**
 * The Daily Agenda. On a phone the sections stack in reading order; on a
 * desktop they sit in three columns (see `.day-grid`).
 */
export default function DayPage({ period }: { period: Period }) {
    const { user, household } = useSession();
    const { person } = usePersonFilter();
    const { editItem } = useItemEditor();
    const today = useToday();
    const isToday = period.key === today;
    const date = period.key;

    const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
    const items = useItems({ periodKey: date, person });
    const overdue = useOverdueItems(isToday ? today : null, person);
    // Routines and habits are personal: always your own, whatever view is chosen.
    const ownItems = useItems({ periodKey: date, person: user.id });
    const habits = useHabitsOn(date, user.id);
    const nowMinutes = useNowMinutes(user.timezone, isToday);

    const createItem = useCreateItem();
    const updateItem = useUpdateItem();
    const deleteItem = useDeleteItem();
    const checkHabit = useCheckHabit();
    const importantDates = useImportantDates(date, date);
    const events = useEvents(date, date);
    const dayEvents = eventsOn(eventsFor(events.data ?? [], person), date, user.timezone);

    const change = (item: Item, changes: ItemChanges) =>
        updateItem.mutate({ id: item.id, changes });

    const live = (list: Item[] | undefined) =>
        (list ?? []).filter((item) => item.status !== 'dropped');
    // Routine tasks live in the routine checklists, not in the category boxes.
    const routineItems = live(ownItems.data).filter((item) => item.routine !== null);
    const boxItems = live(items.data).filter((item) => item.routine === null);
    const all = [...boxItems, ...routineItems];
    const health = categories.data?.find((category) => category.slug === 'health');

    return (
        <>
            <PageHeader>
                <PeriodNav period={period} />
            </PageHeader>
            <main className="container-fluid page-body">
                {categories.isError || items.isError ? (
                    <EmptyState icon={CircleAlert} title="This page didn’t load">
                        Check your connection and try again.
                    </EmptyState>
                ) : (
                    <div className="day-grid" aria-busy={items.isPending}>
                        <div className="day-journal">
                            <div className="day-progress">
                                <ProgressRing
                                    done={all.filter((item) => item.status === 'done').length}
                                    total={all.length}
                                />
                                <span className="text-soft small">
                                    {all.length === 0
                                        ? 'A clear day so far.'
                                        : all.every((item) => item.status === 'done')
                                          ? 'Everything’s done!'
                                          : 'of today’s list done'}
                                </span>
                            </div>
                            {(importantDates.data ?? []).length > 0 && (
                                <ul className="date-chips" aria-label="Important dates">
                                    {importantDates.data!.map((entry) => (
                                        <li key={entry.id} className="month-day-chip">
                                            {entry.title}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <JournalCard date={date} />
                            <OverdueStrip
                                items={overdue.data ?? []}
                                today={today}
                                onChange={change}
                            />
                        </div>

                        <div className="day-boxes">
                            {categories.data?.map((category) => (
                                <CategoryBox
                                    key={category.id}
                                    category={category}
                                    items={boxItems.filter(
                                        (item) => item.category_id === category.id,
                                    )}
                                    members={household.members}
                                    noun="task"
                                    onAdd={(title) =>
                                        createItem.mutate({
                                            title,
                                            category_id: category.id,
                                            scope: 'day',
                                            period_key: date,
                                        })
                                    }
                                    onChange={change}
                                    onEdit={editItem}
                                    onDelete={(item) => deleteItem.mutate({ id: item.id })}
                                >
                                    {category.slug === 'health' && <WeightEntry date={date} />}
                                </CategoryBox>
                            ))}
                        </div>

                        <div className="day-timeline">
                            <Timeline
                                items={all}
                                date={date}
                                events={dayEvents.flatMap((event) => {
                                    const minutes = eventMinutes(event, date, user.timezone);

                                    return minutes ? [{ event, ...minutes }] : [];
                                })}
                                categories={categories.data ?? []}
                                members={household.members}
                                startHour={user.day_start_hour}
                                endHour={user.day_end_hour}
                                nowMinutes={nowMinutes}
                                onChange={change}
                                onEdit={editItem}
                            />
                        </div>

                        <div className="day-side">
                            <Routines
                                items={routineItems}
                                habits={habits.data ?? []}
                                categories={categories.data ?? []}
                                members={household.members}
                                onAdd={(routine, title) =>
                                    createItem.mutate({
                                        title,
                                        // Routines are mostly health habits; the editor can change it.
                                        category_id: health?.id ?? categories.data?.[0]?.id ?? null,
                                        scope: 'day',
                                        period_key: date,
                                        routine,
                                        assignee_user_id: user.id,
                                    })
                                }
                                onChange={change}
                                onEdit={editItem}
                                onCheckHabit={(habit, done) =>
                                    checkHabit.mutate({ id: habit.id, date, done })
                                }
                            />
                            <MealPlan date={date} />
                            <DayEvents date={date} isToday={isToday} events={dayEvents} />
                        </div>
                    </div>
                )}
            </main>
        </>
    );
}
