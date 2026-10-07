import { useQuery } from '@tanstack/react-query';
import { Star, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ApiError } from '@/api/client';
import {
    isRepeating,
    useCreateItem,
    useDeleteItem,
    useUpdateItem,
    type ApplyTo,
    type Item,
    type ItemChanges,
    type Routine,
} from '@/api/items';
import { fetchCategories } from '@/api/session';
import { useSession } from '@/context/SessionContext';
import { parsePeriod, periodFromDate, type Period } from '@/lib/period';
import { periodName } from '@/lib/periodLabels';
import CategoryIcon from './CategoryIcon';
import RepeatField from './RepeatField';

export type SheetTarget =
    /** Add something new; it goes to the period on screen unless a day is picked. */
    { kind: 'create'; defaultPeriod: Period } | { kind: 'edit'; item: Item };

type Props = {
    target: SheetTarget;
    onClose: () => void;
};

// Changing any of these on a repeating task raises the question of which
// occurrences the change is for.
const SHARED_FIELDS: (keyof ItemChanges)[] = [
    'title',
    'notes',
    'category_id',
    'due_time',
    'duration_minutes',
    'starred',
    'routine',
    'assignee_user_id',
    'recurrence_rule',
];

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const DEFAULT_DURATION = 30;

type Pending = { action: 'save'; changes: ItemChanges } | { action: 'delete' };

/** The sheet for adding a task or goal, and for editing or deleting one. */
export default function ItemSheet({ target, onClose }: Props) {
    const { user, household } = useSession();
    const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
    const createItem = useCreateItem();
    const updateItem = useUpdateItem();
    const deleteItem = useDeleteItem();
    const titleInput = useRef<HTMLInputElement>(null);

    const item = target.kind === 'edit' ? target.item : null;
    const basePeriod = item
        ? parsePeriod(item.period_key)!
        : target.kind === 'create'
          ? target.defaultPeriod
          : null!;

    const [title, setTitle] = useState(item?.title ?? '');
    const [categoryId, setCategoryId] = useState<number | null>(item?.category_id ?? null);
    // A goal's page can also add a task to a specific day; an empty date means "this period".
    const [date, setDate] = useState(basePeriod.scope === 'day' ? basePeriod.key : '');
    const [time, setTime] = useState(item?.due_time ?? '');
    // Left unset, a timed task takes the timeline's default length.
    const [duration, setDuration] = useState(item?.duration_minutes ?? null);
    const [routine, setRoutine] = useState<Routine | null>(item?.routine ?? null);
    const [rule, setRule] = useState(item?.recurrence_rule ?? null);
    const [notes, setNotes] = useState(item?.notes ?? '');
    const [starred, setStarred] = useState(item?.starred ?? false);
    const [assignee, setAssignee] = useState<number | null | undefined>(item?.assignee_user_id);
    const [pending, setPending] = useState<Pending | null>(null);
    const [error, setError] = useState<string | null>(null);

    const period = date ? periodFromDate('day', date) : basePeriod;
    const isDay = period.scope === 'day';
    const selectedCategory = categoryId ?? categories.data?.at(-1)?.id ?? null;
    // Day tasks default to whoever adds them, goals to both people.
    const selectedAssignee = assignee === undefined ? (isDay ? user.id : null) : assignee;
    const busy = createItem.isPending || updateItem.isPending || deleteItem.isPending;
    const canSave = title.trim() !== '' && selectedCategory !== null && !busy;
    const noun = (item?.scope ?? basePeriod.scope) === 'day' ? 'task' : 'goal';

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

    const fail = (reason: unknown) => {
        const invalidRule =
            reason instanceof ApiError &&
            reason.status === 422 &&
            JSON.stringify(reason.body).includes('recurrence_rule');

        setPending(null);
        setError(
            invalidRule
                ? 'That repeat rule isn’t valid. Check it and try again.'
                : 'That didn’t save. Please try again.',
        );
    };

    /** Everything the form holds, as the API wants it. */
    const values = (): ItemChanges => ({
        title: title.trim(),
        category_id: selectedCategory,
        period_key: period.key,
        due_time: isDay && time ? time : null,
        duration_minutes: isDay && time ? duration : null,
        starred,
        routine: isDay ? routine : null,
        recurrence_rule: isDay ? rule : null,
        notes: notes.trim() || null,
        assignee_user_id: selectedAssignee,
    });

    const run = (action: Pending, applyTo?: ApplyTo) => {
        if (!item) {
            return;
        }

        const options = { onSuccess: onClose, onError: fail };

        if (action.action === 'delete') {
            deleteItem.mutate({ id: item.id, applyTo }, options);
        } else {
            updateItem.mutate({ id: item.id, changes: action.changes, applyTo }, options);
        }
    };

    /** Ask which occurrences a change is for, when the task repeats and it matters. */
    const start = (action: Pending) => {
        const needsChoice =
            item !== null &&
            isRepeating(item) &&
            (action.action === 'delete' || SHARED_FIELDS.some((field) => field in action.changes));

        if (needsChoice) {
            setPending(action);
        } else {
            run(action);
        }
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        setError(null);

        if (!canSave) {
            return;
        }

        if (!item) {
            createItem.mutate(
                {
                    ...values(),
                    title: title.trim(),
                    category_id: selectedCategory,
                    scope: period.scope,
                    period_key: period.key,
                },
                { onSuccess: onClose, onError: fail },
            );

            return;
        }

        // Send only what changed, so an untouched field can't overwrite anything.
        const all = values();
        const changes = Object.fromEntries(
            Object.entries(all).filter(([key, value]) => item[key as keyof Item] !== value),
        ) as ItemChanges;

        if (Object.keys(changes).length === 0) {
            onClose();
        } else {
            start({ action: 'save', changes });
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
                aria-labelledby="item-sheet-title"
                onSubmit={submit}
            >
                <div className="d-flex align-items-center justify-content-between mb-2">
                    <h2 id="item-sheet-title" className="font-display h3 mb-0">
                        {item ? `Edit ${noun}` : 'Quick add'}
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

                {pending ? (
                    <ApplyToChoice
                        pending={pending}
                        // A new rule can't belong to a single occurrence.
                        allowOne={
                            pending.action === 'delete' || !('recurrence_rule' in pending.changes)
                        }
                        busy={busy}
                        onChoose={(applyTo) => run(pending, applyTo)}
                        onBack={() => setPending(null)}
                    />
                ) : (
                    <>
                        <label className="field-label" htmlFor="item-sheet-text">
                            What needs doing?
                        </label>
                        <input
                            ref={titleInput}
                            id="item-sheet-text"
                            className="field-input mb-3"
                            type="text"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            maxLength={255}
                            autoComplete="off"
                        />

                        <span className="field-label" id="item-sheet-category">
                            Category
                        </span>
                        <div
                            className="d-flex flex-wrap gap-2 mb-3"
                            role="radiogroup"
                            aria-labelledby="item-sheet-category"
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

                        {/* An existing goal stays in its period; only tasks have a day to change. */}
                        {(!item || item.scope === 'day') && (
                            <div className="row g-3 mb-3">
                                <div className={isDay && time ? 'col-12 col-sm-5' : 'col-7'}>
                                    <label className="field-label" htmlFor="item-sheet-date">
                                        {basePeriod.scope === 'day'
                                            ? 'Day'
                                            : 'On a specific day (optional)'}
                                    </label>
                                    <input
                                        id="item-sheet-date"
                                        className="field-input"
                                        type="date"
                                        value={date}
                                        required={basePeriod.scope === 'day'}
                                        onChange={(event) => setDate(event.target.value)}
                                    />
                                </div>
                                <div className={isDay && time ? 'col-6 col-sm-4' : 'col-5'}>
                                    <label className="field-label" htmlFor="item-sheet-time">
                                        Time (optional)
                                    </label>
                                    <input
                                        id="item-sheet-time"
                                        className="field-input"
                                        type="time"
                                        value={time}
                                        disabled={!isDay}
                                        onChange={(event) => setTime(event.target.value)}
                                    />
                                </div>
                                {isDay && time && (
                                    <div className="col-6 col-sm-3">
                                        <label
                                            className="field-label"
                                            htmlFor="item-sheet-duration"
                                        >
                                            Length
                                        </label>
                                        <select
                                            id="item-sheet-duration"
                                            className="field-input"
                                            value={duration ?? DEFAULT_DURATION}
                                            onChange={(event) =>
                                                setDuration(Number(event.target.value))
                                            }
                                        >
                                            {[
                                                ...new Set([
                                                    ...DURATIONS,
                                                    duration ?? DEFAULT_DURATION,
                                                ]),
                                            ]
                                                .sort((a, b) => a - b)
                                                .map((minutes) => (
                                                    <option key={minutes} value={minutes}>
                                                        {minutes < 60
                                                            ? `${minutes} min`
                                                            : `${minutes / 60} hr`}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}

                        {isDay && (
                            <div className="row g-3 mb-3">
                                <div className="col-12 col-sm-7">
                                    <RepeatField
                                        date={period.key}
                                        value={rule}
                                        onChange={setRule}
                                    />
                                </div>
                                <div className="col-12 col-sm-5">
                                    <label className="field-label" htmlFor="item-sheet-routine">
                                        Routine
                                    </label>
                                    <select
                                        id="item-sheet-routine"
                                        className="field-input"
                                        value={routine ?? ''}
                                        onChange={(event) =>
                                            setRoutine(
                                                (event.target.value || null) as Routine | null,
                                            )
                                        }
                                    >
                                        <option value="">Not part of a routine</option>
                                        <option value="morning">Morning routine</option>
                                        <option value="evening">Evening routine</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {household.members.length > 1 && (
                            <div className="mb-3">
                                <span className="field-label" id="item-sheet-who">
                                    Who
                                </span>
                                <div
                                    className="segmented"
                                    role="radiogroup"
                                    aria-labelledby="item-sheet-who"
                                >
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={selectedAssignee === null}
                                        aria-pressed={selectedAssignee === null}
                                        onClick={() => setAssignee(null)}
                                    >
                                        Both
                                    </button>
                                    {household.members.map((member) => (
                                        <button
                                            key={member.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={selectedAssignee === member.id}
                                            aria-pressed={selectedAssignee === member.id}
                                            onClick={() => setAssignee(member.id)}
                                        >
                                            {member.name.split(' ')[0]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {item && (
                            <div className="mb-3">
                                <label className="field-label" htmlFor="item-sheet-notes">
                                    Notes
                                </label>
                                <textarea
                                    id="item-sheet-notes"
                                    className="field-input"
                                    rows={2}
                                    value={notes}
                                    maxLength={5000}
                                    onChange={(event) => setNotes(event.target.value)}
                                />
                            </div>
                        )}

                        <p className="text-soft small mb-3" aria-live="polite">
                            {item ? 'In' : 'Adds to'} <strong>{periodName(period)}</strong>
                        </p>

                        {error && (
                            <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
                                {error}
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
                            {item && (
                                <button
                                    type="button"
                                    className="icon-button task-delete-always"
                                    aria-label={`Delete this ${noun}`}
                                    disabled={busy}
                                    onClick={() => start({ action: 'delete' })}
                                >
                                    <Trash2 aria-hidden="true" size={20} />
                                </button>
                            )}
                            <button
                                type="button"
                                className="button-plain ms-auto"
                                onClick={onClose}
                            >
                                Cancel
                            </button>
                            <button type="submit" className="button-ink" disabled={!canSave}>
                                {item ? 'Save' : 'Add'}
                            </button>
                        </div>
                    </>
                )}
            </form>
        </div>
    );
}

type ApplyToChoiceProps = {
    pending: Pending;
    allowOne: boolean;
    busy: boolean;
    onChoose: (applyTo: ApplyTo) => void;
    onBack: () => void;
};

/** "This one, this and following, or all?" for a repeating task. */
function ApplyToChoice({ pending, allowOne, busy, onChoose, onBack }: ApplyToChoiceProps) {
    const verb = pending.action === 'delete' ? 'Delete' : 'Change';

    return (
        <div role="group" aria-label={`${verb} which tasks?`}>
            <p className="mb-3">
                This task repeats. {verb} just this one, or the ones after it too?
            </p>
            <div className="d-grid gap-2 mb-3">
                {allowOne && (
                    <button
                        type="button"
                        className="button-plain"
                        disabled={busy}
                        onClick={() => onChoose('one')}
                    >
                        Only this one
                    </button>
                )}
                <button
                    type="button"
                    className="button-plain"
                    disabled={busy}
                    onClick={() => onChoose('following')}
                >
                    This and following
                </button>
                <button
                    type="button"
                    className="button-plain"
                    disabled={busy}
                    onClick={() => onChoose('all')}
                >
                    All of them
                </button>
            </div>
            <button type="button" className="button-plain" onClick={onBack}>
                Back
            </button>
        </div>
    );
}
