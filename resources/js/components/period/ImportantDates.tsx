import { CalendarHeart, Pencil, Repeat, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useDeleteImportantDate, useSaveImportantDate, type ImportantDate } from '@/api/planning';
import { parsePeriod, type Period } from '@/lib/period';
import { periodName } from '@/lib/periodLabels';

type Props = {
    month: Period;
    dates: ImportantDate[];
};

/** The month's important dates, with a form to add or change one. */
export default function ImportantDates({ month, dates }: Props) {
    const save = useSaveImportantDate();
    const remove = useDeleteImportantDate();
    const [editing, setEditing] = useState<ImportantDate | null>(null);
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [yearly, setYearly] = useState(false);

    const reset = () => {
        setEditing(null);
        setTitle('');
        setDate('');
        setYearly(false);
    };

    const startEditing = (entry: ImportantDate) => {
        setEditing(entry);
        setTitle(entry.title);
        setDate(entry.date);
        setYearly(entry.repeats_yearly);
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();

        if (title.trim() && date) {
            save.mutate(
                { id: editing?.id, title: title.trim(), date, repeats_yearly: yearly },
                { onSuccess: reset },
            );
        }
    };

    return (
        <section className="planner-card p-3 h-100" aria-labelledby="important-dates">
            <h2 id="important-dates" className="font-display h4 routine-heading">
                <CalendarHeart aria-hidden="true" size={20} />
                Important dates
            </h2>

            {dates.length === 0 ? (
                <p className="text-soft small">Nothing marked this month.</p>
            ) : (
                <ul className="date-list">
                    {dates.map((entry) => (
                        <li key={`${entry.id}-${entry.occurs_on}`}>
                            <span className="date-list-day">
                                {periodName(parsePeriod(entry.occurs_on)!)}
                            </span>
                            <span className="date-list-title">
                                {entry.title}
                                {entry.repeats_yearly && (
                                    <>
                                        <Repeat aria-hidden="true" size={13} />
                                        <span className="visually-hidden">Repeats every year</span>
                                    </>
                                )}
                            </span>
                            <button
                                type="button"
                                className="icon-button is-small"
                                aria-label={`Edit ${entry.title}`}
                                onClick={() => startEditing(entry)}
                            >
                                <Pencil aria-hidden="true" size={15} />
                            </button>
                            <button
                                type="button"
                                className="icon-button is-small task-delete-always"
                                aria-label={`Delete ${entry.title}`}
                                onClick={() => {
                                    remove.mutate(entry.id);

                                    if (editing?.id === entry.id) {
                                        reset();
                                    }
                                }}
                            >
                                <Trash2 aria-hidden="true" size={15} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <form
                className="date-form"
                onSubmit={submit}
                aria-label={editing ? 'Edit date' : 'Add a date'}
            >
                <input
                    type="text"
                    className="field-input"
                    placeholder="Birthday, anniversary, recital…"
                    aria-label="What is it?"
                    value={title}
                    maxLength={255}
                    onChange={(event) => setTitle(event.target.value)}
                />
                <input
                    type="date"
                    className="field-input"
                    aria-label="Date"
                    value={date}
                    // Start the picker on the month being looked at.
                    onFocus={() => !date && setDate(month.start)}
                    onChange={(event) => setDate(event.target.value)}
                />
                <label className="date-form-yearly">
                    <input
                        type="checkbox"
                        checked={yearly}
                        onChange={(event) => setYearly(event.target.checked)}
                    />
                    Every year
                </label>
                <div className="d-flex gap-2">
                    <button
                        type="submit"
                        className="button-ink is-small"
                        disabled={!title.trim() || !date || save.isPending}
                    >
                        {editing ? 'Save' : 'Add'}
                    </button>
                    {editing && (
                        <button type="button" className="button-plain is-small" onClick={reset}>
                            Cancel
                        </button>
                    )}
                </div>
                {save.isError && (
                    <p className="small mb-0" role="alert" style={{ color: 'var(--danger)' }}>
                        That didn’t save. Please try again.
                    </p>
                )}
            </form>
        </section>
    );
}
