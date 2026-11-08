import { Ban } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buttonClass, EmptyState } from '../components/ui';
import { usePageTitle } from '../lib/usePageTitle';

export function Component() {
  usePageTitle('No access');
  return (
    <div className="container" style={{ paddingBlock: '3rem' }}>
      <EmptyState
        icon={Ban}
        title="You do not have access"
        description="Your account does not have permission to view this page."
        action={<Link to="/" className={buttonClass()}>Back to home</Link>}
      />
    </div>
  );
}
