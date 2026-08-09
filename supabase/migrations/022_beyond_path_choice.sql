alter table public.users
  add column if not exists beyond_path text;

alter table public.users
  drop constraint if exists users_beyond_path_check;

alter table public.users
  add constraint users_beyond_path_check
  check (beyond_path is null or beyond_path in ('CAELUM', 'SOREN', 'MONARCH'));

comment on column public.users.beyond_path is
  'Permanent narrative path selected when unlocking Grandmaster (Tier S).';
