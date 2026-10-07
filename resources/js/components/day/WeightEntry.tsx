import { Scale } from 'lucide-react';
import { useSaveWeight, useWeightOn } from '@/api/day';
import { useDraft } from '@/lib/useDraft';

/** The day's weight, entered right in the Health box. It is personal to whoever is signed in. */
export default function WeightEntry({ date }: { date: string }) {
    const entry = useWeightOn(date);
    const save = useSaveWeight(date);
    const saved = entry.data ? String(entry.data.weight) : '';
    const draft = useDraft(saved);

    const commit = () => {
        const text = draft.value.trim();
        const weight = Number(text);

        if (!draft.touched || text === saved) {
            draft.reset();
        } else if (text === '') {
            // Clearing the field removes the day's entry.
            save.mutate(null);
        } else if (weight > 0 && weight < 1000) {
            save.mutate(weight);
        } else {
            draft.reset();
        }
    };

    return (
        <div className="weight-entry">
            <label htmlFor={`weight-${date}`}>
                <Scale aria-hidden="true" size={16} /> Weight
            </label>
            <input
                id={`weight-${date}`}
                type="number"
                inputMode="decimal"
                step="0.1"
                min="1"
                max="999"
                value={draft.value}
                disabled={!entry.isSuccess}
                onChange={(event) => draft.set(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            />
            <span className="text-soft small">lb</span>
        </div>
    );
}
