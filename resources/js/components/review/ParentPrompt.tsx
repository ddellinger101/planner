import { useQuery } from '@tanstack/react-query';
import { Target, X } from 'lucide-react';
import { useEffect } from 'react';
import { api } from '@/api/client';
import { useUpdateItem, type Item } from '@/api/items';
import { parsePeriod } from '@/lib/period';
import { periodName } from '@/lib/periodLabels';

type Props = {
    /** The item that was just finished; it has a parent goal. */
    child: Item;
    onClose: () => void;
};

/**
 * After finishing something pulled from a larger goal, offer to finish that
 * goal too. It appears only while the goal is still open and goes away on
 * its own.
 */
export default function ParentPrompt({ child, onClose }: Props) {
    const updateItem = useUpdateItem();
    const parent = useQuery({
        queryKey: ['item', child.parent_item_id],
        queryFn: () => api<Item>(`/api/items/${child.parent_item_id}`),
        staleTime: 0,
    });

    const relevant = parent.data?.status === 'open';

    useEffect(() => {
        const timer = window.setTimeout(onClose, 15_000);

        return () => window.clearTimeout(timer);
    }, [onClose]);

    if (!relevant) {
        return null;
    }

    const goal = parent.data!;
    const period = parsePeriod(goal.period_key);

    return (
        <div className="planner-card toast-prompt" role="status">
            <Target aria-hidden="true" size={20} />
            <p className="mb-0">
                That was part of <strong>{goal.title}</strong>
                {period ? `, a goal for ${periodName(period)}` : ''}. Mark the goal done too?
            </p>
            <button
                type="button"
                className="button-ink is-small"
                onClick={() => {
                    updateItem.mutate({ id: goal.id, changes: { status: 'done' } });
                    onClose();
                }}
            >
                Mark it done
            </button>
            <button
                type="button"
                className="icon-button is-small"
                aria-label="Not now"
                onClick={onClose}
            >
                <X aria-hidden="true" size={16} />
            </button>
        </div>
    );
}
