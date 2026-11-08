import type { Blocker } from 'react-router-dom';
import { Button, Modal } from './ui';

/** Asks whether to leave when the router blocked a navigation because of unsaved changes. */
export function UnsavedChangesDialog({ blocker }: { blocker: Blocker }) {
  const blocked = blocker.state === 'blocked';
  const stay = () => { if (blocker.state === 'blocked') blocker.reset(); };

  return (
    <Modal
      open={blocked}
      onClose={stay}
      title="Discard your changes?"
      footer={
        <>
          <Button variant="secondary" onClick={stay}>Keep editing</Button>
          <Button variant="danger" onClick={() => { if (blocker.state === 'blocked') blocker.proceed(); }}>Discard changes</Button>
        </>
      }
    >
      <p>You have changes that are not saved. If you leave this page they will be lost.</p>
    </Modal>
  );
}
