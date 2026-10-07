import { ExternalLink, MapPin, Repeat, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
    eventDays,
    eventTimeLabel,
    localParts,
    useDeleteEvent,
    useSaveEvent,
    type CalendarEvent,
} from '@/api/events';
import { useGoogle } from '@/api/google';
import { Sheet } from '@/components/brain/BrainDumpSheets';
import type { EventDraft } from '@/context/EventEditorContext';
import { useSession } from '@/context/SessionContext';
import { parsePeriod } from '@/lib/period';
import { periodName } from '@/lib/periodLabels';

export type EventTarget =
    { kind: 'edit'; event: CalendarEvent } | { kind: 'create'; draft: EventDraft };

type Props = { target: EventTarget; onClose: () => void };

/** Add or change a calendar event, or read one that only Google Calendar can change. */
export default function EventSheet({ target, onClose }: Props) {
    const event = target.kind === 'edit' ? target.event : null;

    return event && !event.editable ? (
        <EventDetails event={event} onClose={onClose} />
    ) : (
        <EventForm target={target} onClose={onClose} />
    );
}

function EventForm({ target, onClose }: Props) {
    const { user } = useSession();
    const google = useGoogle();
    const save = useSaveEvent();
    const remove = useDeleteEvent();
    const event = target.kind === 'edit' ? target.event : null;
    const draft = target.kind === 'create' ? target.draft : null;

    const days = event ? eventDays(event, user.timezone) : null;
    const startsAt = event?.starts_at ? localParts(event.starts_at, user.timezone) : null;
    const endsAt = event?.ends_at ? localParts(event.ends_at, user.timezone) : null;

    const [title, setTitle] = useState(event?.title ?? draft?.title ?? '');
    const [allDay, setAllDay] = useState(event ? event.all_day : !draft?.time);
    const [date, setDate] = useState(days?.start ?? draft!.date);
    const [endDate, setEndDate] = useState(event?.all_day ? days!.end : '');
    const [startTime, setStartTime] = useState(startsAt?.time ?? draft?.time ?? '');
    const [endTime, setEndTime] = useState(endsAt?.time ?? '');
    const [location, setLocation] = useState(event?.location ?? '');

    const ready = title.trim() !== '' && date !== '' && (allDay || startTime !== '');
    const busy = save.isPending || remove.isPending;

    const submit = (submitted: FormEvent) => {
        submitted.preventDefault();

        if (!ready) {
            return;
        }

        save.mutate(
            {
                id: event?.id,
                title: title.trim(),
                location: location.trim() || null,
                all_day: allDay,
                date,
                ...(allDay
                    ? { end_date: endDate && endDate > date ? endDate : null }
                    : { start_time: startTime, end_time: endTime || null }),
            },
            { onSuccess: onClose },
        );
    };

    return (
        <Sheet
            title={event ? 'Edit event' : 'New event'}
            labelledBy="event-sheet-title"
            onClose={onClose}
            onSubmit={submit}
        >
            <label className="field-label" htmlFor="event-sheet-text">
                What is it?
            </label>
            <input
                id="event-sheet-text"
                className="field-input mb-3"
                type="text"
                value={title}
                maxLength={255}
                autoComplete="off"
                autoFocus={!event}
                onChange={(change) => setTitle(change.target.value)}
            />

            <label className="date-form-yearly mb-3">
                <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(change) => setAllDay(change.target.checked)}
                />
                All day
            </label>

            <div className="row g-2 mb-3">
                <div className={allDay ? 'col-6' : 'col-12 col-sm-4'}>
                    <label className="field-label" htmlFor="event-sheet-date">
                        {allDay ? 'From' : 'Date'}
                    </label>
                    <input
                        id="event-sheet-date"
                        className="field-input"
                        type="date"
                        value={date}
                        onChange={(change) => setDate(change.target.value)}
                    />
                </div>
                {allDay ? (
                    <div className="col-6">
                        <label className="field-label" htmlFor="event-sheet-end-date">
                            To (optional)
                        </label>
                        <input
                            id="event-sheet-end-date"
                            className="field-input"
                            type="date"
                            value={endDate}
                            min={date}
                            onChange={(change) => setEndDate(change.target.value)}
                        />
                    </div>
                ) : (
                    <>
                        <div className="col-6 col-sm-4">
                            <label className="field-label" htmlFor="event-sheet-start">
                                Starts
                            </label>
                            <input
                                id="event-sheet-start"
                                className="field-input"
                                type="time"
                                value={startTime}
                                onChange={(change) => setStartTime(change.target.value)}
                            />
                        </div>
                        <div className="col-6 col-sm-4">
                            <label className="field-label" htmlFor="event-sheet-end">
                                Ends (optional)
                            </label>
                            <input
                                id="event-sheet-end"
                                className="field-input"
                                type="time"
                                value={endTime}
                                onChange={(change) => setEndTime(change.target.value)}
                            />
                        </div>
                    </>
                )}
            </div>

            <label className="field-label" htmlFor="event-sheet-location">
                Where (optional)
            </label>
            <input
                id="event-sheet-location"
                className="field-input mb-3"
                type="text"
                value={location}
                maxLength={255}
                autoComplete="off"
                onChange={(change) => setLocation(change.target.value)}
            />

            {!event && (
                <p className="text-soft small">
                    {google.data?.calendar_connected
                        ? 'It will be added to your Google Calendar.'
                        : 'It stays in the planner until you connect Google Calendar in Settings.'}
                </p>
            )}
            {(save.isError || remove.isError) && (
                <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
                    That didn’t save. Please try again.
                </p>
            )}

            <div className="d-flex align-items-center gap-2">
                {event && (
                    <button
                        type="button"
                        className="icon-button task-delete-always"
                        aria-label="Delete this event"
                        disabled={busy}
                        onClick={() => remove.mutate(event.id, { onSuccess: onClose })}
                    >
                        <Trash2 aria-hidden="true" size={20} />
                    </button>
                )}
                <button type="button" className="button-plain ms-auto" onClick={onClose}>
                    Cancel
                </button>
                <button type="submit" className="button-ink" disabled={!ready || busy}>
                    {event ? 'Save' : 'Add event'}
                </button>
            </div>
        </Sheet>
    );
}

function EventDetails({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
    const { user } = useSession();
    const { start, end } = eventDays(event, user.timezone);
    const dayName = (day: string) => periodName(parsePeriod(day)!);

    return (
        <Sheet title={event.title} labelledBy="event-sheet-title" onClose={onClose}>
            <p className="mb-1 fw-bold">
                {start === end ? dayName(start) : `${dayName(start)} – ${dayName(end)}`}
            </p>
            <p className="mb-2">
                {start === end ? eventTimeLabel(event, start, user.timezone) : 'More than one day'}
                {event.repeats && (
                    <span className="text-soft ms-2">
                        <Repeat aria-hidden="true" size={14} /> Repeats
                    </span>
                )}
            </p>
            {event.location && (
                <p className="mb-2 d-flex gap-2 align-items-start">
                    <MapPin aria-hidden="true" size={16} className="mt-1 flex-shrink-0" />
                    {event.location}
                </p>
            )}
            <p className="text-soft small">
                {event.repeats
                    ? 'A repeating event is changed in Google Calendar.'
                    : `From the “${event.calendar_name ?? 'Google'}” calendar, which can’t be changed here.`}
            </p>
            <div className="d-flex align-items-center gap-2">
                {event.html_link && (
                    <a
                        className="button-plain d-inline-flex align-items-center gap-2"
                        href={event.html_link}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Open in Google Calendar <ExternalLink aria-hidden="true" size={15} />
                    </a>
                )}
                <button type="button" className="button-ink ms-auto" onClick={onClose}>
                    Done
                </button>
            </div>
        </Sheet>
    );
}
