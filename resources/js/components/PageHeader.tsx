import type { ReactNode } from 'react';
import PersonFilter from './PersonFilter';

type Props = {
    /** A plain page title, or a PeriodNav for period pages. */
    children: ReactNode;
    /** Pages whose content isn't split by person can hide the filter. */
    showPersonFilter?: boolean;
};

/** The sticky bar at the top of every page. */
export default function PageHeader({ children, showPersonFilter = true }: Props) {
    return (
        <header className="page-header">
            {typeof children === 'string' ? <h1 className="page-title">{children}</h1> : children}
            {showPersonFilter && <PersonFilter />}
        </header>
    );
}
