import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigation } from 'react-router-dom';
import { Avatar, buttonClass } from '../components/ui';
import { useAuth } from '../features/auth/useAuth';
import { useTheme } from '../features/theme/useTheme';
import styles from './AppShell.module.css';

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div className={styles.userMenu} ref={ref}>
      <button type="button" className={styles.userButton} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <Avatar name={user.fullName} size={30} />
        <span className={styles.userName}>{user.fullName.split(' ')[0]}</span>
      </button>
      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <strong>{user.fullName}</strong>
            {user.email} · {user.role}
          </div>
          <Link to="/me/registrations" className={styles.dropdownItem} onClick={() => setOpen(false)}>My races</Link>
          <Link to="/me/results" className={styles.dropdownItem} onClick={() => setOpen(false)}>My results</Link>
          <Link to="/me/profile" className={styles.dropdownItem} onClick={() => setOpen(false)}>Profile</Link>
          <button type="button" className={styles.dropdownItem} onClick={() => { setOpen(false); void logout(); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { status, hasRole } = useAuth();
  const { theme, toggle } = useTheme();
  const navigation = useNavigation();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // After a navigation: close the mobile menu, scroll to top and move focus to the page content
  // (so keyboard and screen reader users start at the new page). Skipped on the first render.
  const firstRender = useRef(true);
  useEffect(() => {
    setMenuOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      {navigation.state !== 'idle' && <div className={styles.progress} role="progressbar" aria-label="Loading page" />}

      <header className={styles.header}>
        <div className={`container ${styles.bar}`}>
          <Link to="/" className={styles.brand}>
            <span className={styles.logo} aria-hidden="true">▶</span> RaceDay
          </Link>

          <nav id="primary-nav" className={`${styles.nav} ${menuOpen ? styles.open : ''}`} aria-label="Main">
            <NavLink to="/events" className={styles.link}>Events</NavLink>
            {status === 'authenticated' && <NavLink to="/me" className={styles.link}>My races</NavLink>}
            {hasRole('Admin', 'Organizer') && <NavLink to="/manage" className={styles.link}>Manage</NavLink>}
            {status === 'anonymous' && <NavLink to="/login" className={`${styles.link} ${styles.mobileOnly}`}>Sign in</NavLink>}
          </nav>

          <div className={styles.actions}>
            <button type="button" className={styles.iconButton} onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
              {theme === 'dark' ? '☀' : '☾'}
            </button>

            {status === 'authenticated' ? (
              <UserMenu />
            ) : status === 'anonymous' ? (
              <>
                <Link to="/login" className={`${buttonClass('ghost', 'sm')} ${styles.headerSignIn}`}>Sign in</Link>
                <Link to="/register" className={buttonClass('primary', 'sm')}>Join</Link>
              </>
            ) : null}

            <button
              type="button"
              className={`${styles.iconButton} ${styles.menuButton}`}
              aria-expanded={menuOpen}
              aria-controls="primary-nav"
              aria-label="Toggle navigation menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} ref={mainRef} className={styles.main}>
        <Outlet />
      </main>

      <footer className={styles.footer}>
        <div className={`container ${styles.footerInner}`}>
          <span>© {new Date().getFullYear()} RaceDay</span>
          <span>Find your next start line.</span>
        </div>
      </footer>
    </>
  );
}
