import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ANNOUNCEMENT_CATEGORIES,
  type AnnouncementCategory,
  type Paginated,
  type PublicAnnouncement,
} from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { buildQuery } from '../lib/api.js';
import { Badge, EmptyState, ErrorPanel, Field, Loading, Pagination } from '../components/ui.js';
import { formatDate } from '../lib/format.js';

export function Announcements() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory | ''>('');
  const [page, setPage] = useState(1);

  const path = `/api/announcements${buildQuery({
    q: query,
    category: category || undefined,
    page,
    pageSize: 9,
  })}`;
  const { data, loading, error, reload } = useApi<Paginated<PublicAnnouncement>>(path);

  return (
    <section className="section">
      <div className="container stack-lg">
        <div className="section-head">
          <span className="eyebrow">Newsroom</span>
          <h1 className="h1" style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)' }}>
            Announcements
          </h1>
          <p className="lead">
            Official updates from the Dardania | Elite staff. Published items are also delivered to
            the Discord announcements channel.
          </p>
        </div>

        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <div className="filter-bar">
            <Field label="Search" htmlFor="ann-search">
              <input
                id="ann-search"
                className="input"
                type="search"
                placeholder="Search title or content"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
            <Field label="Category" htmlFor="ann-category">
              <select
                id="ann-category"
                className="select"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as AnnouncementCategory | '');
                  setPage(1);
                }}
              >
                <option value="">All categories</option>
                {ANNOUNCEMENT_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <button className="btn" type="submit">
              Apply filters
            </button>
          </div>
        </form>

        {loading && <Loading label="Loading announcements…" />}
        {error && <ErrorPanel error={error} onRetry={reload} />}

        {!loading && !error && data && (
          <>
            {data.items.length === 0 ? (
              <EmptyState
                icon="megaphone"
                title="No announcements match your filters"
                description="Try a different search term or category. Nothing is shown here unless it was published."
              />
            ) : (
              <div className="grid grid-3">
                {data.items.map((item) => (
                  <Link
                    key={item.id}
                    to={`/announcements/${item.slug}`}
                    className="card card-hover announcement-card"
                  >
                    <div className="row-between">
                      <Badge tone="blue">{item.category.replace('_', ' ')}</Badge>
                      <span className="small muted">{formatDate(item.publishedAt)}</span>
                    </div>
                    <h2 className="h3">{item.title}</h2>
                    <p>{item.body.length > 180 ? `${item.body.slice(0, 177)}…` : item.body}</p>
                    <div className="row-between">
                      <span className="small muted">
                        {item.authorName ?? 'Dardania | Elite staff'}
                      </span>
                      <span className="small" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                        Read →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              onPage={setPage}
              label="announcements"
            />
          </>
        )}
      </div>
    </section>
  );
}
