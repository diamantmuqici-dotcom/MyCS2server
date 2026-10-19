import { useState } from 'react';
import {
  ANNOUNCEMENT_CATEGORIES,
  type AnnouncementCategory,
  type AnnouncementDto,
  type Paginated,
} from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { useMutation } from '../lib/session.js';
import { buildQuery, ApiError } from '../lib/api.js';
import { Alert, Button, EmptyState, ErrorPanel, Field, Loading, Modal, Pagination } from '../components/ui.js';
import { formatDateTime } from '../lib/format.js';
import { PageHeader, RefreshButton } from './ui.js';
import { RequireLevel } from './RequireLevel.js';
import { Icon } from '../components/Icon.js';

interface EditorState {
  id: string | null;
  title: string;
  body: string;
  category: AnnouncementCategory;
  imageUrl: string;
}

const EMPTY_EDITOR: EditorState = {
  id: null,
  title: '',
  body: '',
  category: 'GENERAL',
  imageUrl: '',
};

export function AnnouncementsAdmin() {
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | ''>('');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const mutate = useMutation();

  const path = `/api/dashboard/announcements${buildQuery({
    status: status || undefined,
    page,
    pageSize: 20,
  })}`;
  const { data, loading, error, reload } = useApi<Paginated<AnnouncementDto>>(path);

  const save = async () => {
    if (!editor) return;
    setBusy(true);
    setFailure(null);
    setFeedback(null);
    try {
      const payload = {
        title: editor.title.trim(),
        body: editor.body.trim(),
        category: editor.category,
        imageUrl: editor.imageUrl.trim() || null,
      };
      if (editor.id) {
        await mutate(`/api/dashboard/announcements/${editor.id}`, {
          method: 'PATCH',
          body: payload,
        });
        setFeedback('Draft updated.');
      } else {
        await mutate('/api/dashboard/announcements', { method: 'POST', body: payload });
        setFeedback('Draft created. Publish it to make it visible on the website and queue the Discord post.');
      }
      setEditor(null);
      reload();
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.message : 'The announcement could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const publish = async (item: AnnouncementDto) => {
    setBusy(true);
    setFailure(null);
    setFeedback(null);
    try {
      const result = await mutate<{ announcement: AnnouncementDto; enqueued: boolean }>(
        `/api/dashboard/announcements/${item.id}/publish`,
        { method: 'POST' },
      );
      setFeedback(
        result.enqueued
          ? `"${item.title}" is published and the Discord delivery is queued. The bot posts it when it is online.`
          : `"${item.title}" is published on the website, but no Discord delivery was queued (no announcement channel configured).`,
      );
      reload();
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.message : 'Publishing failed.');
    } finally {
      setBusy(false);
    }
  };

  const archive = async (item: AnnouncementDto) => {
    setBusy(true);
    setFailure(null);
    setFeedback(null);
    try {
      await mutate(`/api/dashboard/announcements/${item.id}/archive`, { method: 'POST' });
      setFeedback(`"${item.title}" archived. It is no longer listed publicly.`);
      reload();
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.message : 'Archiving failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequireLevel level="CO_OWNER">
      <div className="stack" style={{ gap: '1.4rem' }}>
        <PageHeader
          title="Announcements"
          description="Drafts are private to staff. Publishing makes an item public and queues a Discord delivery."
          actions={
            <div className="row">
              <RefreshButton onClick={reload} busy={loading} />
              <Button size="small" onClick={() => setEditor(EMPTY_EDITOR)}>
                <Icon name="plus" size={14} /> New draft
              </Button>
            </div>
          }
        />

        {feedback && <Alert tone="success">{feedback}</Alert>}
        {failure && <Alert tone="danger">{failure}</Alert>}

        <form className="card" onSubmit={(event) => event.preventDefault()}>
          <div className="filter-bar">
            <Field label="Status" htmlFor="admin-ann-status">
              <select
                id="admin-ann-status"
                className="select"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as typeof status);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                <option value="DRAFT">Drafts</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </Field>
          </div>
        </form>

        {loading && !data && <Loading label="Loading announcements…" />}
        {error && <ErrorPanel error={error} onRetry={reload} />}

        {data && (
          <>
            {data.items.length === 0 ? (
              <EmptyState
                icon="megaphone"
                title="No announcements yet"
                description="Create a draft, review it, then publish. Nothing is posted to Discord until a draft is published."
                action={<Button onClick={() => setEditor(EMPTY_EDITOR)}>Create the first draft</Button>}
              />
            ) : (
              <div className="stack">
                {data.items.map((item) => (
                  <article className="card" key={item.id}>
                    <div className="card-header">
                      <div>
                        <div className="row" style={{ gap: '0.4rem' }}>
                          <span className="card-title">{item.title}</span>
                          <span className={`badge badge-${item.status === 'PUBLISHED' ? 'success' : item.status === 'DRAFT' ? 'warning' : 'neutral'}`}>
                            {item.status}
                          </span>
                          <span className="badge badge-blue">{item.category.replace('_', ' ')}</span>
                        </div>
                        <div className="card-subtitle">
                          {item.authorName ?? 'Unknown author'} · updated {formatDateTime(item.updatedAt)}
                          {item.publishedAt ? ` · published ${formatDateTime(item.publishedAt)}` : ''}
                        </div>
                      </div>
                      <div className="row">
                        {item.status !== 'ARCHIVED' && (
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() =>
                              setEditor({
                                id: item.id,
                                title: item.title,
                                body: item.body,
                                category: item.category,
                                imageUrl: item.imageUrl ?? '',
                              })
                            }
                            disabled={busy}
                          >
                            Edit
                          </Button>
                        )}
                        {item.status !== 'PUBLISHED' && item.status !== 'ARCHIVED' && (
                          <Button size="small" onClick={() => void publish(item)} disabled={busy}>
                            Publish
                          </Button>
                        )}
                        {item.status === 'PUBLISHED' && (
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => void archive(item)}
                            disabled={busy}
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="small muted" style={{ whiteSpace: 'pre-wrap' }}>
                      {item.body.length > 320 ? `${item.body.slice(0, 317)}…` : item.body}
                    </p>
                    <div className="row-between small muted" style={{ marginTop: '0.6rem' }}>
                      <span className="mono">{item.slug}</span>
                      <span>
                        {item.discordMessageId
                          ? `Delivered to Discord (${item.discordMessageId})`
                          : item.status === 'PUBLISHED'
                            ? 'Discord delivery pending or not configured'
                            : 'Not delivered'}
                      </span>
                    </div>
                  </article>
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

      {editor && (
        <Modal
          title={editor.id ? 'Edit announcement' : 'New announcement draft'}
          onClose={() => !busy && setEditor(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setEditor(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                onClick={() => void save()}
                disabled={busy || editor.title.trim().length < 3 || editor.body.trim().length < 10}
              >
                {busy ? 'Saving…' : editor.id ? 'Save changes' : 'Create draft'}
              </Button>
            </>
          }
        >
          <Field label="Title" htmlFor="ann-title" hint="3–120 characters">
            <input
              id="ann-title"
              className="input"
              value={editor.title}
              onChange={(event) => setEditor({ ...editor, title: event.target.value })}
            />
          </Field>
          <Field label="Category" htmlFor="ann-category">
            <select
              id="ann-category"
              className="select"
              value={editor.category}
              onChange={(event) =>
                setEditor({ ...editor, category: event.target.value as AnnouncementCategory })
              }
            >
              {ANNOUNCEMENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category.replace('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Body" htmlFor="ann-body" hint="Plain text. 10–8000 characters.">
            <textarea
              id="ann-body"
              className="textarea"
              value={editor.body}
              onChange={(event) => setEditor({ ...editor, body: event.target.value })}
            />
          </Field>
          <Field label="Image URL (optional)" htmlFor="ann-image" hint="Must be an absolute http(s) URL.">
            <input
              id="ann-image"
              className="input"
              value={editor.imageUrl}
              onChange={(event) => setEditor({ ...editor, imageUrl: event.target.value })}
            />
          </Field>
        </Modal>
      )}
    </RequireLevel>
  );
}
