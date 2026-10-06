import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
    icon: LucideIcon;
    title: string;
    children?: ReactNode;
};

/** A friendly stand-in for a page or list with nothing to show. */
export default function EmptyState({ icon: Icon, title, children }: Props) {
    return (
        <div className="planner-card empty-state">
            <span className="empty-state-icon">
                <Icon aria-hidden="true" size={30} />
            </span>
            <h2 className="font-display h3 mb-0">{title}</h2>
            {children && <p>{children}</p>}
        </div>
    );
}
