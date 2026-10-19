import { Link, useParams } from 'react-router-dom';
import type { PublicAnnouncement } from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { Badge, EmptyState, ErrorPanel, Loading } from '../components/ui.js';
import { formatDateTime } from '../lib/format.js';
import { Icon } from '../components/Icon.js';

export function AnnouncementDetail() {
  const { slug = '' } = useParams();
  const { data, loading, error, reload } = useApi<{ announcement: PublicAnnouncement }>(
    slug ? `/api/announcements/${encodeURIComponent(slug)}` : null,
  );

  return (
    <section className="section">
      <div className="container-narrow stack-lg">
        <Link to="/announcements" className="small" style={{ fontWeight: 700 }}>
          ← All announcements
        </Link>
        {loading && <Loading label="Loading announcement…" />}
        {error &&
          (error.status === 404 ? (
            <EmptyState
              icon="file"
              title="Announcement not found"
              description="It may have been archived or the link may be incorrect."
              action={
                <Link className="btn btn-secondary btn-small" to="/announcements">
                  Browse announcements
                </Link>
              }
            />
          ) : (
            <ErrorPanel error={error} onRetry={reload} />
          ))}
        {data && (
          <article className="card stack" style={{ padding: 'clamp(1.4rem, 4vw, 2.4rem)' }}>
            <div className="row-between">
              <Badge tone="blue">{data.announcement.category.replace('_', ' ')}</Badge>
              <span className="small muted">{formatDateTime(data.announcement.publishedAt)}</span>
            </div>
            <h1 className="h1" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)' }}>
              {data.announcement.title}
            </h1>
            <div className="row small muted">
              <Icon name="users" size={15} />
              {data.announcement.authorName ?? 'Dardania | Elite staff'}
            </div>
            {data.announcement.imageUrl && (
              <img
                src={data.announcement.imageUrl}
                alt=""
                style={{ borderRadius: 'var(--radius-sm)', width: '100%' }}
              />
            )}
            <div className="announcement-body">{data.announcement.body}</div>
          </article>
        )}
      </div>
    </section>
  );
}
