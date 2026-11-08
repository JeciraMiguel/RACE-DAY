import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EventStepper } from '../manage/EventStepper';
import { ActionMenu, ProgressBar, SegmentedControl } from './index';

describe('ProgressBar', () => {
  it('exposes its value to assistive technology and never exceeds 100%', () => {
    render(<ProgressBar value={30} max={120} label="Registrations: 30 of 120" />);
    const bar = screen.getByRole('progressbar', { name: 'Registrations: 30 of 120' });
    expect(bar).toHaveAttribute('aria-valuenow', '30');
    expect(bar).toHaveAttribute('aria-valuemax', '120');
  });

  it('copes with an empty and an overfull bar', () => {
    const { rerender } = render(<ProgressBar value={0} max={0} label="Empty" />);
    expect(screen.getByRole('progressbar', { name: 'Empty' })).toHaveAttribute('aria-valuenow', '0');
    rerender(<ProgressBar value={9} max={5} label="Over" />);
    expect(screen.getByRole('progressbar', { name: 'Over' })).toHaveAttribute('aria-valuenow', '5');
  });
});

describe('SegmentedControl', () => {
  function Harness({ onChange }: { onChange?: (v: string) => void }) {
    const [value, setValue] = useState('a');
    return (
      <SegmentedControl
        label="Filter by status"
        value={value}
        onChange={(v) => { setValue(v); onChange?.(v); }}
        options={[{ value: 'a', label: 'All', count: 7 }, { value: 'b', label: 'Draft', count: 2 }, { value: 'c', label: 'Hidden', disabled: true }]}
      />
    );
  }

  it('is a radio group with the counts next to the labels', () => {
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Filter by status' });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /All/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Draft/ })).toHaveAccessibleName(/2/);
    expect(screen.getByRole('radio', { name: 'Hidden' })).toBeDisabled();
  });

  it('changes the value on click and with the arrow keys', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: /Draft/ }));
    expect(onChange).toHaveBeenLastCalledWith('b');
    expect(screen.getByRole('radio', { name: /Draft/ })).toBeChecked();

    screen.getByRole('radio', { name: /Draft/ }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('a');
  });
});

describe('ActionMenu', () => {
  const setup = () => {
    const onCancel = vi.fn();
    const onDelete = vi.fn();
    render(
      <div>
        <ActionMenu label="More actions" items={[{ label: 'Cancel event', onSelect: onCancel, danger: true }, { label: 'Delete event', onSelect: onDelete }, { label: 'Disabled', onSelect: () => {}, disabled: true }]} />
        <p>outside</p>
      </div>,
    );
    return { onCancel, onDelete };
  };

  it('opens with the trigger, runs an item and closes', async () => {
    const { onCancel } = setup();
    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Cancel event' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('moves focus with the arrows, skips disabled items and closes on Escape or an outside click', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getByRole('menuitem', { name: 'Cancel event' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Delete event' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}'); // wraps past the disabled one
    expect(screen.getByRole('menuitem', { name: 'Cancel event' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByText('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('EventStepper', () => {
  it('marks the current step and the finished ones', () => {
    render(<EventStepper status="Published" />);
    expect(screen.getByRole('list', { name: 'Event progress' })).toBeInTheDocument();
    expect(screen.getByText('Published').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Draft').closest('li')).not.toHaveAttribute('aria-current');
  });

  it('shows one clear marker for a cancelled event', () => {
    render(<EventStepper status="Cancelled" />);
    expect(screen.getByText(/This event was cancelled/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
