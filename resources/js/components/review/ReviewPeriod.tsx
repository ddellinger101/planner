import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useItems, useUpdateItem } from '@/api/items';
import { useCarryItem } from '@/api/review';
import { fetchCategories } from '@/api/session';
import CategoryIcon from '@/components/CategoryIcon';
import { BestPart } from '@/components/period/Summaries';
import { parsePeriod } from '@/lib/period';
import { periodShortName } from '@/lib/periodLabels';

type Props = {
    /** The period being looked back on. */
    periodKey: string;
    /** Where "carry forward" sends an item. */
    nextPeriodKey: string;
};

/**
 * The rollover review of one period: every item still open, with a choice
 * for each of done, carry forward or drop.
 */
export default function ReviewPeriod({ periodKey, nextPeriodKey }: Props) {
    const period = parsePeriod(periodKey)!;
    const next = parsePeriod(nextPeriodKey)!;
    const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
    // Both people's items: the review is for the household.
    const items = useItems({ periodKey, person: null });
    const updateItem = useUpdateItem();
    const carry = useCarryItem();

    const open = (items.data ?? []).filter((item) => item.status === 'open');
    const groups = (categories.data ?? [])
        .map((category) => ({
            category,
            items: open.filter((item) => item.category_id === category.id),
        }))
        .filter((group) => group.items.length > 0);

    const carryAll = () =>
        open.forEach((item) => carry.mutate({ id: item.id, periodKey: nextPeriodKey }));

    return (
        <div className="review-period">
            {(period.scope === 'week' || period.scope === 'month') && (
                <BestPart key={periodKey} period={period} past />
            )}

            {items.isPending ? (
                <p className="text-soft">Loading…</p>
            ) : open.length === 0 ? (
                <p className="review-clear">
                    <Check aria-hidden="true" size={18} /> Nothing left open in{' '}
                    {periodShortName(period)}.
                </p>
            ) : (
                <>
                    <p className="text-soft small mb-0">
                        {open.length === 1 ? '1 item is' : `${open.length} items are`} still open.
                        Finish each one, carry it into {periodShortName(next)}, or let it go.
                    </p>
                    {groups.map(({ category, items: categoryItems }) => (
                        <section
                            key={category.id}
                            className="cat"
                            style={{ '--cat': category.color } as CSSProperties}
                            aria-label={category.name}
                        >
                            <h3 className="review-category">
                                <CategoryIcon icon={category.icon} size={18} />
                                <span className="highlight-heading">{category.name}</span>
                            </h3>
                            <ul className="review-list">
                                {categoryItems.map((item) => (
                                    <li key={item.id}>
                                        <span className="review-title">{item.title}</span>
                                        <span
                                            className="overdue-actions"
                                            role="group"
                                            aria-label={item.title}
                                        >
                                            <button
                                                type="button"
                                                className="button-plain is-small"
                                                onClick={() =>
                                                    updateItem.mutate({
                                                        id: item.id,
                                                        changes: { status: 'done' },
                                                    })
                                                }
                                            >
                                                <Check aria-hidden="true" size={14} /> Done
                                            </button>
                                            <button
                                                type="button"
                                                className="button-plain is-small"
                                                disabled={carry.isPending}
                                                onClick={() =>
                                                    carry.mutate({
                                                        id: item.id,
                                                        periodKey: nextPeriodKey,
                                                    })
                                                }
                                            >
                                                <ArrowRight aria-hidden="true" size={14} /> Carry
                                                forward
                                            </button>
                                            <button
                                                type="button"
                                                className="button-plain is-small"
                                                onClick={() =>
                                                    updateItem.mutate({
                                                        id: item.id,
                                                        changes: { status: 'dropped' },
                                                    })
                                                }
                                            >
                                                <X aria-hidden="true" size={14} /> Drop
                                            </button>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                    {open.length > 1 && (
                        <button
                            type="button"
                            className="button-plain align-self-start"
                            disabled={carry.isPending}
                            onClick={carryAll}
                        >
                            Carry all {open.length} forward
                        </button>
                    )}
                </>
            )}

            {carry.isError && (
                <p className="small mb-0" role="alert" style={{ color: 'var(--danger)' }}>
                    That didn’t save. Please try again.
                </p>
            )}
        </div>
    );
}
