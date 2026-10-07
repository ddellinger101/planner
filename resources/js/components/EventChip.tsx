import type { CSSProperties } from 'react';
import { eventTimeLabel, type CalendarEvent } from '@/api/events';
import { useEventEditor } from '@/context/EventEditorContext';
import { useSession } from '@/context/SessionContext';

type Props = {
    event: CalendarEvent;
    /** The day it is being shown on, which decides how its time reads. */
    day: string;
    className?: string;
    style?: CSSProperties;
};

/** One calendar event as a button that opens it. Its edge takes the calendar's color. */
export default function EventChip({ event, day, className = '', style }: Props) {
    const { user, household } = useSession();
    const { openEvent } = useEventEditor();
    // With two people in the planner, each event says whose it is.
    const owner =
        household.members.length > 1
            ? household.members.find((member) => member.id === event.owner_user_id)
            : undefined;
    const time = eventTimeLabel(event, day, user.timezone);

    return (
        <button
            type="button"
            className={`event-chip ${className}`.trim()}
            style={
                { ...(event.color ? { '--event': event.color } : {}), ...style } as CSSProperties
            }
            aria-label={[event.title, time, owner?.name].filter(Boolean).join(', ')}
            onClick={() => openEvent(event)}
        >
            {!event.all_day && time !== 'All day' && (
                <span className="event-chip-time">{time}</span>
            )}
            <span className="event-chip-title">{event.title}</span>
            {owner && (
                <span
                    className="person-dot event-chip-owner"
                    style={{ background: owner.color }}
                    title={owner.name}
                    aria-hidden="true"
                >
                    {owner.name.charAt(0)}
                </span>
            )}
        </button>
    );
}
