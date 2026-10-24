-- Nirdesh database schema (Supabase / Postgres). Follows handoff section 6.
-- Audit principle: AI extraction, critic verdict and human decision are stored
-- in separate columns and never overwritten.
-- Run once in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('officer','citizen','admin')),
  created_at timestamptz not null default now()
);

create table if not exists court_orders (
  id uuid primary key default gen_random_uuid(),
  case_number text,
  court text,
  judgment_date date,
  petitioners text,
  respondents text,
  source_channel text not null default 'upload' check (source_channel in ('upload','email')),
  file_name text,
  file_ref text,                 -- path in Supabase Storage bucket "judgments"
  extracted_text text,           -- full text used for quote verification
  ocr_used boolean not null default false,
  user_role text not null default 'officer' check (user_role in ('officer','citizen')),
  -- pipeline state machine: uploaded -> extracting -> critic_round_1 -> correcting_1
  -- -> critic_round_2 -> correcting_2 -> awaiting_gate -> verified -> planned | explained
  pipeline_stage text not null default 'uploaded',
  correction_round int not null default 0,
  extractor_notes text,
  critic_raw jsonb,              -- last critic output, unmodified
  missed_directions jsonb not null default '[]',
  directions_total int not null default 0,
  directions_approved int not null default 0,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists directions (
  id uuid primary key default gen_random_uuid(),
  court_order_id uuid not null references court_orders(id) on delete cascade,
  label text not null,                       -- D1, D2 ...
  -- AI extraction (never overwritten after the gate)
  summary text,
  quote text,
  paragraph text,
  responsible_authority text,
  action_type text,
  period text,
  trigger text,
  deadline_date date,
  deadline_status text check (deadline_status in ('calculated','needs_human','immediate','none_stated')),
  beneficiary text,
  confidence text,
  quote_verified boolean,                    -- deterministic check in code
  date_check_note text,                      -- deterministic date arithmetic result
  -- critic
  critic_result text check (critic_result in ('approved','needs_correction','unresolved')),
  critic_flags jsonb not null default '[]',
  critic_problem text,
  flags_for_human jsonb not null default '[]',
  -- human gate
  human_decision text check (human_decision in ('approved','corrected','rejected')),
  decided_by text,
  decided_at timestamptz,
  corrected_authority text,
  corrected_deadline_date date,
  corrected_trigger text,
  corrected_period text,
  -- planning
  owner_office text,
  owner_source text check (owner_source in ('judgment','routing_table','human')),
  status text not null default 'unverified' check (status in ('unverified','verified','rejected')),
  task_status text check (task_status in ('on_track','due_soon','overdue','urgent','date_pending','no_deadline','paused','rejected')),
  date_of_receipt date,
  review_date date,
  stay_details jsonb,
  appeal_info jsonb,
  created_at timestamptz not null default now()
);
create index if not exists directions_order_idx on directions(court_order_id);

create table if not exists compliance_tasks (
  id uuid primary key default gen_random_uuid(),
  direction_id uuid not null references directions(id) on delete cascade,
  title text not null,
  due_date date,
  status text not null default 'open' check (status in ('open','done')),
  owner text,
  created_at timestamptz not null default now()
);

create table if not exists systemic_issues (
  id uuid primary key default gen_random_uuid(),
  department text,
  direction_type text,
  case_count int not null default 0,
  case_ids jsonb not null default '[]',
  status text not null default 'new' check (status in ('new','draft_ready','under_review')),
  policy_note_draft_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  direction_id uuid references directions(id) on delete cascade,
  court_order_id uuid references court_orders(id) on delete cascade,
  systemic_issue_id uuid references systemic_issues(id) on delete cascade,
  type text not null check (type in ('office_note','affidavit','reminder','escalation','policy_note','plan','citizen_explanation')),
  language text,
  content text not null,
  model_used text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists law_queries (
  id uuid primary key default gen_random_uuid(),
  user_role text,
  language text,
  question text not null,
  answer_layers jsonb,
  acts_cited jsonb not null default '[]',
  uncertain boolean not null default false,
  model_used text,
  created_at timestamptz not null default now()
);

create table if not exists legal_aid_handoffs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('law_query','court_order')),
  source_id uuid,
  summary text,
  sections jsonb not null default '[]',
  open_questions jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('act','rules','orgchart','judgment_example')),
  act_year int,
  version_note text,
  file_ref text,
  uploaded_at timestamptz not null default now(),
  assigned_skills jsonb not null default '[]'
);

-- Section-level chunks for keyword retrieval (handoff section 9).
create table if not exists knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  section_ref text,            -- e.g. "Section 20"
  heading text,
  content text not null,
  tsv tsvector generated always as (to_tsvector('english', coalesce(heading,'') || ' ' || content)) stored
);
create index if not exists knowledge_chunks_tsv_idx on knowledge_chunks using gin(tsv);

create table if not exists skill_activities (
  id bigserial primary key,
  skill text not null,
  event text not null check (event in ('started','processing','completed','failed')),
  detail text,
  ref_id uuid,
  ts timestamptz not null default now()
);

create table if not exists skills_registry (
  skill text primary key,
  status text not null default 'idle' check (status in ('idle','running')),
  invocation_count int not null default 0,
  last_run timestamptz
);

insert into skills_registry(skill) values
  ('user-intake-routing'),('direction-extraction'),('extraction-verification'),
  ('verification-gate'),('compliance-planning-drafting'),('citizen-explainer'),
  ('policy-insights'),('live-compliance-dashboard'),('know-your-law')
on conflict do nothing;

create table if not exists hours_saved_log (
  id bigserial primary key,
  kind text not null check (kind in ('judgment_read','draft')),
  minutes int not null,
  ref_id uuid,
  ts timestamptz not null default now()
);

-- AI activity log: what each agent sent and got back (no API keys ever stored).
create table if not exists ai_calls (
  id bigserial primary key,
  agent text not null,
  provider text,
  model text,
  ref_id uuid,
  request_summary text,
  response_text text,
  ok boolean not null default true,
  error text,
  duration_ms int,
  ts timestamptz not null default now()
);

-- Lock everything down: the browser never talks to the database directly.
-- All access goes through Next.js server routes using the service-role key.
do $$
declare t text;
begin
  foreach t in array array['users','court_orders','directions','compliance_tasks','systemic_issues','drafts',
    'law_queries','legal_aid_handoffs','knowledge_documents','knowledge_chunks','skill_activities',
    'skills_registry','hours_saved_log','ai_calls']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Storage bucket for uploaded judgments (private).
insert into storage.buckets (id, name, public) values ('judgments','judgments', false)
on conflict do nothing;
