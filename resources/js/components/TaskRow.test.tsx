import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { elizabeth, makeItem } from '@/test/helpers';
import TaskRow from './TaskRow';

function renderRow(overrides = {}, assignee = undefined as typeof elizabeth | undefined) {
    const onChange = vi.fn();
    const onDelete = vi.fn();

    render(
        <ul>
            <TaskRow
                item={makeItem(overrides)}
                assignee={assignee}
                onChange={onChange}
                onDelete={onDelete}
            />
        </ul>,
    );

    return { onChange, onDelete };
}

describe('TaskRow', () => {
    it('checks an open task and vibrates where the device supports it', async () => {
        const vibrate = vi.fn();
        Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
        const { onChange } = renderRow();

        await userEvent.click(screen.getByRole('checkbox', { name: 'Morning run' }));

        expect(onChange).toHaveBeenCalledWith({ status: 'done' });
        expect(vibrate).toHaveBeenCalledWith(10);

        Reflect.deleteProperty(navigator, 'vibrate');
    });

    it('unchecks a done task without any celebration', async () => {
        const { onChange } = renderRow({ status: 'done' });
        const checkbox = screen.getByRole('checkbox', { name: 'Morning run' });

        expect(checkbox).toHaveAttribute('aria-checked', 'true');
        await userEvent.click(checkbox);

        expect(onChange).toHaveBeenCalledWith({ status: 'open' });
        expect(checkbox).not.toHaveClass('just-checked');
    });

    it('works on a device with no vibration support', async () => {
        const { onChange } = renderRow();

        await userEvent.click(screen.getByRole('checkbox', { name: 'Morning run' }));

        expect(onChange).toHaveBeenCalledWith({ status: 'done' });
    });

    it('toggles the star', async () => {
        const { onChange } = renderRow({ starred: true });
        const star = screen.getByRole('button', { name: 'Star Morning run' });

        expect(star).toHaveAttribute('aria-pressed', 'true');
        await userEvent.click(star);

        expect(onChange).toHaveBeenCalledWith({ starred: false });
    });

    it('deletes', async () => {
        const { onDelete } = renderRow();

        await userEvent.click(screen.getByRole('button', { name: 'Delete Morning run' }));

        expect(onDelete).toHaveBeenCalledOnce();
    });

    it('shows the time, a repeat badge and who it belongs to', () => {
        renderRow({ due_time: '15:30', recurrence_rule: 'FREQ=DAILY' }, elizabeth);

        expect(screen.getByText('3:30 PM')).toBeInTheDocument();
        expect(screen.getByText('Repeats')).toBeInTheDocument();
        expect(screen.getByText('Assigned to Elizabeth')).toBeInTheDocument();
    });

    it('shows no badges on a plain task', () => {
        renderRow();

        expect(screen.queryByText('Repeats')).not.toBeInTheDocument();
        expect(screen.queryByText(/Assigned to/)).not.toBeInTheDocument();
    });
});
