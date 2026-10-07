import { useQuery } from '@tanstack/react-query';
import { Star, Trash2, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '@/api/client';
import {
    BUCKETS,
    useAssignBrainDump,
    useDeleteBrainDump,
    useUpdateBrainDump,
    type BrainDumpBucket,
    type BrainDumpItem,
} from '@/api/brainDump';
import { fetchCategories } from '@/api/session';
import CategoryIcon from '@/components/CategoryIcon';
import RepeatField from '@/components/RepeatField';
import { nextPeriod, parsePeriod, periodFromDate } from '@/lib/period';
import { periodName } from '@/lib/periodLabels';
import { useToday } from '@/lib/useCurrentPeriod';

type SheetProps = {
    title: string;
    labelledBy: string;
    onClose: () => void;
    onSubmit?: (event: FormEvent) => void;
    children: ReactNode;
};

export function Sheet({ title, labelledBy, onClose, onSubmit, children }: SheetProps) {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return (
        <div
            className="sheet-backdrop"
            onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
            <form
                className="sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                onSubmit={onSubmit ?? ((event) => event.preventDefault())}
            >
                <div className="d-flex align-items-center justify-content-between mb-2">
                    <h2 id={labelledBy} className="font-display h3 mb-0">
                        {title}
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
                {children}
            </form>
        </div>
    );
}

/**
 * "Add to Plan". The common case is two taps: this sheet opens, and Today,
 * Tomorrow or This week saves at once with the box's usual category. The
 * rest is there for when it's needed.
 */
export function PlanSheet({ item, onClose }: { item: BrainDumpItem; onClose: () => void }) {
    const today = useToday();
    const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
    const assign = useAssignBrainDump();
    const defaultSlug = BUCKETS.find((entry) => entry.bucket === item.bucket)!.categorySlug;

    const [categoryId, setCategoryId] = useState<number | null>(null);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [starred, setStarred] = useState(false);
    const [rule, setRule] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // A task from Google keeps the category of the list it came from.
    const selectedCategory =
        categoryId ??
        item.suggested_category_id ??
        categories.data?.find((category) => category.slug === defaultSlug)?.id;

    const tomorrow = nextPeriod(periodFromDate('day', today)).key;
    const thisWeek = periodFromDate('week', today);

    const plan = (periodKey: string) => {
        const isDay = parsePeriod(periodKey)?.scope === 'day';

        setError(null);
        assign.mutate(
            {
                id: item.id,
                period_key: periodKey,
                category_id: selectedCategory,
                starred,
                // A goal for the week has no time of day and doesn't repeat.
                due_time: isDay && time ? time : null,
                recurrence_rule: isDay ? rule : null,
            },
            {
                onSuccess: onClose,
                onError: (reason) =>
                    setError(
                        reason instanceof ApiError && reason.status === 409
                            ? 'That’s already in the plan.'
                            : 'That didn’t save. Please try again.',
                    ),
            },
        );
    };

    return (
        <Sheet title="Add to plan" labelledBy="plan-sheet-title" onClose={onClose}>
            <p className="fw-bold mb-3">{item.title}</p>

            <div className="plan-quick" role="group" aria-label="When">
                <button
                    type="button"
                    className="button-ink"
                    disabled={assign.isPending}
                    onClick={() => plan(today)}
                >
                    Today
                </button>
                <button
                    type="button"
                    className="button-plain"
                    disabled={assign.isPending}
                    onClick={() => plan(tomorrow)}
                >
                    Tomorrow
                </button>
                <button
                    type="button"
                    className="button-plain"
                    disabled={assign.isPending}
                    title={periodName(thisWeek)}
                    onClick={() => plan(thisWeek.key)}
                >
                    This week
                </button>
            </div>

            <div className="d-flex align-items-end gap-2 mt-3">
                <div className="flex-grow-1">
                    <label className="field-label" htmlFor="plan-sheet-date">
                        Or pick a date
                    </label>
                    <input
                        id="plan-sheet-date"
                        className="field-input"
                        type="date"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                    />
                </div>
                <button
                    type="button"
                    className="button-plain"
                    disabled={!date || assign.isPending}
                    onClick={() => plan(date)}
                >
                    Add on that day
                </button>
            </div>

            {error && (
                <p className="small mt-2 mb-0" role="alert" style={{ color: 'var(--danger)' }}>
                    {error}
                </p>
            )}

            <details className="plan-more">
                <summary>More options</summary>

                <span className="field-label mt-2" id="plan-sheet-category">
                    Category
                </span>
                <div
                    className="d-flex flex-wrap gap-2 mb-3"
                    role="radiogroup"
                    aria-labelledby="plan-sheet-category"
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

                <div className="row g-3 align-items-end mb-3">
                    <div className="col-6">
                        <label className="field-label" htmlFor="plan-sheet-time">
                            Time (optional)
                        </label>
                        <input
                            id="plan-sheet-time"
                            className="field-input"
                            type="time"
                            value={time}
                            onChange={(event) => setTime(event.target.value)}
                        />
                    </div>
                    <div className="col-6">
                        <button
                            type="button"
                            className="button-plain d-inline-flex align-items-center gap-2 star"
                            aria-pressed={starred}
                            onClick={() => setStarred(!starred)}
                        >
                            <Star aria-hidden="true" size={18} /> Star it
                        </button>
                    </div>
                </div>

                {/* The repeat presets are worded for the day it will start on. */}
                <RepeatField date={date || today} value={rule} onChange={setRule} />
                <p className="text-soft small mt-2 mb-0">
                    Time and repeat apply when it goes on a day, not on “This week”.
                </p>
            </details>
        </Sheet>
    );
}

/** Rename an item, move it to another box, or delete it. */
export function DumpEditSheet({ item, onClose }: { item: BrainDumpItem; onClose: () => void }) {
    const update = useUpdateBrainDump();
    const remove = useDeleteBrainDump();
    const [title, setTitle] = useState(item.title);
    const [bucket, setBucket] = useState(item.bucket);

    const submit = (event: FormEvent) => {
        event.preventDefault();

        if (!title.trim()) {
            return;
        }

        if (title.trim() !== item.title || bucket !== item.bucket) {
            update.mutate({ id: item.id, title: title.trim(), bucket });
        }

        onClose();
    };

    return (
        <Sheet title="Edit item" labelledBy="dump-edit-title" onClose={onClose} onSubmit={submit}>
            <label className="field-label" htmlFor="dump-edit-text">
                What is it?
            </label>
            <input
                id="dump-edit-text"
                className="field-input mb-3"
                type="text"
                value={title}
                maxLength={255}
                autoComplete="off"
                onChange={(event) => setTitle(event.target.value)}
            />

            <label className="field-label" htmlFor="dump-edit-bucket">
                Box
            </label>
            <select
                id="dump-edit-bucket"
                className="field-input mb-3"
                value={bucket}
                onChange={(event) => setBucket(event.target.value as BrainDumpBucket)}
            >
                {BUCKETS.map((entry) => (
                    <option key={entry.bucket} value={entry.bucket}>
                        {entry.name}
                    </option>
                ))}
            </select>

            <div className="d-flex align-items-center gap-2">
                <button
                    type="button"
                    className="icon-button task-delete-always"
                    aria-label="Delete this item"
                    onClick={() => remove.mutate(item.id, { onSuccess: onClose })}
                >
                    <Trash2 aria-hidden="true" size={20} />
                </button>
                <button type="button" className="button-plain ms-auto" onClick={onClose}>
                    Cancel
                </button>
                <button type="submit" className="button-ink" disabled={!title.trim()}>
                    Save
                </button>
            </div>
        </Sheet>
    );
}
