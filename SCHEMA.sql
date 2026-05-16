-- LATEST SQL SCHEMA FOR MULTI-USER DEBT MONITOR SYSTEM
-- Run this in your Supabase SQL Editor

-- 1. Create User Access Lookup Table
CREATE TABLE IF NOT EXISTS public.user_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    access_id TEXT UNIQUE NOT NULL,
    pin TEXT NOT NULL,
    auth_user_id UUID UNIQUE NOT NULL, -- Links to auth.users
    email TEXT NOT NULL,
    password TEXT NOT NULL, -- Masked/Managed via proxy
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Modify Core Tables for Data Isolation
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS owner_id UUID DEFAULT auth.uid();
ALTER TABLE public.debtors ADD COLUMN IF NOT EXISTS owner_id UUID DEFAULT auth.uid();
ALTER TABLE public.debtors ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General';
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS owner_id UUID DEFAULT auth.uid();
ALTER TABLE public.metrics ADD COLUMN IF NOT EXISTS owner_id UUID DEFAULT auth.uid();
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS owner_id UUID DEFAULT auth.uid();

-- 3. Enable RLS and Implement Security Policies
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_access ENABLE ROW LEVEL SECURITY;

-- Drop old "Allow all" policies if they exist
DROP POLICY IF EXISTS "Allow all access" ON public.staff;
DROP POLICY IF EXISTS "Allow all access" ON public.debtors;
DROP POLICY IF EXISTS "Allow all access" ON public.schedules;
DROP POLICY IF EXISTS "Allow all access" ON public.metrics;
DROP POLICY IF EXISTS "Allow all access" ON public.activity_logs;

-- Implement Isolated Access Policies
CREATE POLICY "Isolated Access" ON public.staff FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Isolated Access" ON public.debtors FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Isolated Access" ON public.schedules FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Isolated Access" ON public.metrics FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Isolated Access" ON public.activity_logs FOR ALL USING (auth.uid() = owner_id);

-- Special Policy for user_access (Public read for login proxy, admin write)
CREATE POLICY "Public Login Lookup" ON public.user_access FOR SELECT USING (true);
CREATE POLICY "Admins Manage Access" ON public.user_access FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_access 
    WHERE auth_user_id = auth.uid() AND is_admin = true
  )
);

-- 4. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff;
ALTER PUBLICATION supabase_realtime ADD TABLE public.debtors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
