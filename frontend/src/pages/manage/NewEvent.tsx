import { Link, useNavigate } from 'react-router-dom';
import { EventForm } from '../../components/manage/EventForm';
import { usePageTitle } from '../../lib/usePageTitle';
import styles from './Manage.module.css';

export function Component() {
  usePageTitle('New event');
  const navigate = useNavigate();

  return (
    <>
      <Link to="/manage" className={styles.muted}>← Events</Link>
      <header className={styles.header}>
        <div>
          <h2>New event</h2>
          <p className={styles.sub}>It starts as a draft. Add categories next, then publish when it is ready.</p>
        </div>
      </header>
      {/* After creating, the next step is adding categories */}
      <EventForm onSaved={(id) => navigate(`/manage/events/${id}/categories`)} />
    </>
  );
}
