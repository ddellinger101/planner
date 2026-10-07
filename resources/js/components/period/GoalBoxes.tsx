import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Target } from 'lucide-react';
import { useCreateItem, useDeleteItem, useItems, useUpdateItem } from '@/api/items';
import { useSaveWeightGoal, useWeightGoal } from '@/api/planning';
import { fetchCategories } from '@/api/session';
import CategoryBox from '@/components/CategoryBox';
import EmptyState from '@/components/EmptyState';
import { useItemEditor } from '@/context/ItemEditorContext';
import { usePersonFilter } from '@/context/PersonFilterContext';
import { useSession } from '@/context/SessionContext';
import type { Period } from '@/lib/period';
import { useDraft } from '@/lib/useDraft';

/** A week's, month's, quarter's or year's goals: one box per category. */
export default function GoalBoxes({ period }: { period: Period }) {
    const { household } = useSession();
    const { person } = usePersonFilter();
    const { editItem } = useItemEditor();
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
        <div className="row g-3" aria-busy={items.isPending}>
            {categories.data?.map((category) => (
                <div key={category.id} className="col-12 col-md-6 col-xl-4">
                    <CategoryBox
                        category={category}
                        items={(items.data ?? []).filter(
                            (item) => item.category_id === category.id,
                        )}
                        members={household.members}
                        noun="goal"
                        onAdd={(title) =>
                            createItem.mutate({
                                title,
                                category_id: category.id,
                                scope: period.scope,
                                period_key: period.key,
                            })
                        }
                        onChange={(item, changes) => updateItem.mutate({ id: item.id, changes })}
                        onEdit={editItem}
                        onDelete={(item) => deleteItem.mutate({ id: item.id })}
                    >
                        {category.slug === 'health' && <WeightGoal periodKey={period.key} />}
                    </CategoryBox>
                </div>
            ))}
        </div>
    );
}

/** The weight to reach by the end of the period. Personal to whoever is signed in. */
function WeightGoal({ periodKey }: { periodKey: string }) {
    const goal = useWeightGoal(periodKey);
    const save = useSaveWeightGoal(periodKey);
    const saved = goal.data ? String(goal.data.target_weight) : '';
    const draft = useDraft(saved);

    const commit = () => {
        const text = draft.value.trim();
        const target = Number(text);

        if (!draft.touched || text === saved) {
            draft.reset();
        } else if (text === '') {
            save.mutate(null);
        } else if (target > 0 && target < 1000) {
            save.mutate(target);
        } else {
            draft.reset();
        }
    };

    return (
        <div className="weight-entry">
            <label htmlFor={`weight-goal-${periodKey}`}>
                <Target aria-hidden="true" size={16} /> Weight goal
            </label>
            <input
                id={`weight-goal-${periodKey}`}
                type="number"
                inputMode="decimal"
                step="0.1"
                min="1"
                max="999"
                value={draft.value}
                disabled={!goal.isSuccess}
                onChange={(event) => draft.set(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            />
            <span className="text-soft small">lb</span>
        </div>
    );
}
