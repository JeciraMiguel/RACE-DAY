import { Link } from 'react-router-dom';
import { formatMoney } from '../lib/format';
import type { Registration } from '../lib/types';
import { Button, buttonClass, Modal } from './ui';
import styles from './RegistrationSuccess.module.css';

/** Shown right after registering: the race number is the thing people want to see. */
export function RegistrationSuccess({ registration, onClose }: { registration: Registration | null; onClose: () => void }) {
  return (
    <Modal
      open={registration !== null}
      onClose={onClose}
      title="You're registered!"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Link to="/me/registrations" className={buttonClass()} onClick={onClose}>View my races</Link>
        </>
      }
    >
      {registration && (
        <div className={styles.content}>
          <span className={styles.label}>Your race number</span>
          <span className={styles.bib} aria-label={`Race number ${registration.raceNumber}`}>#{registration.raceNumber}</span>
          <p>{registration.categoryName} · {registration.eventTitle}</p>
          <p className={styles.note}>
            {registration.entryFee > 0
              ? `The entry fee is ${formatMoney(registration.entryFee)}. Pay the organizer to complete your registration; you can follow the status in My races.`
              : 'This event is free to enter. See you at the start line!'}
          </p>
        </div>
      )}
    </Modal>
  );
}
