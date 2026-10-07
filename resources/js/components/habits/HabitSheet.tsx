import { useQuery } from '@tanstack/react-query';
import { Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import type { Habit } from '@/api/day';
import { useDeleteHabit, useSaveHabit } from '@/api/habits';
import { fetchCategories } from '@/api/session';
import CategoryIcon from '@/components/CategoryIcon';
import { useSession } from '@/context/SessionContext';

export type HabitTarget =
    { kind: 'create'; routine: Habit['routine'] } | { kind: 'edit'; habit: Habit };

const ROUTINES: { value: Habit['routine']; label: string }[] = [
    { value: 'morning', label: 'Morning' },
    { value: 'evening', label: 'Evening' },
    { value: 'anytime', label: 'Anytime' },
];

/** Add a habit, or change or delete one. */
export default function HabitSheet({
    target,
    onClose,
}: {
    target: HabitTarget;
    onClose: () => void;
}) {
    const { user, household } = useSession();
    const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
    const save = useSaveHabit();
    const remove = useDeleteHabit();
    const titleInput = useRef<HTMLInputElement>(null);
    const habit = target.kind === 'edit' ? target.habit : null;

    const [title, setTitle] = useState(habit?.title ?? '');
    const [routine, setRoutine] = useState(
        habit?.routine ?? (target.kind === 'create' ? target.routine : 'anytime'),
    );
    const [categoryId, setCategoryId] = useState<number | null | undefined>(habit?.category_id);
    const [target_, setTarget] = useState(habit?.target_per_week ?? 7);
    const [owner, setOwner] = useState(habit?.user_id ?? user.id);
    const [confirming, setConfirming] = useState(false);

    // A new habit starts in Health, where most habits belong.
    const selectedCategory =
        categoryId === undefined
            ? (categories.data?.find((category) => category.slug === 'health')?.id ?? null)
            : categoryId;
    const busy = save.isPending || remove.isPending;

    useEffect(() => {
        titleInput.current?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const submit = (event: FormEvent) => {
        event.preventDefault();

        if (title.trim() && !busy) {
            save.mutate(
                {
                    id: habit?.id,
                    title: title.trim(),
                    routine,
                    category_id: selectedCategory,
                    target_per_week: target_,
                    user_id: owner,
                },
                { onSuccess: onClose },
            );
        }
    };

    return (
        <div
            className="sheet-backdrop"
            onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
            <form
                className="sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="habit-sheet-title"
                onSubmit={submit}
            >
                <div className="d-flex align-items-center justify-content-between mb-2">
                    <h2 id="habit-sheet-title" className="font-display h3 mb-0">
                        {habit ? 'Edit habit' : 'New habit'}
                    </h2>
                    <button
                        type="button"
                        className="icon-button"
                        aria-label="Close"
                        onClick={onClose}
                    >
                        <X aria-hidden="true" />
                    </button>
                </div>

                <label className="field-label" htmlFor="habit-title">
                    Habit
                </label>
                <input
                    ref={titleInput}
                    id="habit-title"
                    className="field-input mb-3"
                    type="text"
                    value={title}
                    maxLength={255}
                    autoComplete="off"
                    placeholder="Floss, read 20 pages, walk…"
                    onChange={(event) => setTitle(event.target.value)}
                />

                <span className="field-label" id="habit-routine">
                    When
                </span>
                <div className="segmented mb-3" role="radiogroup" aria-labelledby="habit-routine">
                    {ROUTINES.map(({ value, label }) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={routine === value}
                            aria-pressed={routine === value}
                            onClick={() => setRoutine(value)}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <span className="field-label" id="habit-category">
                    Category
                </span>
                <div
                    className="d-flex flex-wrap gap-2 mb-3"
                    role="radiogroup"
                    aria-labelledby="habit-category"
                >
                    {categories.data?.map((category) => (
                        <button
                            key={category.id}
                            type="button"
                            role="radio"
                            aria-checked={selectedCategory === category.id}
                            className="cat chip"
                            style={{ '--cat': category.color } as CSSProperties}
                            onClick={() => setCategoryId(category.id)}
                        >
                            <CategoryIcon icon={category.icon} size={17} />
                            {category.name}
                        </button>
                    ))}
                </div>

                <div className="row g-3 mb-3">
                    <div className="col-12 col-sm-6">
                        <label className="field-label" htmlFor="habit-target">
                            How often
                        </label>
                        <select
                            id="habit-target"
                            className="field-input"
                            value={target_}
                            onChange={(event) => setTarget(Number(event.target.value))}
                        >
                            <option value={7}>Every day</option>
                            {[6, 5, 4, 3, 2].map((times) => (
                                <option key={times} value={times}>
                                    {times} times a week
                                </option>
                            ))}
                            <option value={1}>Once a week</option>
                        </select>
                    </div>
                    {household.members.length > 1 && (
                        <div className="col-12 col-sm-6">
                            <label className="field-label" htmlFor="habit-owner">
                                Whose habit
                            </label>
                            <select
                                id="habit-owner"
                                className="field-input"
                                value={owner}
                                onChange={(event) => setOwner(Number(event.target.value))}
                            >
                                {household.members.map((member) => (
                                    <option key={member.id} value={member.id}>
                                        {member.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {(save.isError || remove.isError) && (
                    <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
                        That didn’t save. Please try again.
                    </p>
                )}

                {confirming && habit ? (
                    <div role="group" aria-label="Delete this habit?">
                        <p className="mb-2">
                            Delete <strong>{habit.title}</strong> and its whole history? This can’t
                            be undone.
                        </p>
                        <div className="d-flex gap-2 justify-content-end">
                            <button
                                type="button"
                                className="button-plain"
                                onClick={() => setConfirming(false)}
                            >
                                Keep it
                            </button>
                            <button
                                type="button"
                                className="button-ink is-danger"
                                disabled={busy}
                                onClick={() => remove.mutate(habit.id, { onSuccess: onClose })}
                            >
                                Delete habit
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="d-flex align-items-center gap-2">
                        {habit && (
                            <button
                                type="button"
                                className="icon-button task-delete-always"
                                aria-label="Delete this habit"
                                onClick={() => setConfirming(true)}
                            >
                                <Trash2 aria-hidden="true" size={20} />
                            </button>
                        )}
                        <button type="button" className="button-plain ms-auto" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="button-ink"
                            disabled={!title.trim() || busy}
                        >
                            {habit ? 'Save' : 'Add habit'}
                        </button>
                    </div>
                )}
            </form>
        </div>
    );
}
