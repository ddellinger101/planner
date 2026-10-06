import { HeartPulse, House, ListTodo, PiggyBank, Tag, Users, type LucideIcon } from 'lucide-react';
import only4YouLogo from '@/assets/icons/only-4-you-logo.png';

// The icon names stored on categories, mapped to Lucide components.
const LUCIDE: Record<string, LucideIcon> = {
    'heart-pulse': HeartPulse,
    'piggy-bank': PiggyBank,
    house: House,
    users: Users,
    'list-todo': ListTodo,
};

type Props = {
    /** A category's `icon`: a Lucide name, or `custom:only4you`. */
    icon: string;
    /** `brand` shows the full-color Only 4 You logo where there is one. */
    variant?: 'line' | 'brand';
    size?: number;
};

/** Every category icon in the app goes through this component. */
export default function CategoryIcon({ icon, variant = 'line', size = 20 }: Props) {
    if (icon === 'custom:only4you') {
        return variant === 'brand' ? (
            <img src={only4YouLogo} alt="" width={size} height={size} />
        ) : (
            <Only4YouIcon size={size} />
        );
    }

    const Icon = LUCIDE[icon] ?? Tag;

    return <Icon aria-hidden="true" size={size} />;
}

// The line version of the Only 4 You logo, drawn on Lucide's 24×24 grid so it
// sits alongside the other icons and takes the current text color.
function Only4YouIcon({ size }: { size: number }) {
    return (
        <svg
            aria-hidden="true"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M6 3.5C4.2 3.2 3 4.2 3 6v6a9 9 0 0 0 18 0V6c0-1.8-1.2-2.8-3-2.5" />
            <ellipse cx="12" cy="10" rx="3.5" ry="6.5" />
            <g fill="currentColor" stroke="none">
                <circle cx="12" cy="6.6" r="0.9" />
                <circle cx="12" cy="8.9" r="0.9" />
                <circle cx="12" cy="11.2" r="0.9" />
                <circle cx="12" cy="13.5" r="0.9" />
            </g>
        </svg>
    );
}
