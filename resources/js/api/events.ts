import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { formatTime } from '@/lib/periodLabels';

export type CalendarEvent = {
    id: number;
    /** Google's id, once the event exists there. */
    google_event_id: string | null;
    title: string;
    location: string | null;
    /** The notes Google Calendar keeps with it, which may hold simple HTML. */
    description: string | null;
    all_day: boolean;
    /** UTC moments, for an event with times. */
    starts_at: string | null;
    ends_at: string | null;
    /** First and last day, for an all-day event. */
    starts_on: string | null;
    ends_on: string | null;
    owner_user_id: number;
    /** False for events Google Calendar has to change: read-only calendars and repeating events. */
    editable: boolean;
    repeats: boolean;
    /** The calendar's color in Google, if it came from one. */
    color: string | null;
    calendar_name: string | null;
    html_link: string | null;
};

/** What the event form sends: times as the person's own clock shows them. */
export type EventInput = {
    title: string;
    location: string | null;
    all_day: boolean;
    date: string;
    end_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
};

export function useEvents(from: string, to: string) {
    return useQuery({
        queryKey: ['events', from, to],
        queryFn: () => api<CalendarEvent[]>(`/api/events?from=${from}&to=${to}`),
    });
}

export function useSaveEvent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, ...input }: EventInput & { id?: number }) =>
            id === undefined
                ? api<CalendarEvent>('/api/events', { method: 'POST', body: input })
                : api<CalendarEvent>(`/api/events/${id}`, { method: 'PUT', body: input }),
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
    });
}

export function useDeleteEvent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => api(`/api/events/${id}`, { method: 'DELETE' }),
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
    });
}

/** The date and time a moment falls on in a time zone. */
export function localParts(iso: string, timeZone: string): { date: string; time: string } {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(iso));
    const part = (type: string) => parts.find((candidate) => candidate.type === type)!.value;

    return {
        date: `${part('year')}-${part('month')}-${part('day')}`,
        time: `${part('hour')}:${part('minute')}`,
    };
}

/** The first and last day an event touches. */
export function eventDays(event: CalendarEvent, timeZone: string): { start: string; end: string } {
    if (event.all_day) {
        return { start: event.starts_on!, end: event.ends_on ?? event.starts_on! };
    }

    const start = localParts(event.starts_at!, timeZone).date;
    // An event that ends at midnight doesn't reach into the next day.
    const lastMoment = Math.max(Date.parse(event.ends_at!) - 1, Date.parse(event.starts_at!));

    return { start, end: localParts(new Date(lastMoment).toISOString(), timeZone).date };
}

export function eventsOn(events: CalendarEvent[], day: string, timeZone: string): CalendarEvent[] {
    return events.filter((event) => {
        const { start, end } = eventDays(event, timeZone);

        return start <= day && day <= end;
    });
}

/**
 * The events to show for a person filter. A calendar both people follow
 * arrives once from each account; it is shown once.
 */
export function eventsFor(events: CalendarEvent[], person: number | null): CalendarEvent[] {
    const seen = new Set<string>();

    return events
        .filter((event) => person === null || event.owner_user_id === person)
        .filter((event) => {
            const key = event.google_event_id ?? `local-${event.id}`;

            return seen.has(key) ? false : Boolean(seen.add(key));
        });
}

/** Minutes since midnight that an event covers on one day, or null if it has no times that day. */
export function eventMinutes(
    event: CalendarEvent,
    day: string,
    timeZone: string,
): { start: number; end: number } | null {
    if (event.all_day) {
        return null;
    }

    const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const start = localParts(event.starts_at!, timeZone);
    const end = localParts(event.ends_at!, timeZone);

    const minutes = {
        start: start.date < day ? 0 : toMinutes(start.time),
        end: end.date > day ? 24 * 60 : toMinutes(end.time),
    };

    // Midnight to midnight is the whole day, however the event was entered.
    return minutes.start === 0 && minutes.end === 24 * 60 ? null : minutes;
}

/** "All day", "2:00 PM – 3:00 PM", or how a longer event touches this day. */
export function eventTimeLabel(event: CalendarEvent, day: string, timeZone: string): string {
    if (eventMinutes(event, day, timeZone) === null) {
        return 'All day';
    }

    const start = localParts(event.starts_at!, timeZone);
    const end = localParts(event.ends_at!, timeZone);

    if (start.date < day) {
        return `Until ${formatTime(end.time)}`;
    }

    return end.date > day || event.starts_at === event.ends_at
        ? formatTime(start.time)
        : `${formatTime(start.time)} – ${formatTime(end.time)}`;
}
