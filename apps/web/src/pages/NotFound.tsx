import { Link } from 'react-router-dom';

export function NotFound({ inDashboard = false }: { inDashboard?: boolean }) {
  return (
    <section className="section">
      <div className="container-narrow center stack" style={{ alignItems: 'center' }}>
        <span className="eyebrow" style={{ justifyContent: 'center' }}>
          404
        </span>
        <h1 className="h1" style={{ fontSize: 'clamp(1.9rem, 4vw, 2.6rem)' }}>
          {inDashboard ? 'This dashboard page does not exist' : 'Page not found'}
        </h1>
        <p className="lead">
          The link may be outdated. Use the navigation to find the page you were looking for.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn" to={inDashboard ? '/dashboard' : '/'}>
            {inDashboard ? 'Back to overview' : 'Back to home'}
          </Link>
          {!inDashboard && (
            <Link className="btn btn-secondary" to="/status">
              Service status
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
