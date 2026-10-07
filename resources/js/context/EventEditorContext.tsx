import { createContext, useContext } from 'react';
import type { CalendarEvent } from '@/api/events';

/** What a new event starts out with. */
export type EventDraft = { date: string; title?: string; time?: string | null };

type EventEditor = {
    /** Open an event: to change it, or just to read it when Google owns it. */
    openEvent: (event: CalendarEvent) => void;
    newEvent: (draft: EventDraft) => void;
};

const EventEditorContext = createContext<EventEditor | null>(null);

export const EventEditorProvider = EventEditorContext.Provider;

/** Lets any page open the shared event sheet, which the app shell owns. */
export function useEventEditor(): EventEditor {
    const editor = useContext(EventEditorContext);

    if (!editor) {
        throw new Error('useEventEditor must be used inside the app shell');
    }

    return editor;
}
