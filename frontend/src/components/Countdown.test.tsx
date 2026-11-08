import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Countdown } from './Countdown';

describe('Countdown', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the remaining time, ticks every second and announces one static sentence', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-03-01T12:00:00'));
    render(<Countdown to="2027-03-02T12:00:10" />);

    expect(screen.getByRole('timer')).toHaveAccessibleName('Starts in 1 days, 0 hours and 0 minutes');
    expect(screen.getByText('10')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText('07')).toBeInTheDocument();
  });

  it('switches to a started message at zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-03-01T12:00:00'));
    render(<Countdown to="2027-03-01T12:00:02" />);

    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText('The race has started')).toBeInTheDocument();
  });
});
