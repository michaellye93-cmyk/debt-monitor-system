-- ====================================================================
-- Production Supabase SQL Schema for Smart Collection System
-- ====================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Staff / Collectors Table
create table public.staff (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    role text not null default 'Collector',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Debtors Table
create table public.debtors (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    creditor text not null,
    total_debt numeric(12, 2) not null default 0.00,
    paid numeric(12, 2) not null default 0.00,
    phone text not null,
    address text,
    emergency_contact text,
    status text not null default 'active' check (status in ('active', 'missing', 'settled')),
    assigned_staff_id uuid references public.staff(id) on delete set null,
    delay_history text[] default array[]::text[],
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Installment Schedules Table
create table public.schedules (
    id uuid primary key default uuid_generate_v4(),
    debtor_id uuid not null references public.debtors(id) on delete cascade,
    installment_number integer not null,
    amount numeric(12, 2) not null,
    due_date date not null,
    status text not null default 'scheduled' check (status in ('scheduled', 'paid', 'overdue')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Activity Logs / Notifications Table
create table public.activity_logs (
    id uuid primary key default uuid_generate_v4(),
    text text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. System Metrics Targets Table
create table public.metrics (
    id text primary key default 'singleton',
    weekly_target numeric(12, 2) not null default 5000.00,
    weekly_recovered numeric(12, 2) not null default 0.00,
    monthly_target numeric(12, 2) not null default 20000.00,
    monthly_recovered numeric(12, 2) not null default 0.00,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ====================================================================
-- Automated Triggers & Functions
-- ====================================================================

-- Trigger function to auto-update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger on_debtor_update
    before update on public.debtors
    for each row
    execute function public.handle_updated_at();

-- ====================================================================
-- Row Level Security (RLS) Policies
-- ====================================================================

alter table public.staff enable row level security;
alter table public.debtors enable row level security;
alter table public.schedules enable row level security;
alter table public.activity_logs enable row level security;
alter table public.metrics enable row level security;

-- Allow public read/write access for demonstration setup
create policy "Allow all operations for staff" on public.staff for all using (true);
create policy "Allow all operations for debtors" on public.debtors for all using (true);
create policy "Allow all operations for schedules" on public.schedules for all using (true);
create policy "Allow all operations for activity_logs" on public.activity_logs for all using (true);
create policy "Allow all operations for metrics" on public.metrics for all using (true);

-- Insert initial Mock/Seed Data
insert into public.staff (id, name, role) values
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Agent Smith', 'Collector'),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Agent Johnson', 'Collector')
on conflict do nothing;

insert into public.metrics (id, weekly_target, weekly_recovered, monthly_target, monthly_recovered)
values ('singleton', 5000.00, 1200.00, 20000.00, 4500.00)
on conflict do nothing;
