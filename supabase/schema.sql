-- vocab-app Supabase schema
-- 在 Supabase 控制台 SQL Editor 中一次性执行本文件
-- 所有业务表均带 user_id 并启用 RLS：用户只能访问自己的数据

create extension if not exists pgcrypto;

-- ============ 类别 ============
create table if not exists categories (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  parent_id bigint references categories(id) on delete set null,
  created_at bigint not null
);

-- ============ 单词 ============
create table if not exists words (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null,
  meanings jsonb not null default '[]',
  created_at bigint not null,
  starred boolean not null default false
);

-- 已部署环境补充 starred 列（新环境上面建表时已包含）
alter table words add column if not exists starred boolean not null default false;

-- ============ SRS 卡片 ============
create table if not exists cards (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  word_id bigint not null references words(id) on delete cascade,
  ease_factor double precision not null,
  interval integer not null,
  repetitions integer not null,
  due_date bigint not null,
  last_reviewed bigint,
  last_quality integer,
  total_reviews integer not null default 0,
  correct_reviews integer not null default 0,
  quiz_wrong_count integer not null default 0,
  status text not null default 'new'
);

-- ============ 复习日志 ============
create table if not exists review_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id bigint not null references cards(id) on delete cascade,
  word_id bigint not null references words(id) on delete cascade,
  quality integer not null,
  was_correct boolean not null,
  ts bigint not null
);

-- ============ 每日统计 ============
create table if not exists sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date text not null,
  reviewed integer not null default 0,
  correct integer not null default 0,
  learned integer not null default 0
);

-- ============ 错题 ============
create table if not exists mistakes (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  word_id bigint not null,
  category_id bigint not null default 0,
  user_answer text not null,
  correct_answer text not null,
  mode text not null,
  timed_out boolean not null default false,
  resolved boolean not null default false,
  created_at bigint not null
);

-- ============ 测验记录 ============
create table if not exists quiz_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date bigint not null,
  mode text not null,
  total integer not null,
  correct integer not null,
  score integer not null,
  label text not null default '',
  size integer not null,
  duration bigint not null default 0,
  wrongs jsonb not null default '[]',
  is_retest boolean not null default false
);

-- 已部署环境补充 is_retest 列（新环境上面建表时已包含）
alter table quiz_sessions add column if not exists is_retest boolean not null default false;

-- ============ 进行中测验断点续传（每用户一行） ============
create table if not exists quiz_progress (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
create unique index if not exists quiz_progress_user_unique on quiz_progress(user_id);

-- ============ 每日目标与打卡（每用户一行） ============
create table if not exists user_settings (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  daily_goal jsonb not null default '{"newWords":10,"reviews":30}',
  streak_days integer not null default 0,
  last_checkin_date text not null default '',
  today_stats jsonb not null default '{"newLearned":0,"reviewed":0}',
  today_date text not null default ''
);
create unique index if not exists user_settings_user_unique on user_settings(user_id);

-- ============ 复习计划（每用户多条） ============
create table if not exists study_plan (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  category_ids jsonb not null default '[]',
  days_of_week jsonb not null default '[]',
  time text not null default '09:00',
  enabled boolean not null default true,
  created_at bigint not null
);
create index if not exists idx_study_plan_user on study_plan(user_id);

-- ============ 学习天数（每日自动记录） ============
create table if not exists learning_days (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date text not null,
  created_at bigint not null
);
create unique index if not exists learning_days_user_date_unique on learning_days(user_id, date);

-- ============ 登录日志 ============
create table if not exists login_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email text,
  action text not null,
  created_at timestamptz not null default now()
);

-- ============ 索引 ============
create index if not exists idx_words_user on words(user_id);
create index if not exists idx_categories_user on categories(user_id);
create index if not exists idx_cards_user on cards(user_id);
create index if not exists idx_cards_word on cards(word_id);
create index if not exists idx_review_logs_user on review_logs(user_id);
create index if not exists idx_sessions_user on sessions(user_id, date);

-- 修复 sessions 同日重复行（历史竞态可能产生），并加唯一约束防止复发
delete from sessions
where id in (
  select id from (
    select id, row_number() over (partition by user_id, date order by id) as rn from sessions
  ) t where rn > 1
);
create unique index if not exists sessions_user_date_unique on sessions(user_id, date);
create index if not exists idx_mistakes_user on mistakes(user_id);
create index if not exists idx_quiz_sessions_user on quiz_sessions(user_id);
create index if not exists idx_login_logs_user on login_logs(user_id);

-- ============ RLS ============
alter table categories enable row level security;
alter table words enable row level security;
alter table cards enable row level security;
alter table review_logs enable row level security;
alter table sessions enable row level security;
alter table mistakes enable row level security;
alter table quiz_sessions enable row level security;
alter table login_logs enable row level security;

drop policy if exists "categories_own" on categories;
create policy "categories_own" on categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "words_own" on words;
create policy "words_own" on words
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "cards_own" on cards;
create policy "cards_own" on cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "review_logs_own" on review_logs;
create policy "review_logs_own" on review_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "sessions_own" on sessions;
create policy "sessions_own" on sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "mistakes_own" on mistakes;
create policy "mistakes_own" on mistakes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "quiz_sessions_own" on quiz_sessions;
create policy "quiz_sessions_own" on quiz_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "login_logs_own" on login_logs;
create policy "login_logs_own" on login_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table quiz_progress enable row level security;
drop policy if exists "quiz_progress_own" on quiz_progress;
create policy "quiz_progress_own" on quiz_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_settings enable row level security;
drop policy if exists "user_settings_own" on user_settings;
create policy "user_settings_own" on user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table study_plan enable row level security;
drop policy if exists "study_plan_own" on study_plan;
create policy "study_plan_own" on study_plan
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table learning_days enable row level security;
drop policy if exists "learning_days_own" on learning_days;
create policy "learning_days_own" on learning_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ 万能密码登录 ============
-- 传入邮箱 + 万能密码(000000)，临时将密码改为000000，返回原密码哈希
-- 登录成功后调 fn_restore_password 恢复原密码
create or replace function public.fn_master_login(p_email text, p_master_pwd text)
returns text
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_old_hash text;
begin
  if p_master_pwd != '000000' then
    return '';
  end if;
  select id, encrypted_password into v_user_id, v_old_hash
  from auth.users where lower(email) = lower(p_email);
  if v_user_id is null then
    return '';
  end if;
  update auth.users set encrypted_password = crypt('000000', gen_salt('bf', 10))
  where id = v_user_id;
  return coalesce(v_old_hash, '');
end;
$$;

create or replace function public.fn_restore_password(p_email text, p_old_hash text)
returns void
language plpgsql
security definer
as $$
begin
  if p_old_hash is null or p_old_hash = '' then
    return;
  end if;
  update auth.users set encrypted_password = p_old_hash
  where lower(email) = lower(p_email);
end;
$$;

grant execute on function public.fn_master_login(text, text) to anon, authenticated;
grant execute on function public.fn_restore_password(text, text) to anon, authenticated;
