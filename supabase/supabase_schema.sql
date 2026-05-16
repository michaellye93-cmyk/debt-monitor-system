-- ==========================================
-- Debt Collection System & Gamified Economy
-- Initial Database Schema for Supabase
-- ==========================================

-- Enable the UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. TEAM & GAMIFIED ECONOMY (Antigravity Engine)
-- ==========================================

-- Team Members (Staff & Managers)
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Supabase Auth integration
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('staff', 'manager', 'admin')),
    efficiency_score NUMERIC(5,2) DEFAULT 0.00,
    total_points INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Achievements & Badges Catalog
CREATE TABLE achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    criteria JSONB NOT NULL DEFAULT '{}'::jsonb, -- Store logic triggers like {"type": "collection", "threshold": 5000}
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team Member Earned Achievements
CREATE TABLE team_member_achievements (
    team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
    achievement_id UUID REFERENCES achievements(id) ON DELETE CASCADE,
    awarded_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (team_member_id, achievement_id)
);

-- Rewards Store Catalog
CREATE TABLE rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    cost_points INTEGER NOT NULL CHECK (cost_points >= 0),
    stock INTEGER DEFAULT -1, -- -1 for infinite
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reward Redemptions (Manager Approval Workflow)
CREATE TABLE reward_redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
    reward_id UUID REFERENCES rewards(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    redeemed_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    processed_by UUID REFERENCES team_members(id) -- Manager who approved/rejected
);

-- ==========================================
-- 2. CORE DEBT COLLECTION DOMAIN
-- ==========================================

-- Creditors (The clients who want their money collected)
CREATE TABLE creditors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    contact_info TEXT,
    agreement_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Debt Cases (A block of debt given by a creditor)
CREATE TABLE debt_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creditor_id UUID REFERENCES creditors(id) ON DELETE CASCADE,
    total_debt_target NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    commission_rate NUMERIC(5,2) DEFAULT 0.00, -- e.g., 15.00 for 15%
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'suspended')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Debtors (The individuals who owe money)
CREATE TABLE debtors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID REFERENCES debt_cases(id) ON DELETE CASCADE,
    assigned_staff_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    phone_number TEXT,
    total_owed NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment Schedules (The smart queue & tracking)
CREATE TABLE payment_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    debtor_id UUID REFERENCES debtors(id) ON DELETE CASCADE,
    expected_amount NUMERIC(15,2) NOT NULL CHECK (expected_amount > 0),
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('scheduled', 'pending', 'paid', 'delayed', 'overdue')),
    points_awarded INTEGER DEFAULT 0, -- Track gamification payout for this schedule
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Interaction Logs (Call logs, postponements, whatsapp)
CREATE TABLE interaction_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    debtor_id UUID REFERENCES debtors(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
    interaction_type TEXT NOT NULL CHECK (interaction_type IN ('call', 'whatsapp', 'payment_logged', 'postponed', 'system_flag')),
    notes TEXT,
    promised_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 3. STAFF PRODUCTIVITY & TASKS
-- ==========================================

-- Tasks (Internal team tasks that aren't strict collection nodes)
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed')),
    duration_minutes INTEGER,
    base_points INTEGER DEFAULT 0,
    created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task Collaborators (Many-to-Many)
CREATE TABLE task_collaborators (
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, team_member_id)
);

-- Admin Notifications ("Red Dots")
CREATE TABLE system_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('task_update', 'reward_request', 'overdue_escalation', 'milestone_reached')),
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS on all core tables
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE debtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_logs ENABLE ROW LEVEL SECURITY;

-- Example RLS: Staff can only see debtors assigned to them, Managers can see all
CREATE POLICY "Staff can view assigned debtors" ON debtors
    FOR SELECT
    USING (
        assigned_staff_id = auth.uid() OR 
        EXISTS (SELECT 1 FROM team_members WHERE id = auth.uid() AND role IN ('manager', 'admin'))
    );

-- Example RLS: Staff can view their own schedule
CREATE POLICY "Staff can view assigned schedules" ON payment_schedules
    FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM debtors WHERE debtors.id = payment_schedules.debtor_id AND debtors.assigned_staff_id = auth.uid()) OR
        EXISTS (SELECT 1 FROM team_members WHERE id = auth.uid() AND role IN ('manager', 'admin'))
    );

-- Example RLS: Staff can see their own profile, Managers can see all profiles
CREATE POLICY "View team profiles" ON team_members
    FOR SELECT
    USING (
        id = auth.uid() OR
        EXISTS (SELECT 1 FROM team_members WHERE id = auth.uid() AND role IN ('manager', 'admin'))
    );

-- ==========================================
-- TRIGGERS & FUNCTIONS
-- ==========================================

-- Function to update the `updated_at` column automatically
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Attach update triggers
CREATE TRIGGER update_team_members_modtime BEFORE UPDATE ON team_members FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_creditors_modtime BEFORE UPDATE ON creditors FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_debtors_modtime BEFORE UPDATE ON debtors FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_payment_schedules_modtime BEFORE UPDATE ON payment_schedules FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_tasks_modtime BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
