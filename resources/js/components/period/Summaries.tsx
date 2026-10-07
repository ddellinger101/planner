import { Smile } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useJournal, useSaveJournal } from '@/api/day';
import type { Item } from '@/api/items';
import type { Completion } from '@/api/planning';
import type { Category } from '@/api/session';
import type { Period } from '@/lib/period';
import { periodName } from '@/lib/periodLabels';
import { useDraft } from '@/lib/useDraft';

/** "Best part about this week / month": one line, saved when you leave it. */
export function BestPart({ period, past = false }: { period: Period; past?: boolean }) {
    const journal = useJournal(period.key);
    const save = useSaveJournal(period.key);
    const saved = journal.data?.find((entry) => entry.type === 'best_part')?.body ?? '';
    const draft = useDraft(saved);
    const id = `best-part-${period.key}`;

    const commit = () => {
        if (draft.touched && draft.value.trim() !== saved) {
            save.mutate({ type: 'best_part', body: draft.value.trim() });
        }

        draft.settle();
    };

    return (
        <section className="planner-card journal-card h-100">
            <div className="journal-line">
                <label htmlFor={id}>
                    <Smile aria-hidden="true" size={18} />
                    {/* In a review, the period being looked back on is over. */}
                    Best part about {past ? periodName(period) : `this ${period.scope}`}
                </label>
                <div className="journal-field">
                    <input
                        id={id}
                        type="text"
                        value={draft.value}
                        disabled={!journal.isSuccess}
                        maxLength={500}
                        onChange={(event) => draft.set(event.target.value)}
                        onBlur={commit}
                        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                    />
                </div>
            </div>
        </section>
    );
}

/** A labelled bar: "3 of 5". */
export function CompletionBar({ label, done, total }: Completion & { label: string }) {
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);

    return (
        <div className="completion">
            <div className="completion-label">
                <span>{label}</span>
                <span className="text-soft">
                    {total === 0 ? 'No goals' : `${done} of ${total}`}
                    <span className="visually-hidden"> done</span>
                </span>
            </div>
            <div className="completion-track" aria-hidden="true">
                <div className="completion-fill" style={{ width: `${percent}%` }} />
            </div>
        </div>
    );
}

type ProgressProps = {
    title: string;
    categories: Category[];
    /** The period's goals. */
    items: Item[];
};

/** How far along each category's goals are. */
export function CategoryProgress({ title, categories, items }: ProgressProps) {
    const active = items.filter((item) => item.status !== 'dropped');

    return (
        <section className="planner-card p-3 h-100" aria-labelledby="category-progress">
            <h2 id="category-progress" className="font-display h4 mb-2">
                {title}
            </h2>
            <div className="d-grid gap-2">
                {categories.map((category) => {
                    const goals = active.filter((item) => item.category_id === category.id);

                    return (
                        <div
                            key={category.id}
                            className="cat"
                            style={{ '--cat': category.color } as CSSProperties}
                        >
                            <CompletionBar
                                label={category.name}
                                total={goals.length}
                                done={goals.filter((item) => item.status === 'done').length}
                            />
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
