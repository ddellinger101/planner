import { useQuery } from '@tanstack/react-query';
import { Star, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useItems, type Item } from '@/api/items';
import { useItemsBetween } from '@/api/planning';
import { useDeleteReward, useSaveReward, type Reward } from '@/api/rewards';
import { fetchCategories } from '@/api/session';
import { useSession } from '@/context/SessionContext';
import { periodFromDate } from '@/lib/period';
import { useToday } from '@/lib/useCurrentPeriod';

export type RewardTarget =
    /** `starredThisWeek` starts with this week's starred goals already chosen. */
    { kind: 'create'; starredThisWeek?: boolean } | { kind: 'edit'; reward: Reward };

const SOURCES = [
    { key: 'week-goals', label: 'Week’s goals' },
    { key: 'week-tasks', label: 'Week’s tasks' },
    { key: 'today', label: 'Today' },
    { key: 'month-goals', label: 'Month’s goals' },
] as const;

type SourceKey = (typeof SOURCES)[number]['key'];

/** The date a UTC deadline falls on for someone in the given timezone. */
const deadlineDate = (deadline: string, timeZone: string) =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(deadline));

/** Create a reward, or change or delete one: what it is, by when, and for which tasks. */
export default function RewardSheet({
    target,
    onClose,
}: {
    target: RewardTarget;
    onClose: () => void;
}) {
    const { user, household } = useSession();
    const today = useToday();
    const week = periodFromDate('week', today);
    const month = periodFromDate('month', today);
    const reward = target.kind === 'edit' ? target.reward : null;
    const save = useSaveReward();
    const remove = useDeleteReward();
    const titleInput = useRef<HTMLInputElement>(null);
    const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });

    const weekGoals = useItems({ periodKey: week.key, person: null });
    const weekTasks = useItemsBetween(week.start, week.end, null);
    const todayTasks = useItems({ periodKey: today, person: null });
    const monthGoals = useItems({ periodKey: month.key, person: null });

    const [title, setTitle] = useState(reward?.title ?? '');
    const [description, setDescription] = useState(reward?.description ?? '');
    const [deadline, setDeadline] = useState(
        reward ? deadlineDate(reward.deadline, user.timezone) : week.end,
    );
    const [beneficiary, setBeneficiary] = useState<number | null>(
        reward?.beneficiary_user_id ?? null,
    );
    const [source, setSource] = useState<SourceKey>('week-goals');
    const [search, setSearch] = useState('');
    // Chosen tasks by id, kept across the lists so switching list loses nothing.
    const [chosen, setChosen] = useState<Map<number, Item> | null>(
        reward ? new Map(reward.items.map((item) => [item.id, item])) : null,
    );

    const starred = [...(weekGoals.data ?? []), ...(weekTasks.data ?? [])].filter(
        (item) => item.starred && item.status === 'open',
    );
    // "Create a reward for the Big 3" starts with them chosen, once they have loaded.
    const selected =
        chosen ??
        new Map(
            (target.kind === 'create' && target.starredThisWeek ? starred : []).map((item) => [
                item.id,
                item,
            ]),
        );

    const lists: Record<SourceKey, Item[] | undefined> = {
        'week-goals': weekGoals.data,
        'week-tasks': weekTasks.data,
        today: todayTasks.data,
        'month-goals': monthGoals.data,
    };
    const needle = search.trim().toLowerCase();
    const options = (lists[source] ?? []).filter(
        (item) =>
            // Open tasks, plus anything already chosen so it can be un-chosen.
            (item.status === 'open' || selected.has(item.id)) &&
            item.routine === null &&
            (needle === '' || item.title.toLowerCase().includes(needle)),
    );

    const toggle = (item: Item) => {
        const next = new Map(selected);

        if (!next.delete(item.id)) {
            next.set(item.id, item);
        }

        setChosen(next);
    };

    const busy = save.isPending || remove.isPending;
    const canSave = title.trim() !== '' && deadline !== '' && selected.size > 0 && !busy;
    const colorOf = (item: Item) =>
        categories.data?.find((category) => category.id === item.category_id)?.color;

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

        if (canSave) {
            save.mutate(
                {
                    id: reward?.id,
                    title: title.trim(),
                    description: description.trim() || null,
                    deadline,
                    beneficiary_user_id: beneficiary,
                    item_ids: [...selected.keys()],
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
                className="sheet is-wide"
                role="dialog"
                aria-modal="true"
                aria-labelledby="reward-sheet-title"
                onSubmit={submit}
            >
                <div className="d-flex align-items-center justify-content-between mb-2">
                    <h2 id="reward-sheet-title" className="font-display h3 mb-0">
                        {reward ? 'Edit reward' : 'New reward'}
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

                <label className="field-label" htmlFor="reward-title">
                    The reward
                </label>
                <input
                    ref={titleInput}
                    id="reward-title"
                    className="field-input mb-3"
                    type="text"
                    value={title}
                    maxLength={255}
                    autoComplete="off"
                    placeholder="Movie night, new strings, a lazy Sunday…"
                    onChange={(event) => setTitle(event.target.value)}
                />

                <label className="field-label" htmlFor="reward-description">
                    Details (optional)
                </label>
                <textarea
                    id="reward-description"
                    className="field-input mb-3"
                    rows={2}
                    value={description}
                    maxLength={5000}
                    onChange={(event) => setDescription(event.target.value)}
                />

                <div className="row g-3 mb-3">
                    <div className="col-12 col-sm-6">
                        <label className="field-label" htmlFor="reward-deadline">
                            Earn it by the end of
                        </label>
                        <input
                            id="reward-deadline"
                            className="field-input"
                            type="date"
                            value={deadline}
                            onChange={(event) => setDeadline(event.target.value)}
                        />
                    </div>
                    {household.members.length > 1 && (
                        <div className="col-12 col-sm-6">
                            <label className="field-label" htmlFor="reward-for">
                                Who it’s for
                            </label>
                            <select
                                id="reward-for"
                                className="field-input"
                                value={beneficiary ?? ''}
                                onChange={(event) =>
                                    setBeneficiary(
                                        event.target.value ? Number(event.target.value) : null,
                                    )
                                }
                            >
                                <option value="">Both of us</option>
                                {household.members.map((member) => (
                                    <option key={member.id} value={member.id}>
                                        {member.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <span className="field-label" id="reward-tasks">
                    Tasks to finish ({selected.size} chosen)
                </span>
                <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
                    <div className="segmented" role="group" aria-label="Choose from">
                        {SOURCES.map(({ key, label }) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={source === key}
                                onClick={() => setSource(key)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="button-plain is-small"
                        disabled={starred.length === 0}
                        onClick={() => {
                            const next = new Map(selected);
                            starred.forEach((item) => next.set(item.id, item));
                            setChosen(next);
                        }}
                    >
                        <Star aria-hidden="true" size={14} /> All starred this week
                    </button>
                </div>
                <input
                    type="search"
                    className="field-input mb-2"
                    aria-label="Search tasks"
                    placeholder="Search…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
                {options.length === 0 ? (
                    <p className="text-soft small">
                        Nothing open here{needle ? ' matches that' : ''}.
                    </p>
                ) : (
                    <ul className="picker-list mb-3" aria-labelledby="reward-tasks">
                        {options.map((item) => (
                            <li
                                key={item.id}
                                className="cat"
                                style={{ '--cat': colorOf(item) } as CSSProperties}
                            >
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={selected.has(item.id)}
                                        onChange={() => toggle(item)}
                                    />
                                    <span className="month-day-dot is-done" aria-hidden="true" />
                                    {item.title}
                                </label>
                            </li>
                        ))}
                    </ul>
                )}

                {(save.isError || remove.isError) && (
                    <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
                        That didn’t save. Please try again.
                    </p>
                )}

                <div className="d-flex align-items-center gap-2">
                    {reward && (
                        <button
                            type="button"
                            className="icon-button task-delete-always"
                            aria-label="Delete this reward"
                            disabled={busy}
                            onClick={() => remove.mutate(reward.id, { onSuccess: onClose })}
                        >
                            <Trash2 aria-hidden="true" size={20} />
                        </button>
                    )}
                    <button type="button" className="button-plain ms-auto" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="button-ink" disabled={!canSave}>
                        {reward ? 'Save' : 'Create reward'}
                    </button>
                </div>
            </form>
        </div>
    );
}
