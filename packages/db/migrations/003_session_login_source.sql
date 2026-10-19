-- Persist how a dashboard session was established so /api/auth/me reports the
-- truth instead of assuming every session came from OAuth.
ALTER TABLE sessions ADD COLUMN login_source TEXT NOT NULL DEFAULT 'oauth';
