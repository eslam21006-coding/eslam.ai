alter table public.knowledge_sources
  add column source_kind text not null default 'document',
  add column source_url text,
  add column external_source_id text,
  add column source_language text;

alter table public.knowledge_sources
  add constraint knowledge_sources_kind_check
    check (source_kind in ('document', 'youtube_transcript')),
  add constraint knowledge_sources_source_url_check
    check (source_url is null or char_length(btrim(source_url)) between 1 and 2048),
  add constraint knowledge_sources_external_source_id_check
    check (external_source_id is null or char_length(btrim(external_source_id)) between 1 and 120),
  add constraint knowledge_sources_source_language_check
    check (source_language is null or char_length(btrim(source_language)) between 2 and 35),
  add constraint knowledge_sources_origin_shape_check
    check (
      (
        source_kind = 'document'
        and source_url is null
        and external_source_id is null
        and source_language is null
      )
      or (
        source_kind = 'youtube_transcript'
        and source_url is not null
        and source_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
        and external_source_id ~ '^[A-Za-z0-9_-]{11}$'
        and mime_type = 'text/plain'
      )
    );

create unique index knowledge_sources_youtube_video_unique_idx
  on public.knowledge_sources (external_source_id)
  where source_kind = 'youtube_transcript' and status <> 'deleting';

comment on column public.knowledge_sources.source_kind is
  'Reference origin. youtube_transcript remains external Knowledge only and never establishes an Eslam teaching by itself.';
comment on column public.knowledge_sources.source_url is
  'Canonical external reference URL when the source originated outside an uploaded document.';
comment on column public.knowledge_sources.external_source_id is
  'Stable provider-independent external identifier. For YouTube this is the canonical 11-character video ID.';
comment on column public.knowledge_sources.source_language is
  'Language reported for the stored transcript artifact when known.';

create table public.youtube_transcript_imports (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  video_id text not null,
  canonical_url text not null,
  requested_language text,
  resolved_language text,
  video_title text not null,
  channel_name text,
  provider_job_id text not null,
  status text not null default 'processing',
  last_error_code text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint youtube_transcript_imports_video_id_check
    check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  constraint youtube_transcript_imports_url_check
    check (canonical_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'),
  constraint youtube_transcript_imports_requested_language_check
    check (requested_language is null or char_length(btrim(requested_language)) between 2 and 35),
  constraint youtube_transcript_imports_resolved_language_check
    check (resolved_language is null or char_length(btrim(resolved_language)) between 2 and 35),
  constraint youtube_transcript_imports_title_check
    check (char_length(btrim(video_title)) between 1 and 200),
  constraint youtube_transcript_imports_channel_check
    check (channel_name is null or char_length(btrim(channel_name)) between 1 and 200),
  constraint youtube_transcript_imports_job_check
    check (char_length(btrim(provider_job_id)) between 1 and 200),
  constraint youtube_transcript_imports_status_check
    check (status in ('processing', 'failed')),
  constraint youtube_transcript_imports_error_check
    check (last_error_code is null or char_length(btrim(last_error_code)) between 1 and 100),
  constraint youtube_transcript_imports_state_check
    check (
      (status = 'processing' and last_error_code is null)
      or (status = 'failed' and last_error_code is not null)
    )
);

create unique index youtube_transcript_imports_video_unique_idx
  on public.youtube_transcript_imports (video_id);
create index youtube_transcript_imports_status_created_idx
  on public.youtube_transcript_imports (status, created_at, id);

alter table public.youtube_transcript_imports enable row level security;
revoke all on table public.youtube_transcript_imports from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.youtube_transcript_imports to service_role;

comment on table public.youtube_transcript_imports is
  'Short-lived service-only staging for asynchronous YouTube transcript acquisition. Completed transcript text is materialized into the normal private Knowledge Library artifact lifecycle and this staging row is deleted.';
