import { createContext, useContext } from 'react';
import type { Item } from '@/api/items';

type ItemEditor = {
    /** Open the editor sheet for an existing task or goal. */
    editItem: (item: Item) => void;
};

const ItemEditorContext = createContext<ItemEditor | null>(null);

export const ItemEditorProvider = ItemEditorContext.Provider;

/** Lets any page open the shared add/edit sheet, which the app shell owns. */
export function useItemEditor(): ItemEditor {
    const editor = useContext(ItemEditorContext);

    if (!editor) {
        throw new Error('useItemEditor must be used inside the app shell');
    }

    return editor;
}
