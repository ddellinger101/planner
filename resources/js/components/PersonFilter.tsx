import type { CSSProperties } from 'react';
import { usePersonFilter } from '@/context/PersonFilterContext';
import { useSession } from '@/context/SessionContext';

/**
 * Whose planner to show. "Default" is everything the household shares plus
 * your own Health; "Both" adds the other person's Health; a name narrows to
 * that person. Hidden for a household of one.
 */
export default function PersonFilter() {
    const { household } = useSession();
    const { view, setView } = usePersonFilter();

    if (household.members.length < 2) {
        return null;
    }

    return (
        <div className="segmented" role="group" aria-label="Whose items to show">
            <button
                type="button"
                aria-pressed={view === 'default'}
                title="Everything shared, and your own Health"
                onClick={() => setView('default')}
            >
                Default
            </button>
            <button
                type="button"
                aria-pressed={view === 'both'}
                title="Everything, including each other’s Health"
                onClick={() => setView('both')}
            >
                Both
            </button>
            {household.members.map((member) => (
                <button
                    key={member.id}
                    type="button"
                    aria-pressed={view === member.id}
                    aria-label={member.name}
                    onClick={() => setView(member.id)}
                >
                    <span
                        className="person-dot"
                        style={{ '--person': member.color } as CSSProperties}
                        aria-hidden="true"
                    >
                        {member.name.charAt(0)}
                    </span>
                    {/* The first name alone keeps the control narrow on phones. */}
                    <span className="d-none d-sm-inline">{member.name.split(' ')[0]}</span>
                </button>
            ))}
        </div>
    );
}
