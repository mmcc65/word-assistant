-- 需要 Supabase CLI 与本地 Supabase 环境后运行：supabase test db
begin;

select plan(1);
select tests.rls_enabled('public', 'user_snapshots');

select * from finish();
rollback;
