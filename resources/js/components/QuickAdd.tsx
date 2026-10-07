import { useQuery } from '@tanstack/react-query';
import { Star, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useCreateItem } from '@/api/items';
import { fetchCategories } from '@/api/session';
import { periodFromDate, type Period } from '@/lib/period';
import { periodName } from '@/lib/periodLabels';
import CategoryIcon from './CategoryIcon';

type Props = {
    /** Where a new item goes unless a specific day is picked: the period on screen. */
    defaultPeriod: Period;
    onClose: () => void;
};

/** The sheet behind the floating + button: add a task or goal from anywhere. */
export default function QuickAdd({ defaultPeriod, onClose }: Props) {
    const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
    const createItem = useCreateItem();
    const titleInput = useRef<HTMLInputElement>(null);

    const [title, setTitle] = useState('');
    const [categoryId, setCategoryId] = useState<number | null>(null);
    // On a goal page, the item can go to that period or to a specific day.
    const [date, setDate] = useState(defaultPeriod.scope === 'day' ? defaultPeriod.key : '');
    const [time, setTime] = useState('');
    const [starred, setStarred] = useState(false);

    const period = date ? periodFromDate('day', date) : defaultPeriod;
    const selectedCategory = categoryId ?? categories.data?.at(-1)?.id ?? null;
    const canSave = title.trim() !== '' && selectedCategory !== null && !createItem.isPending;

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

        if (!canSave) {
            return;
        }

        createItem.mutate(
            {
                title: title.trim(),
                category_id: selectedCategory,
                scope: period.scope,
                period_key: period.key,
                due_time: period.scope === 'day' && time ? time : null,
                starred,
            },
            { onSuccess: onClose },
        );
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
                aria-labelledby="quick-add-title"
                onSubmit={submit}
            >
                <div className="d-flex align-items-center justify-content-between mb-2">
                    <h2 id="quick-add-title" className="font-display h3 mb-0">
                        Quick add
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

                <label className="field-label" htmlFor="quick-add-text">
                    What needs doing?
                </label>
                <input
                    ref={titleInput}
                    id="quick-add-text"
                    className="field-input mb-3"
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={255}
                    autoComplete="off"
                />

                <span className="field-label" id="quick-add-category">
                    Category
                </span>
                <div
                    className="d-flex flex-wrap gap-2 mb-3"
                    role="radiogroup"
                    aria-labelledby="quick-add-category"
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
                    <div className="col-7">
                        <label className="field-label" htmlFor="quick-add-date">
                            {defaultPeriod.scope === 'day' ? 'Day' : 'On a specific day (optional)'}
                        </label>
                        <input
                            id="quick-add-date"
                            className="field-input"
                            type="date"
                            value={date}
                            required={defaultPeriod.scope === 'day'}
                            onChange={(event) => setDate(event.target.value)}
                        />
                    </div>
                    <div className="col-5">
                        <label className="field-label" htmlFor="quick-add-time">
                            Time (optional)
                        </label>
                        <input
                            id="quick-add-time"
                            className="field-input"
                            type="time"
                            value={time}
                            disabled={period.scope !== 'day'}
                            onChange={(event) => setTime(event.target.value)}
                        />
                    </div>
                </div>

                <p className="text-soft small mb-3" aria-live="polite">
                    Adds to <strong>{periodName(period)}</strong>
                </p>

                {createItem.isError && (
                    <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
                        That didn’t save. Please try again.
                    </p>
                )}

                <div className="d-flex align-items-center gap-2">
                    <button
                        type="button"
                        className="icon-button star"
                        aria-pressed={starred}
                        aria-label="Star this"
                        onClick={() => setStarred(!starred)}
                    >
                        <Star aria-hidden="true" />
                    </button>
                    <button type="button" className="button-plain ms-auto" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button-ink" disabled={!canSave}>
                        Add
                    </button>
                </div>
            </form>
        </div>
    );
}
