import { useState } from 'react';
import {
  Avatar, Badge, Button, Card, CardBody, ConfirmDialog, DataTable, EmptyState, FileInput, Input, Modal,
  PageHeader, Pagination, PasswordInput, Select, Skeleton, SkeletonText, Spinner, Tabs, Textarea, useToast,
} from '../components/ui';
import { formatDuration } from '../lib/format';
import { eventStatusTone, paymentStatusTone } from '../lib/status';
import styles from './DesignSystem.module.css';

const COLORS = ['bg', 'surface', 'surface-2', 'surface-3', 'border', 'ink', 'ink-muted', 'accent', 'success', 'warning', 'danger', 'info'];

const RESULTS = [
  { rank: 1, bib: 214, name: 'Thandi Mokoena', time: '00:39:30.500' },
  { rank: 2, bib: 87, name: 'Jan van der Merwe', time: '00:41:02' },
  { rank: 3, bib: 301, name: 'Lerato Dlamini', time: '00:42:18' },
];

/** Development-only showcase of every foundation component (route /design). */
export function Component() {
  const toast = useToast();
  const [tab, setTab] = useState('one');
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [page, setPage] = useState(3);

  return (
    <div className="container">
      <PageHeader title="Design system" subtitle="Tokens and components used across RaceDay. Development only." />

      <section className={styles.section}>
        <h2>Colors</h2>
        <div className={styles.swatches}>
          {COLORS.map((name) => (
            <div key={name} className={styles.swatch}>
              <span className={styles.chip} style={{ background: `var(--${name})` }} />
              --{name}
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Typography</h2>
        <h1>Heading one</h1>
        <h2>Heading two</h2>
        <h3>Heading three</h3>
        <p style={{ marginTop: 'var(--space-3)' }}>Body text in Inter: the quick brown fox jumps over the lazy dog.</p>
        <p className="tnum" style={{ marginTop: 'var(--space-2)' }}>Tabular figures: 1:02:03 · 12:34 · 0:39.50 · {formatDuration('01:02:03.500')}</p>
      </section>

      <section className={styles.section}>
        <h2>Buttons</h2>
        <div className={styles.row}>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Form fields</h2>
        <div className={styles.grid}>
          <Input label="Text" placeholder="Placeholder" hint="A helpful hint." />
          <Input label="With error" defaultValue="oops" error="This value is not valid." />
          <PasswordInput label="Password" defaultValue="secret123" />
          <Select label="Select" defaultValue="b"><option value="a">Option A</option><option value="b">Option B</option></Select>
          <Textarea label="Textarea" placeholder="Longer text" />
          <FileInput label="File" hint="PNG or JPG, up to 5 MB." />
        </div>
      </section>

      <section className={styles.section}>
        <h2>Badges and avatars</h2>
        <div className={styles.row}>
          {(['Draft', 'Published', 'Cancelled', 'Completed'] as const).map((s) => <Badge key={s} tone={eventStatusTone[s]}>{s}</Badge>)}
          {(['Pending', 'Paid', 'Waived'] as const).map((s) => <Badge key={s} tone={paymentStatusTone[s]}>{s}</Badge>)}
          <Badge tone="accent">Accent</Badge>
          <Avatar name="Thandi Mokoena" />
          <Avatar name="Jan van der Merwe" size={52} />
        </div>
      </section>

      <section className={styles.section}>
        <h2>Cards and loading states</h2>
        <div className={styles.grid}>
          <Card interactive><CardBody><h3>Interactive card</h3><p>Lifts on hover and focus.</p></CardBody></Card>
          <Card><CardBody><SkeletonText lines={4} /></CardBody></Card>
          <Card><CardBody><Skeleton height={120} /><div style={{ marginTop: 12 }}><Spinner label="Loading demo" /></div></CardBody></Card>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Table (leaderboard)</h2>
        <DataTable
          caption="Example leaderboard"
          rows={RESULTS}
          rowKey={(r) => r.bib}
          columns={[
            { key: 'rank', header: 'Rank', numeric: true, render: (r) => <span className={r.rank === 1 ? styles.podium : undefined}>{r.rank}</span> },
            { key: 'bib', header: 'Bib', numeric: true, render: (r) => r.bib },
            { key: 'name', header: 'Runner', render: (r) => r.name },
            { key: 'time', header: 'Time', numeric: true, render: (r) => formatDuration(r.time) },
          ]}
        />
      </section>

      <section className={styles.section}>
        <h2>Tabs and pagination</h2>
        <Tabs
          label="Example tabs"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'one', label: '10 km', content: <p>Content of the 10 km tab.</p> },
            { id: 'two', label: '21 km', content: <p>Content of the 21 km tab.</p> },
            { id: 'three', label: '42 km', content: <p>Content of the 42 km tab.</p> },
          ]}
        />
        <Pagination page={page} pageCount={12} onPageChange={setPage} />
      </section>

      <section className={styles.section}>
        <h2>Overlays</h2>
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setModal(true)}>Open modal</Button>
          <Button variant="secondary" onClick={() => setConfirm(true)}>Open confirm</Button>
          <Button variant="ghost" onClick={() => toast.success('Registration confirmed')}>Success toast</Button>
          <Button variant="ghost" onClick={() => toast.error('Could not save your changes')}>Error toast</Button>
          <Button variant="ghost" onClick={() => toast.info('Registration closes tomorrow')}>Info toast</Button>
        </div>
        <Modal open={modal} onClose={() => setModal(false)} title="Example modal" footer={<Button onClick={() => setModal(false)}>Done</Button>}>
          <p>Focus is trapped here and Escape closes it.</p>
        </Modal>
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          title="Cancel registration?"
          message="You will lose your race number. This cannot be undone."
          confirmLabel="Cancel registration"
          danger
          onConfirm={() => new Promise((resolve) => setTimeout(resolve, 800))}
        />
      </section>

      <section className={styles.section}>
        <h2>Empty state</h2>
        <EmptyState title="No registrations yet" description="When you register for an event it will show up here." action={<Button>Browse events</Button>} />
      </section>
    </div>
  );
}
