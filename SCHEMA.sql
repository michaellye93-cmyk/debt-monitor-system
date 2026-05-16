-- LATEST SQL SCHEMA FOR DEBT MONITOR SYSTEM
-- Run this in your Supabase SQL Editor

-- 1. Create Tables

-- Staff Table
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT DEFAULT 'Collector',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Debtors Table
CREATE TABLE IF NOT EXISTS public.debtors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    creditor TEXT DEFAULT 'N/A',
    total_debt NUMERIC DEFAULT 0,
    paid NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'active', -- 'active' or 'missing'
    assigned_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    delay_history TEXT[] DEFAULT '{}',
    address TEXT,
    emergency_contact TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schedules Table
CREATE TABLE IF NOT EXISTS public.schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debtor_id UUID REFERENCES public.debtors(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    due_date DATE NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending' or 'paid'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Metrics Table (Singleton for targets)
CREATE TABLE IF NOT EXISTS public.metrics (
    id TEXT PRIMARY KEY,
    weekly_target NUMERIC DEFAULT 10000,
    monthly_target NUMERIC DEFAULT 40000,
    weekly_recovered NUMERIC DEFAULT 0,
    monthly_recovered NUMERIC DEFAULT 0
);

-- Activity Logs Table
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff;
ALTER PUBLICATION supabase_realtime ADD TABLE public.debtors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;

-- 3. Seed Singleton Metrics
INSERT INTO public.metrics (id, weekly_target, monthly_target, weekly_recovered, monthly_recovered)
VALUES ('singleton', 10000, 40000, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- 4. RLS (Row Level Security) - Basic open policy for now as requested
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON public.staff FOR ALL USING (true);
CREATE POLICY "Allow all access" ON public.debtors FOR ALL USING (true);
CREATE POLICY "Allow all access" ON public.schedules FOR ALL USING (true);
CREATE POLICY "Allow all access" ON public.metrics FOR ALL USING (true);
CREATE POLICY "Allow all access" ON public.activity_logs FOR ALL USING (true);
