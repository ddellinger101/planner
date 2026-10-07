import { useSaveMealNote, type Meal, type MealSlot } from '@/api/day';
import { useDraft } from '@/lib/useDraft';

type Props = {
    date: string;
    slot: Exclude<MealSlot, 'unknown'>;
    /** The note already written for this meal, if any. */
    note?: Meal;
    /** Names the field for screen readers, e.g. "Dinner on Friday". */
    label: string;
};

/**
 * A line to jot a meal on, for a slot Chef hasn't planned. It saves when
 * left; once Chef plans that meal, Chef's takes its place.
 */
export default function MealNote({ date, slot, note, label }: Props) {
    const save = useSaveMealNote();
    const saved = note?.title ?? '';
    const draft = useDraft(saved);

    const commit = () => {
        const title = draft.value.trim();

        if (title === saved) {
            draft.reset();

            return;
        }

        save.mutate({ date, slot, title }, { onSuccess: draft.settle, onError: draft.reset });
    };

    return (
        <input
            type="text"
            className="meal-note"
            value={draft.value}
            placeholder="Add a note…"
            aria-label={label}
            maxLength={255}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(event) => draft.set(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
    );
}
