-- Nirdesh migration 002: versioned law library + nightly update check.
-- Run once in the Supabase SQL editor (after schema.sql). Safe to run twice.

alter table knowledge_documents
  add column if not exists source_url text,          -- official download link (PDF) checked nightly
  add column if not exists checksum text,            -- sha-256 of the file this version came from
  add column if not exists file_bytes bigint,
  add column if not exists status text not null default 'active',
  add column if not exists supersedes uuid references knowledge_documents(id) on delete set null,
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_check_status text,   -- unchanged | new_version_pending | failed | not_pdf | scanned
  add column if not exists last_check_error text,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz;

do $$ begin
  alter table knowledge_documents
    add constraint knowledge_documents_status_check
    check (status in ('importing','active','pending','superseded'));
exception when duplicate_object then null; end $$;

-- Only one version of an Act is quoted at a time: the active one.
create index if not exists knowledge_documents_status_idx on knowledge_documents(status);

insert into skills_registry(skill) values ('knowledge-sync') on conflict do nothing;
