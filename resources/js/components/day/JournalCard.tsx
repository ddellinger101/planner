import { Heart, Sparkles, Wind } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useJournal, useSaveJournal, type JournalEntry, type JournalType } from '@/api/day';
import { Sheet } from '@/components/brain/BrainDumpSheets';
import { useDraft } from '@/lib/useDraft';
import { parsePeriod } from '@/lib/period';
import { periodLabel } from '@/lib/periodLabels';

type Props = {
    /** The day's period key. */
    date: string;
};

/** Gratitude, the day's affirmation and meditation minutes. */
export default function JournalCard({ date }: Props) {
    const journal = useJournal(date);
    const save = useSaveJournal(date);
    const entry = (type: JournalType) => journal.data?.find((candidate) => candidate.type === type);
    const affirmation = entry('affirmation');

    return (
        <section className="planner-card journal-card" aria-label="Journal">
            <JournalLine
                key={`gratitude-${date}`}
                icon={<Heart aria-hidden="true" size={18} />}
                label="I’m grateful for"
                entry={entry('gratitude')}
                loaded={journal.isSuccess}
                onSave={(body) => save.mutate({ type: 'gratitude', body })}
            />
            <JournalLine
                key={`affirmation-${date}`}
                icon={<Sparkles aria-hidden="true" size={18} />}
                label="Affirmation"
                entry={affirmation}
                loaded={journal.isSuccess}
                // A carried affirmation is only a suggestion until it is saved for today.
                hint={affirmation?.carried ? `Carried from ${carriedFrom(affirmation)}` : undefined}
                onSave={(body) => save.mutate({ type: 'affirmation', body })}
            />
            <JournalLine
                key={`meditation-${date}`}
                icon={<Wind aria-hidden="true" size={18} />}
                label="Meditation"
                suffix="min"
                numeric
                entry={entry('meditation')}
                loaded={journal.isSuccess}
                onSave={(body) =>
                    save.mutate({ type: 'meditation', minutes: body === '' ? null : Number(body) })
                }
            />
        </section>
    );
}

/** "Mon", or "Jan 2" once the source is more than a week back. */
function carriedFrom(entry: JournalEntry): string {
    const source = parsePeriod(entry.period_key);

    if (!source) {
        return 'earlier';
    }

    const { title, subtitle } = periodLabel(source);

    return `${title.slice(0, 3)}, ${subtitle.replace(/, \d{4}$/, '').replace(/^(\w{3})\w*/, '$1')}`;
}

type LineProps = {
    icon: ReactNode;
    label: string;
    entry?: JournalEntry;
    /** False until the saved value has arrived, so typing isn't overwritten. */
    loaded: boolean;
    hint?: string;
    suffix?: string;
    numeric?: boolean;
    onSave: (value: string) => void;
};

/**
 * One line of the journal. A number is typed in place and saves when you
 * leave the field. Words are shown on one line, cut short if they run long,
 * and open in full to read or change when the line is pressed.
 */
function JournalLine(props: LineProps) {
    return props.numeric ? <NumberLine {...props} /> : <TextLine {...props} />;
}

const lineId = (label: string) => `journal-${label.replace(/\W+/g, '-').toLowerCase()}`;

function NumberLine({ icon, label, entry, loaded, suffix, onSave }: LineProps) {
    const saved = String(entry?.minutes ?? '');
    const draft = useDraft(saved);
    const id = lineId(label);

    const commit = () => {
        const next = draft.value.trim();

        if (draft.touched && next !== saved) {
            onSave(next);
        }

        draft.settle();
    };

    return (
        <div className="journal-line">
            <label htmlFor={id}>
                {icon}
                {label}
            </label>
            <div className="journal-field">
                <input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1440}
                    value={draft.value}
                    disabled={!loaded}
                    onChange={(event) => draft.set(event.target.value)}
                    onBlur={commit}
                    onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                />
                {suffix && <span className="text-soft small">{suffix}</span>}
            </div>
        </div>
    );
}

function TextLine({ icon, label, entry, loaded, hint, onSave }: LineProps) {
    const [open, setOpen] = useState(false);
    const saved = entry?.body ?? '';
    const id = lineId(label);

    return (
        <div className="journal-line">
            <span className="journal-label" id={`${id}-label`}>
                {icon}
                {label}
            </span>
            <button
                type="button"
                id={id}
                className="journal-open"
                disabled={!loaded}
                aria-labelledby={`${id}-label ${id}`}
                aria-describedby={hint ? `${id}-hint` : undefined}
                aria-haspopup="dialog"
                onClick={() => setOpen(true)}
            >
                {saved === '' ? <span className="journal-placeholder">Write…</span> : saved}
            </button>
            {hint && (
                <span id={`${id}-hint`} className="journal-hint">
                    {hint}
                </span>
            )}
            {open && (
                <JournalSheet
                    label={label}
                    saved={saved}
                    // An untouched carried affirmation stays a suggestion; saving it,
                    // changed or not, makes it today's own.
                    alwaysSave={Boolean(entry?.carried)}
                    hint={hint}
                    onSave={onSave}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
}

type SheetProps = {
    label: string;
    saved: string;
    alwaysSave: boolean;
    hint?: string;
    onSave: (value: string) => void;
    onClose: () => void;
};

/** The whole entry, with room to read and write it. */
function JournalSheet({ label, saved, alwaysSave, hint, onSave, onClose }: SheetProps) {
    const [text, setText] = useState(saved);

    const submit = (event?: FormEvent) => {
        event?.preventDefault();

        const next = text.trim();

        if (next !== saved || alwaysSave) {
            onSave(next);
        }

        onClose();
    };

    return (
        <Sheet title={label} labelledBy="journal-sheet-title" onClose={onClose} onSubmit={submit}>
            <textarea
                className="field-input journal-text"
                aria-labelledby="journal-sheet-title"
                rows={5}
                maxLength={500}
                value={text}
                autoFocus
                // Start typing at the end of what is already there.
                onFocus={(event) => event.currentTarget.setSelectionRange(text.length, text.length)}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        submit();
                    }
                }}
            />
            {hint && <p className="journal-hint mt-1 mb-0">{hint}. Save to keep it for today.</p>}
            <div className="d-flex align-items-center gap-2 mt-3">
                <button type="button" className="button-plain ms-auto" onClick={onClose}>
                    Cancel
                </button>
                <button type="submit" className="button-ink">
                    Save
                </button>
            </div>
        </Sheet>
    );
}
