import {
    Apple,
    Baby,
    CalendarPlus,
    CircleAlert,
    CircleArrowUp,
    CircleDashed,
    Mail,
    Phone,
    ShoppingCart,
    StickyNote,
    type LucideIcon,
} from 'lucide-react';
import { useState, type CSSProperties, type DragEvent, type FormEvent } from 'react';
import {
    BUCKETS,
    useAddBrainDump,
    useBrainDump,
    useUpdateBrainDump,
    type BrainDumpBucket,
    type BrainDumpItem,
} from '@/api/brainDump';
import CategoryIcon from '@/components/CategoryIcon';
import { DumpEditSheet, PlanSheet } from './BrainDumpSheets';

const DRAG_TYPE = 'application/x-planner-dump';

// Each box has its own color and line icon. Only 4 You uses the band's mark.
const LOOK: Record<BrainDumpBucket, { color: string; icon: LucideIcon | null }> = {
    must_do: { color: '#c2413b', icon: CircleAlert },
    should_do: { color: '#d99a1c', icon: CircleArrowUp },
    could_do: { color: '#64748b', icon: CircleDashed },
    call: { color: '#3b7dd8', icon: Phone },
    email: { color: '#2f8f83', icon: Mail },
    buy: { color: '#c0622d', icon: ShoppingCart },
    other: { color: '#64748b', icon: StickyNote },
    health_habits: { color: '#2f8f83', icon: Apple },
    kids_stuff: { color: '#e8677a', icon: Baby },
    only_4_you: { color: '#8257d6', icon: null },
};

/**
 * The Brain Dump: ten boxes to empty your head into. An item stays in its
 * box until it is added to the plan, which gives it a day (or a week) and a
 * category and takes it off the board.
 */
export default function BrainDumpBoard() {
    const board = useBrainDump();
    const update = useUpdateBrainDump();
    const [planning, setPlanning] = useState<BrainDumpItem | null>(null);
    const [editing, setEditing] = useState<BrainDumpItem | null>(null);
    const [dropTarget, setDropTarget] = useState<BrainDumpBucket | null>(null);
    const items = board.data?.items ?? [];

    const drop = (event: DragEvent, bucket: BrainDumpBucket) => {
        const item = items.find(
            (candidate) => candidate.id === Number(event.dataTransfer.getData(DRAG_TYPE)),
        );

        setDropTarget(null);

        if (item && item.bucket !== bucket) {
            event.preventDefault();
            update.mutate({ id: item.id, bucket });
        }
    };

    return (
        <>
            {board.isError && (
                <p role="alert" style={{ color: 'var(--danger)' }}>
                    The Brain Dump didn’t load. Check your connection and try again.
                </p>
            )}

            <div className="dump-board" aria-busy={board.isPending}>
                {BUCKETS.map(({ bucket, name }) => {
                    const { color, icon: Icon } = LOOK[bucket];
                    const boxItems = items.filter((item) => item.bucket === bucket);

                    return (
                        <section
                            key={bucket}
                            className={`cat planner-card dump-box is-${bucket}${dropTarget === bucket ? ' is-drop-target' : ''}`}
                            style={{ '--cat': color } as CSSProperties}
                            aria-labelledby={`dump-${bucket}`}
                            onDragOver={(event) => {
                                if (event.dataTransfer.types.includes(DRAG_TYPE)) {
                                    event.preventDefault();
                                    setDropTarget(bucket);
                                }
                            }}
                            onDragLeave={() => setDropTarget(null)}
                            onDrop={(event) => drop(event, bucket)}
                        >
                            <header className="category-box-header">
                                <span className="category-box-icon">
                                    {Icon ? (
                                        <Icon aria-hidden="true" size={22} />
                                    ) : (
                                        <CategoryIcon icon="custom:only4you" size={22} />
                                    )}
                                </span>
                                <h2 id={`dump-${bucket}`} className="highlight-heading">
                                    {name}
                                </h2>
                                {boxItems.length > 0 && (
                                    <span className="category-box-count">{boxItems.length}</span>
                                )}
                            </header>

                            <ul className="dump-list">
                                {boxItems.map((item) => (
                                    <li
                                        key={item.id}
                                        draggable
                                        onDragStart={(event) => {
                                            event.dataTransfer.setData(DRAG_TYPE, String(item.id));
                                            event.dataTransfer.effectAllowed = 'move';
                                        }}
                                    >
                                        <span className="dump-marker" aria-hidden="true" />
                                        <button
                                            type="button"
                                            className="task-title-button dump-title"
                                            aria-label={`Edit ${item.title}`}
                                            onClick={() => setEditing(item)}
                                        >
                                            {item.title}
                                        </button>
                                        {item.from_google && (
                                            <span className="task-badge" title="From Google Tasks">
                                                Google
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            className="button-plain is-small"
                                            aria-label={`Add ${item.title} to plan`}
                                            onClick={() => setPlanning(item)}
                                        >
                                            <CalendarPlus aria-hidden="true" size={14} />
                                            Add to Plan
                                        </button>
                                    </li>
                                ))}
                            </ul>

                            <QuickEntry bucket={bucket} name={name} />
                        </section>
                    );
                })}
            </div>

            {planning && (
                <PlanSheet key={planning.id} item={planning} onClose={() => setPlanning(null)} />
            )}
            {editing && (
                <DumpEditSheet key={editing.id} item={editing} onClose={() => setEditing(null)} />
            )}
        </>
    );
}

/** Type, press Enter, and keep typing: the field stays put for the next one. */
function QuickEntry({ bucket, name }: { bucket: BrainDumpBucket; name: string }) {
    const add = useAddBrainDump();
    const [title, setTitle] = useState('');

    const submit = (event: FormEvent) => {
        event.preventDefault();

        if (title.trim()) {
            add.mutate({ bucket, title: title.trim() });
            setTitle('');
        }
    };

    return (
        <form className="inline-add" onSubmit={submit}>
            <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Add…"
                aria-label={`Add to ${name}`}
                maxLength={255}
                enterKeyHint="done"
            />
        </form>
    );
}
