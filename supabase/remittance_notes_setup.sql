-- remittance_notes: per-branch, per-period admin notes shown in email reports
create table if not exists remittance_notes (
  branch_id    text        not null,
  period_label text        not null,
  note         text        not null default '',
  updated_at   timestamptz not null default now(),
  primary key (branch_id, period_label)
);

-- Permissive RLS (matches rest of project)
alter table remittance_notes enable row level security;

create policy "allow_all_remittance_notes"
  on remittance_notes
  for all
  using (true)
  with check (true);
