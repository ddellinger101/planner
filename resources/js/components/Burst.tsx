import type { CSSProperties } from 'react';

type Props = {
    /** A bigger burst, for finishing every task in a box. */
    big?: boolean;
};

/**
 * A puff of confetti dots thrown outward from the middle of the parent,
 * which must be positioned. Purely decorative, and hidden for people who
 * prefer reduced motion.
 */
export default function Burst({ big = false }: Props) {
    const count = big ? 16 : 9;
    const distance = big ? 46 : 26;

    return (
        <span className={`burst${big ? ' is-big' : ''}`} aria-hidden="true">
            {Array.from({ length: count }, (_, index) => {
                const angle = (index / count) * Math.PI * 2;
                // Alternate the throw so the dots don't land on one ring.
                const reach = distance * (index % 2 ? 1 : 0.65);
                const style = {
                    '--dx': `${Math.round(Math.cos(angle) * reach)}px`,
                    '--dy': `${Math.round(Math.sin(angle) * reach)}px`,
                } as CSSProperties;

                return <i key={index} style={style} />;
            })}
        </span>
    );
}
