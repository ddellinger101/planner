import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCompleteReview, type PendingReview } from '@/api/review';
import { parsePeriod } from '@/lib/period';
import { periodShortName } from '@/lib/periodLabels';
import ReviewPeriod from './ReviewPeriod';

type Props = {
    /** The periods to review, broadest first. */
    reviews: PendingReview[];
    /** Start on this period, when the sheet was opened from its banner. */
    startAt?: string;
    /** Called once the sheet is on screen. */
    onShown?: () => void;
    onClose: () => void;
};

/**
 * Walks through the periods that have just ended, one at a time. Finishing
 * a period's review is recorded even if items are left open; they stay in
 * their period.
 */
export default function ReviewSheet({ reviews, startAt, onShown, onClose }: Props) {
    // The list shrinks as periods are finished, so keep our own copy to walk through.
    const [steps] = useState(reviews);
    const [index, setIndex] = useState(() =>
        Math.max(
            0,
            steps.findIndex((review) => review.period_key === startAt),
        ),
    );
    const complete = useCompleteReview();
    const review = steps[index];
    const last = index === steps.length - 1;

    useEffect(() => {
        onShown?.();
        // Only on first appearance.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    if (!review) {
        return null;
    }

    const finish = () =>
        complete.mutate(review.period_key, {
            onSuccess: () => (last ? onClose() : setIndex(index + 1)),
        });

    return (
        <div
            className="sheet-backdrop"
            onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
            <div
                className="sheet is-wide"
                role="dialog"
                aria-modal="true"
                aria-labelledby="review-title"
            >
                <div className="d-flex align-items-start justify-content-between mb-2">
                    <div>
                        <h2 id="review-title" className="font-display h3 mb-0">
                            Review {periodShortName(parsePeriod(review.period_key)!)}
                        </h2>
                        {steps.length > 1 && (
                            <p className="text-soft small mb-0">
                                Step {index + 1} of {steps.length}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        className="icon-button"
                        aria-label="Close"
                        onClick={onClose}
                    >
                        <X aria-hidden="true" />
                    </button>
                </div>

                <ReviewPeriod
                    key={review.period_key}
                    periodKey={review.period_key}
                    nextPeriodKey={review.next_period_key}
                />

                {complete.isError && (
                    <p className="small mt-2 mb-0" role="alert" style={{ color: 'var(--danger)' }}>
                        That didn’t save. Please try again.
                    </p>
                )}

                <div className="d-flex gap-2 justify-content-end mt-3">
                    <button type="button" className="button-plain" onClick={onClose}>
                        Later
                    </button>
                    <button
                        type="button"
                        className="button-ink"
                        disabled={complete.isPending}
                        onClick={finish}
                    >
                        {last ? 'Done with review' : 'Done, next'}
                    </button>
                </div>
            </div>
        </div>
    );
}
