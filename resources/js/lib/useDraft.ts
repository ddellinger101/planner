import { useState } from 'react';

/**
 * A text field that shows a saved value until the user types over it.
 *
 * The draft is kept after it is submitted, so the field doesn't flick back
 * to the old value while the save is in flight. `settle()` drops a draft
 * that matches what is saved.
 */
export function useDraft(saved: string) {
    const [draft, setDraft] = useState<string | null>(null);

    return {
        value: draft ?? saved,
        /** True once the user has typed in the field. */
        touched: draft !== null,
        set: setDraft,
        settle: () => setDraft((current) => (current?.trim() === saved ? null : current)),
        reset: () => setDraft(null),
    };
}
