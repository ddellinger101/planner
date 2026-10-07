import { createContext, useContext } from 'react';
import type { Item } from '@/api/items';

// Review -----------------------------------------------------------------------

type ReviewControls = {
    /** Open the rollover review, optionally starting at one period. */
    openReview: (periodKey?: string) => void;
};

const ReviewContext = createContext<ReviewControls>({ openReview: () => {} });

export const ReviewProvider = ReviewContext.Provider;

export const useReview = () => useContext(ReviewContext);

// "Mark the parent goal done too?" -------------------------------------------------

type ParentPrompt = {
    /** Called when an item that was pulled from a larger goal is finished. */
    offerParent: (child: Item) => void;
};

// A no-op outside the app shell, so components can be used on their own.
const ParentPromptContext = createContext<ParentPrompt>({ offerParent: () => {} });

export const ParentPromptProvider = ParentPromptContext.Provider;

export const useParentPrompt = () => useContext(ParentPromptContext);
