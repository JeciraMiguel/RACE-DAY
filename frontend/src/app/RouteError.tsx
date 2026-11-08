import { Compass, TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { buttonClass, EmptyState } from '../components/ui';

/** Shown inside the layout when a route fails to load or render. */
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <div className="container" style={{ paddingBlock: '3rem' }}>
      <EmptyState
        icon={notFound ? Compass : TriangleAlert}
        title={notFound ? 'Page not found' : 'Something went wrong'}
        description={notFound ? 'The page you are looking for does not exist or has moved.' : 'We could not display this page. Try again in a moment.'}
        action={<Link to="/" className={buttonClass()}>Back to home</Link>}
      />
    </div>
  );
}
