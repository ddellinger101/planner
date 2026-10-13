import { useEffect } from 'react';

/**
 * Tell the stylesheet how much of the bottom of the screen the on-screen
 * keyboard covers, as `--keyboard-inset`. A phone's keyboard slides over the
 * page without resizing it, which hid the buttons at the foot of a sheet.
 */
export function useKeyboardInset() {
    useEffect(() => {
        const viewport = window.visualViewport;

        if (!viewport) {
            return;
        }

        const update = () => {
            const covered = window.innerHeight - viewport.height - viewport.offsetTop;

            document.documentElement.style.setProperty(
                '--keyboard-inset',
                `${Math.max(0, Math.round(covered))}px`,
            );
        };

        update();
        viewport.addEventListener('resize', update);
        viewport.addEventListener('scroll', update);

        return () => {
            viewport.removeEventListener('resize', update);
            viewport.removeEventListener('scroll', update);
        };
    }, []);
}
