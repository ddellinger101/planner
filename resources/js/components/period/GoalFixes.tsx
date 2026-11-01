import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useUpdateItem, type Item } from '@/api/items';
import HabitSheet from '@/components/habits/HabitSheet';
import { habitFromGoal } from '@/lib/goalChecks';

/** Put a goal in words that say when it's done. */
export function RewordGoal({ goal, onDone }: { goal: Item; onDone: () => void }) {
    const updateItem = useUpdateItem();
    const [title, setTitle] = useState(goal.title);
    const trimmed = title.trim();

    const submit = (event: FormEvent) => {
        event.preventDefault();

        if (trimmed && trimmed !== goal.title) {
            updateItem.mutate({ id: goal.id, changes: { title: trimmed } });
        }

        onDone();
    };

    return (
        <form className="reword-goal" onSubmit={submit}>
            <input
                className="field-input"
                type="text"
                aria-label={`New wording for ${goal.title}`}
                value={title}
                maxLength={255}
                autoComplete="off"
                autoFocus
                placeholder="Pay $500 toward the cards by Nov 30"
                onChange={(event) => setTitle(event.target.value)}
            />
            <button type="submit" className="button-ink is-small">
                Save
            </button>
            <button type="button" className="button-plain is-small" onClick={onDone}>
                Cancel
            </button>
        </form>
    );
}

/** Turn a goal that's really a repeating commitment into a habit; the goal then goes. */
export function MakeHabitButton({ goal }: { goal: Item }) {
    const updateItem = useUpdateItem();
    const [open, setOpen] = useState(false);
    const { title, target } = habitFromGoal(goal.title);

    return (
        <>
            <button type="button" className="button-plain is-small" onClick={() => setOpen(true)}>
                Make it a habit
            </button>
            {open &&
                // On the body, because this can be used from inside another sheet.
                createPortal(
                    <HabitSheet
                        target={{
                            kind: 'create',
                            routine: 'anytime',
                            title,
                            target,
                            categoryId: goal.category_id,
                            owner: goal.assignee_user_id,
                        }}
                        onSaved={() =>
                            updateItem.mutate({ id: goal.id, changes: { status: 'dropped' } })
                        }
                        onClose={() => setOpen(false)}
                    />,
                    document.body,
                )}
        </>
    );
}
