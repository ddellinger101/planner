import { Sparkles } from 'lucide-react';
import { useBrainDump } from '@/api/brainDump';
import BrainDumpBoard from '@/components/brain/BrainDumpBoard';
import PageHeader from '@/components/PageHeader';

export default function BrainDumpPage() {
    const board = useBrainDump();
    const planned = board.data?.assigned_this_week ?? 0;

    return (
        <>
            <PageHeader showPersonFilter={false}>Brain Dump</PageHeader>
            <main className="container-fluid page-body">
                <p className="dump-intro">
                    Empty your head here. Nothing needs a date until you give it one.
                    {planned > 0 && (
                        <span className="dump-nudge">
                            <Sparkles aria-hidden="true" size={15} />
                            {planned === 1 ? '1 item' : `${planned} items`} added to the plan this
                            week
                        </span>
                    )}
                </p>
                <BrainDumpBoard />
            </main>
        </>
    );
}
