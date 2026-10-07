import { Heart, Sparkles, Wind } from 'lucide-react';
import type { ReactNode } from 'react';
import { useJournal, useSaveJournal, type JournalEntry, type JournalType } from '@/api/day';
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

/** One line of the journal. It saves when you leave the field or press Enter. */
function JournalLine({ icon, label, entry, loaded, hint, suffix, numeric, onSave }: LineProps) {
    const saved = numeric ? String(entry?.minutes ?? '') : (entry?.body ?? '');
    const draft = useDraft(saved);

    const commit = () => {
        const next = draft.value.trim();

        // An untouched carried affirmation stays a suggestion; editing or
        // re-entering it makes it today's own.
        if (draft.touched && (next !== saved || entry?.carried)) {
            onSave(next);
        }

        draft.settle();
    };

    const id = `journal-${label.replace(/\W+/g, '-').toLowerCase()}`;

    return (
        <div className="journal-line">
            <label htmlFor={id}>
                {icon}
                {label}
            </label>
            <div className="journal-field">
                <input
                    id={id}
                    type={numeric ? 'number' : 'text'}
                    inputMode={numeric ? 'numeric' : undefined}
                    min={numeric ? 0 : undefined}
                    max={numeric ? 1440 : undefined}
                    value={draft.value}
                    disabled={!loaded}
                    maxLength={numeric ? undefined : 500}
                    aria-describedby={hint ? `${id}-hint` : undefined}
                    onChange={(event) => draft.set(event.target.value)}
                    onBlur={commit}
                    onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                />
                {suffix && <span className="text-soft small">{suffix}</span>}
            </div>
            {hint && (
                <span id={`${id}-hint`} className="journal-hint">
                    {hint}
                </span>
            )}
        </div>
    );
}
