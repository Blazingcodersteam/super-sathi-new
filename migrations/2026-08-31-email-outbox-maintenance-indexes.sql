CREATE INDEX IF NOT EXISTS idx_email_outbox_cleanup
  ON email_outbox (status, processed_at, id);

CREATE INDEX IF NOT EXISTS idx_email_outbox_stale_processing
  ON email_outbox (status, updated_at, id);
