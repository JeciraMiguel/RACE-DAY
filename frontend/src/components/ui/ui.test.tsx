import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '../../app/RequireAuth';
import { AuthContext, type AuthState } from '../../features/auth/auth-context';
import { Input, Pagination, Tabs, ToastProvider, useToast } from './index';

describe('Input', () => {
  it('associates the label and wires the error for assistive technology', () => {
    render(<Input label="Email" error="Enter a valid email." required />);

    const input = screen.getByLabelText(/email/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid email.');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email.');
  });

  it('uses the hint as description when there is no error', () => {
    render(<Input label="Password" hint="At least 8 characters." />);
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('At least 8 characters.');
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid');
  });
});

describe('Pagination', () => {
  it('marks the current page, collapses gaps and disables the edges', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageCount={10} onPageChange={onPageChange} />);

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Page 10' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Page 5' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} pageCount={1} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Tabs', () => {
  function Harness() {
    return (
      <Tabs
        label="Categories"
        value="a"
        onChange={onChange}
        tabs={[
          { id: 'a', label: 'A', content: <p>Panel A</p> },
          { id: 'b', label: 'B', content: <p>Panel B</p> },
        ]}
      />
    );
  }
  const onChange = vi.fn();

  it('exposes tab semantics and supports arrow-key navigation', async () => {
    render(<Harness />);

    expect(screen.getByRole('tablist', { name: 'Categories' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel A');

    screen.getByRole('tab', { name: 'A' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('Toast', () => {
  afterEach(() => vi.useRealTimers());

  function Trigger() {
    const toast = useToast();
    return <button onClick={() => toast.error('Could not save')}>go</button>;
  }

  it('announces errors as alerts and dismisses them after a while', () => {
    vi.useFakeTimers();
    render(<ToastProvider><Trigger /></ToastProvider>);

    act(() => screen.getByText('go').click());
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');

    act(() => { vi.advanceTimersByTime(8100); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('RequireAuth', () => {
  const base: AuthState = {
    status: 'anonymous', user: null,
    login: vi.fn(), register: vi.fn(), logout: vi.fn(), reloadProfile: vi.fn(),
    hasRole: () => false,
  };

  function renderAt(auth: Partial<AuthState>, roles?: ('Admin' | 'Organizer' | 'Participant')[]) {
    return render(
      <AuthContext.Provider value={{ ...base, ...auth }}>
        <MemoryRouter initialEntries={['/secret']}>
          <Routes>
            <Route element={<RequireAuth roles={roles} />}>
              <Route path="/secret" element={<p>secret content</p>} />
            </Route>
            <Route path="/login" element={<p>login page</p>} />
            <Route path="/forbidden" element={<p>forbidden page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
  }

  const user = { userId: 1, fullName: 'A B', email: 'a@b.c', role: 'Participant' as const, dateOfBirth: null, gender: null, phone: null, emergencyContactName: null, emergencyContactPhone: null, createdAt: '2026-01-01T00:00:00Z' };

  it('shows a spinner while the session is restored', () => {
    renderAt({ status: 'loading' });
    expect(screen.getByRole('status', { name: /checking your session/i })).toBeInTheDocument();
  });

  it('redirects anonymous users to the login page', () => {
    renderAt({ status: 'anonymous' });
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('lets authenticated users through', () => {
    renderAt({ status: 'authenticated', user });
    expect(screen.getByText('secret content')).toBeInTheDocument();
  });

  it('sends users without the required role to /forbidden', () => {
    renderAt({ status: 'authenticated', user }, ['Admin']);
    expect(screen.getByText('forbidden page')).toBeInTheDocument();
  });
});
