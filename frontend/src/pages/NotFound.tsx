import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buttonClass, EmptyState } from '../components/ui';
import { usePageTitle } from '../lib/usePageTitle';

export function Component() {
  usePageTitle('Page not found');
  return (
    <div className="container" style={{ paddingBlock: '3rem' }}>
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you are looking for does not exist or has moved."
        action={<Link to="/events" className={buttonClass()}>Browse events</Link>}
      />
    </div>
  );
}
