import type { CSSProperties } from 'react';
import { usePersonFilter } from '@/context/PersonFilterContext';
import { useSession } from '@/context/SessionContext';

/** Show everyone's items, or just one person's. Hidden for a household of one. */
export default function PersonFilter() {
    const { household } = useSession();
    const { person, setPerson } = usePersonFilter();

    if (household.members.length < 2) {
        return null;
    }

    return (
        <div className="segmented" role="group" aria-label="Whose items to show">
            <button type="button" aria-pressed={person === null} onClick={() => setPerson(null)}>
                Both
            </button>
            {household.members.map((member) => (
                <button
                    key={member.id}
                    type="button"
                    aria-pressed={person === member.id}
                    aria-label={member.name}
                    onClick={() => setPerson(member.id)}
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
