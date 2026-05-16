import { useState, useMemo, useEffect } from 'react';
import { Plus, ChevronRight, ArrowLeft, Trash2, UserCircle, Filter, Download, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from './supabaseClient';
import './index.css';

const getWeekInterval = () => {
  const curr = new Date();
  const day = curr.getDay();
  const diffToMonday = curr.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(curr.setDate(diffToMonday));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${sunday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
};

interface ScheduleItem {
  id: string;
  name: string;
  amount: number;
  case: string;
  dateObj: Date;
  status: string;
}

interface Debtor {
  id: string;
  name: string;
  creditor: string;
  category: string;
  totalDebt: number;
  paid: number;
  phone: string;
  schedules?: ScheduleItem[];
  assignedStaffId?: string;
  address?: string;
  emergencyContact?: string;
  status?: 'active' | 'missing' | 'settled';
  delayHistory?: string[];
}

interface ActivityLog {
  id: string;
  text: string;
  time: string;
}

interface Staff {
  id: string;
  name: string;
  role: string;
}

export default function App() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState('dashboard');
  
  // App State
  const [queue, setQueue] = useState({ dueToday: [] as any[], overdue: [] as any[], scheduled: [] as any[] });
  const [metrics, setMetrics] = useState({ weeklyTarget: 5000, weeklyRecovered: 0, monthlyTarget: 20000, monthlyRecovered: 0 });
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
   const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Login Form State
  const [loginId, setLoginId] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [authError, setAuthError] = useState('');

  // Onboarding (Admin) State
  const [newAccessId, setNewAccessId] = useState('');
  const [newPin, setNewPin] = useState('');
  const [targetUid, setTargetUid] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [targetPassword, setTargetPassword] = useState('');

  // Profile View State
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Form states
  const [selectedDebtorId, setSelectedDebtorId] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [postponeDate, setPostponeDate] = useState<string>('');
  const [postponeItemId, setPostponeItemId] = useState<string | null>(null);
  const [postponeReason, setPostponeReason] = useState<string>('');
  const [viewDelayHistoryDebtorId, setViewDelayHistoryDebtorId] = useState<string | null>(null);
  
  // Activity / Notification State
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [hasNewActivity, setHasNewActivity] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  // Profile Edit State
  const [editTotalDebt, setEditTotalDebt] = useState<string>('');

  // Add Debtor Form State
  const [newDebtor, setNewDebtor] = useState<{name: string, creditor: string, category: string, totalDebt: string, phone: string, address: string, emergencyContact: string, status: 'active' | 'missing'}>({ name: '', creditor: '', category: '', totalDebt: '', phone: '', address: '', emergencyContact: '', status: 'active' });

  // Add Staff Form State
  const [newStaffName, setNewStaffName] = useState('');

  // Target Edit Form State
  const [editWeeklyTarget, setEditWeeklyTarget] = useState('');
  const [editMonthlyTarget, setEditMonthlyTarget] = useState('');

  // Schedule Form State
  const [scheduleFreq, setScheduleFreq] = useState('Weekly');
  const [installmentAmt, setInstallmentAmt] = useState('');
  const [startDate, setStartDate] = useState('');

  // Dashboard Filters
  const [activeStaffFilter, setActiveStaffFilter] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCreditor, setFilterCreditor] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  const handleLogin = async () => {
    setAuthError('');
    try {
      const { data, error } = await supabase
        .from('user_access')
        .select('email, password')
        .eq('access_id', loginId)
        .eq('pin', loginPin)
        .single();

      if (error || !data) throw new Error('Invalid Access ID or PIN');

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password
      });

      if (signInError) throw signInError;
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleCreateUserAccess = async () => {
    try {
      const { error } = await supabase.from('user_access').insert([{
        access_id: newAccessId,
        pin: newPin,
        auth_user_id: targetUid,
        email: targetEmail,
        password: targetPassword
      }]);
      if (error) throw error;
      window.alert('User Access created successfully!');
      setNewAccessId(''); setNewPin(''); setTargetUid(''); setTargetEmail(''); setTargetPassword('');
    } catch (err: any) {
      window.alert(`Failed to create access: ${err.message}`);
    }
  };

  const handleAddStaff = async () => {
    if (!newStaffName.trim()) return;
    try {
      const { error } = await supabase.from('staff').insert([{ name: newStaffName, role: 'Collector', owner_id: session?.user?.id }]);
      if (error) throw error;
      setNewStaffName('');
      addActivity(`Added new staff member: ${newStaffName}`);
      fetchData();
    } catch (err: any) {
      console.error('Error adding staff:', err);
      window.alert(`Failed to add staff: ${err.message || 'Unknown error'}`);
    }
  };

  // Derived Metrics (Calculated from Debtors & Schedules)
  const { 
    weeklyTarget, 
    weeklyRecovered, 
    monthlyTarget, 
    monthlyRecovered,
    totalSystemDebt,
    totalSystemPaid,
    systemProgress
  } = useMemo(() => {
    const now = new Date();
    // Week start (Monday)
    const startOfWeek = new Date(now);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0,0,0,0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23,59,59,999);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Extract all schedules from all debtors
    const allSchedules = debtors.flatMap(d => (d.schedules || []).map(s => ({
      ...s,
      amount: Number(s.amount),
      dateObj: new Date(s.dateObj)
    })));

    const wT = allSchedules.filter(s => s.dateObj >= startOfWeek && s.dateObj <= endOfWeek)
      .reduce((sum, s) => sum + s.amount, 0);

    const wR = allSchedules.filter(s => s.dateObj >= startOfWeek && s.dateObj <= endOfWeek && s.status === 'paid')
      .reduce((sum, s) => sum + s.amount, 0);

    const mT = allSchedules.filter(s => s.dateObj >= startOfMonth && s.dateObj <= endOfMonth)
      .reduce((sum, s) => sum + s.amount, 0);

    const mR = allSchedules.filter(s => s.dateObj >= startOfMonth && s.dateObj <= endOfMonth && s.status === 'paid')
      .reduce((sum, s) => sum + s.amount, 0);

    const tDebt = debtors.reduce((sum, d) => sum + (Number(d.totalDebt) || 0), 0);
    const tPaid = debtors.reduce((sum, d) => sum + (Number(d.paid) || 0), 0);
    const sProg = tDebt > 0 ? (tPaid / tDebt) * 100 : 0;

    return { 
      weeklyTarget: wT, 
      weeklyRecovered: wR, 
      monthlyTarget: mT, 
      monthlyRecovered: mR,
      totalSystemDebt: tDebt,
      totalSystemPaid: tPaid,
      systemProgress: sProg
    };
  }, [debtors]);

  const handleDeleteStaff = async (staffId: string, staffName: string) => {
    if (!window.confirm(`Are you sure you want to remove ${staffName}?`)) return;
    try {
      const { error } = await supabase.from('staff').delete().eq('id', staffId);
      if (error) throw error;
      addActivity(`Removed staff member: ${staffName}`);
      fetchData();
    } catch (err: any) {
      console.error('Error deleting staff:', err);
      window.alert(`Failed to delete staff: ${err.message || 'Unknown error'}`);
    }
  };

  const updateDebtorField = async (id: string, updates: any) => {
    try {
      const { error } = await supabase.from('debtors').update(updates).eq('id', id);
      if (error) throw error;
    } catch (err: any) {
      console.error('Error updating debtor:', err);
      window.alert(`Failed to update debtor: ${err.message || 'Unknown error'}`);
    }
  };

  // Supabase Data Fetching & Subscriptions
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session) fetchData();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchData();
      } else {
        setDebtors([]);
        setStaffList([]);
        setQueue({ dueToday: [], overdue: [], scheduled: [] });
      }
    });

    fetchData();

    // Supabase Realtime Subscriptions
    const staffSub = supabase.channel('staff_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, fetchData).subscribe();
    const debtorsSub = supabase.channel('debtors_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'debtors' }, fetchData).subscribe();
    const schedulesSub = supabase.channel('schedules_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, fetchData).subscribe();
    const metricsSub = supabase.channel('metrics_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'metrics' }, fetchData).subscribe();
    const logsSub = supabase.channel('logs_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => {
        fetchData();
        setHasNewActivity(true);
    }).subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(staffSub);
      supabase.removeChannel(debtorsSub);
      supabase.removeChannel(schedulesSub);
      supabase.removeChannel(metricsSub);
      supabase.removeChannel(logsSub);
    };
  }, []);

  const rebuildQueue = (allSchedules: any[], allDebtors: any[]) => {
      const today = new Date();
      today.setHours(0,0,0,0);
      
      const newQueue = { dueToday: [] as any[], overdue: [] as any[], scheduled: [] as any[] };
      
      allSchedules.forEach(sch => {
         const debtor = allDebtors.find(d => d.id === sch.debtor_id);
         if (!debtor || debtor.status === 'settled') return;

         const schDate = new Date(sch.due_date);
         schDate.setHours(0,0,0,0);
         const timeDiff = schDate.getTime() - today.getTime();
         const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
         
         const dateISO = new Date(schDate.getTime() - (schDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
         const formattedDate = `${schDate.getDate()} ${schDate.toLocaleString('default', { month: 'short' }).toUpperCase()}`;

         const item = {
             id: sch.id,
             debtorId: debtor.id,
             name: debtor.name,
             amount: Number(sch.amount),
             status: sch.status,
             case: debtor.creditor,
             dateISO: dateISO,
             date: formattedDate,
             time: 'Pending',
             daysOverdue: Math.abs(daysDiff)
         };

         if (daysDiff < 0 || sch.status === 'overdue') {
            item.status = 'overdue';
            newQueue.overdue.push(item);
         } else if (daysDiff === 0) {
            item.status = 'pending';
            newQueue.dueToday.push(item);
         } else {
            item.status = 'scheduled';
            newQueue.scheduled.push(item);
         }
      });
      setQueue(newQueue);
  };

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [staffRes, debtorsRes, schedulesRes, metricsRes, logsRes, profileRes] = await Promise.all([
        supabase.from('staff').select('*'),
        supabase.from('debtors').select('*'),
        supabase.from('schedules').select('*').neq('status', 'paid'),
        supabase.from('metrics').select('*').limit(1).maybeSingle(),
        supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('user_access').select('is_admin').eq('auth_user_id', user.id).maybeSingle()
      ]);

      if (profileRes.data) setIsAdmin(profileRes.data.is_admin);
      if (staffRes.data) setStaffList(staffRes.data);
      if (debtorsRes.data) {
         const formattedDebtors = debtorsRes.data.map(d => ({
             ...d,
             totalDebt: Number(d.total_debt),
             paid: Number(d.paid),
             category: d.category || 'General',
             assignedStaffId: d.assigned_staff_id,
             emergencyContact: d.emergency_contact,
             delayHistory: d.delay_history || [],
             schedules: schedulesRes.data?.filter(s => s.debtor_id === d.id).map(s => ({
                 id: s.id, name: d.name, amount: Number(s.amount), case: d.creditor, dateObj: new Date(s.due_date), status: s.status
             })) || []
         }));
         setDebtors(formattedDebtors);
      }
      
      if (metricsRes.data) {
        setMetrics({
           weeklyTarget: Number(metricsRes.data.weekly_target),
           weeklyRecovered: Number(metricsRes.data.weekly_recovered),
           monthlyTarget: Number(metricsRes.data.monthly_target),
           monthlyRecovered: Number(metricsRes.data.monthly_recovered)
        });
      } else {
        const { data: newMetrics } = await supabase.from('metrics').insert([{
          id: 'singleton',
          owner_id: user.id,
          weekly_target: 5000,
          monthly_target: 20000,
          weekly_recovered: 0,
          monthly_recovered: 0
        }]).select().single();
        
        if (newMetrics) {
          setMetrics({
            weeklyTarget: Number(newMetrics.weekly_target),
            weeklyRecovered: 0,
            monthlyTarget: Number(newMetrics.monthly_target),
            monthlyRecovered: 0
          });
        }
      }
      
      if (logsRes.data) {
        setActivities(logsRes.data.map(log => ({ 
            id: log.id, 
            text: log.text, 
            time: new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        })));
      }

      if (schedulesRes.data && debtorsRes.data) {
         rebuildQueue(schedulesRes.data, debtorsRes.data);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  const addActivity = async (text: string) => {
      await supabase.from('activity_logs').insert([{ text, owner_id: session?.user?.id }]);
  };

  const availableCategories = useMemo(() => {
    const cats = debtors.map(d => d.category).filter(Boolean);
    return Array.from(new Set(cats)).sort();
  }, [debtors]);

  const availableCreditors = useMemo(() => {
    const creds = debtors.map(d => d.creditor).filter(Boolean);
    return Array.from(new Set(creds)).sort();
  }, [debtors]);

  const handleExportExcel = () => {
    const exportData = debtors.map(d => ({
      Name: d.name,
      Creditor: d.creditor,
      Category: d.category,
      'Total Debt': d.totalDebt,
      Paid: d.paid,
      Phone: d.phone,
      Address: d.address,
      'Emergency Contact': d.emergencyContact,
      Status: d.status
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Debtors");
    XLSX.writeFile(wb, "Debt_Portfolio_Export.xlsx");
    addActivity("Exported debtor portfolio to Excel.");
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const batch = data.map(item => ({
          name: item.Name || item.name,
          creditor: item.Creditor || item.creditor || 'N/A',
          category: item.Category || item.category || 'General',
          total_debt: parseFloat(item['Total Debt'] || item.total_debt) || 0,
          paid: parseFloat(item.Paid || item.paid) || 0,
          phone: item.Phone || item.phone || 'N/A',
          address: item.Address || item.address || '',
          emergency_contact: item['Emergency Contact'] || item.emergency_contact || '',
          status: (item.Status || item.status || 'active').toLowerCase(),
          owner_id: session?.user?.id
        }));

        const { error } = await supabase.from('debtors').insert(batch);
        if (error) throw error;

        addActivity(`Imported ${batch.length} debtors from Excel.`);
        fetchData();
        window.alert(`Successfully imported ${batch.length} debtors.`);
      } catch (err: any) {
        console.error("Import failed:", err);
        window.alert("Import failed. Please check the Excel format.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const allActionableDebtors = useMemo(() => {
    return [
      ...queue.overdue.map(d => ({ ...d, list: 'overdue' })),
      ...queue.dueToday.map(d => ({ ...d, list: 'dueToday' })),
      ...queue.scheduled.map(d => ({ ...d, list: 'scheduled' }))
    ];
  }, [queue]);

  const handleOpenPayment = (queueItemId?: string) => {
    if (queueItemId) {
      const item = allActionableDebtors.find(d => d.id === queueItemId);
      if (item) {
        setSelectedDebtorId(item.debtorId);
        setPaymentAmount(item.amount.toString());
      }
    } else {
      const activeDebtors = debtors.filter(d => (d.totalDebt - d.paid) > 0);
      if (activeDebtors.length > 0) setSelectedDebtorId(activeDebtors[0].id);
      setPaymentAmount('');
    }
    setActiveModal('payment');
  };

  const handleOpenPostpone = (queueItemId?: string) => {
    if (queueItemId) {
      const item = allActionableDebtors.find(d => d.id === queueItemId);
      if (item) setSelectedDebtorId(item.debtorId);
      setPostponeItemId(queueItemId);
    } else {
      const activeDebtors = debtors.filter(d => (d.totalDebt - d.paid) > 0);
      if (activeDebtors.length > 0) setSelectedDebtorId(activeDebtors[0].id);
      setPostponeItemId(null);
    }
    setPostponeDate('');
    setPostponeReason('');
    setActiveModal('postpone');
  };

  const handleConfirmPayment = async () => {
    const amount = parseFloat(paymentAmount) || 0;
    if (amount <= 0 || !selectedDebtorId) return;
    
    const debtor = debtors.find(d => d.id === selectedDebtorId);
    if (!debtor) return;

    await supabase.from('debtors').update({ paid: debtor.paid + amount }).eq('id', selectedDebtorId);
    
    await supabase.from('metrics').update({
        weekly_recovered: metrics.weeklyRecovered + amount,
        monthly_recovered: metrics.monthlyRecovered + amount
    }).eq('id', 'singleton');

    let remaining = amount;
    const debtorSchedules = debtor.schedules?.sort((a,b) => a.dateObj.getTime() - b.dateObj.getTime()) || [];
    
    for (const sch of debtorSchedules) {
        if (remaining <= 0) break;
        if (remaining >= sch.amount) {
            remaining -= sch.amount;
            await supabase.from('schedules').update({ status: 'paid' }).eq('id', sch.id);
        } else {
            await supabase.from('schedules').update({ amount: sch.amount - remaining }).eq('id', sch.id);
            remaining = 0;
        }
    }

    addActivity(`Payment of RM${amount.toLocaleString()} recorded for ${debtor.name}.`);
    setActiveModal(null);
    fetchData();
  };

  const handleConfirmPostpone = async () => {
    if (!selectedDebtorId || !postponeDate) return;
    const debtor = debtors.find(d => d.id === selectedDebtorId);
    if (!debtor) return;

    const reasonText = postponeReason.trim() || `Postponed to ${postponeDate}`;
    await supabase.from('debtors').update({
        delay_history: [...(debtor.delayHistory || []), reasonText]
    }).eq('id', selectedDebtorId);

    if (postponeItemId) {
        await supabase.from('schedules').update({ due_date: postponeDate }).eq('id', postponeItemId);
    } else {
        const actionable = allActionableDebtors.filter(d => d.debtorId === selectedDebtorId);
        for (const item of actionable) {
            await supabase.from('schedules').update({ due_date: postponeDate }).eq('id', item.id);
        }
    }

    addActivity(`Follow-up for ${debtor.name} rescheduled to ${postponeDate}.`);
    setActiveModal(null);
    fetchData();
  };

  const handleAddDebtor = async () => {
    if (!newDebtor.name || !newDebtor.totalDebt) return;
    
    await supabase.from('debtors').insert([{
        name: newDebtor.name,
        creditor: newDebtor.creditor || 'N/A',
        category: newDebtor.category || 'General',
        total_debt: parseFloat(newDebtor.totalDebt) || 0,
        paid: 0,
        phone: newDebtor.phone || 'N/A',
        address: newDebtor.address,
        emergency_contact: newDebtor.emergencyContact,
        status: newDebtor.status,
        owner_id: session?.user?.id
    }]);

    addActivity(`New debtor profile created for ${newDebtor.name}.`);
    setNewDebtor({ name: '', creditor: '', category: '', totalDebt: '', phone: '', address: '', emergencyContact: '', status: 'active' });
    setActiveModal(null);
    fetchData();
  };

  const handleDeleteDebtor = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this debtor profile?")) {
      await supabase.from('debtors').delete().eq('id', id);
      setSelectedProfileId(null);
      fetchData();
    }
  };

  const handleGenerateSchedule = async () => {
    const debtor = debtors.find(d => d.id === selectedProfileId);
    if (!debtor || !installmentAmt || !startDate) return;

    const instAmt = parseFloat(installmentAmt);
    let balance = debtor.totalDebt - debtor.paid;
    if (balance <= 0) return;

    let currentDate = new Date(startDate);
    let installNum = 1;
    const inserts = [];

    while (balance > 0) {
      const amount = Math.min(balance, instAmt);
      inserts.push({
          debtor_id: debtor.id,
          installment_number: installNum++,
          amount: amount,
          due_date: new Date(currentDate).toISOString().split('T')[0],
          status: 'scheduled',
          owner_id: session?.user?.id
      });
      balance -= amount;

      if (scheduleFreq === 'Daily') currentDate.setDate(currentDate.getDate() + 1);
      else if (scheduleFreq === 'Weekly') currentDate.setDate(currentDate.getDate() + 7);
      else if (scheduleFreq === 'Bi-Weekly') currentDate.setDate(currentDate.getDate() + 14);
      else if (scheduleFreq === 'Monthly') currentDate.setMonth(currentDate.getMonth() + 1);
    }

    await supabase.from('schedules').insert(inserts);
    addActivity(`Payment schedule generated for ${debtor.name} (${inserts.length} installments).`);
    setInstallmentAmt('');
    setStartDate('');
    fetchData();
  };

  const getStaffNameForDebtor = (debtorId: string) => {
    const debtor = debtors.find(d => d.id === debtorId);
    if (!debtor || !debtor.assignedStaffId) return null;
    const staff = staffList.find(s => s.id === debtor.assignedStaffId);
    return staff ? staff.name : null;
  };

  const renderStaffBadge = (debtorId: string) => {
    const staffName = getStaffNameForDebtor(debtorId);
    if (!staffName) return <span className="badge" style={{ background: 'var(--bg-surface-hover)', color: 'var(--text-secondary)' }}>Unassigned</span>;
    return <span className="badge" style={{ background: 'var(--border-color)', color: 'var(--text-primary)' }}><UserCircle size={12} style={{ marginRight: '4px' }} />{staffName}</span>;
  };

  // const goalProgress = Math.min(100, Math.round((metrics.recovered / metrics.target) * 100));

  const renderDashboard = () => {
    
    // Filtering Logic
    const seenDebtors = new Set();

    const getFilteredQueue = (list: any[]) => {
      // Sort list by dateISO to ensure we pick the earliest chronological item
      let sorted = [...list].sort((a, b) => {
         if (a.dateISO && b.dateISO) {
           return new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime();
         }
         return 0;
      });

      return sorted.filter(item => {
        if (activeStaffFilter !== 'all') {
          const debtor = debtors.find(d => d.id === item.debtorId);
          if (activeStaffFilter === 'unassigned') {
            if (debtor?.assignedStaffId) return false;
          } else {
            if (debtor?.assignedStaffId !== activeStaffFilter) return false;
          }
        }
        
        // Prevent overwhelming the screen: Only show the most urgent 1 card per debtor
        if (seenDebtors.has(item.debtorId)) return false;
        seenDebtors.add(item.debtorId);
        return true;
      });
    };

    // Priority 1: Overdue
    const filteredOverdue = getFilteredQueue(queue.overdue);
    // Priority 2: Due Today
    const filteredDueToday = getFilteredQueue(queue.dueToday);
    // Priority 3: Upcoming Scheduled
    const filteredScheduled = getFilteredQueue(queue.scheduled);


    return (
      <div className="max-w-container-max mx-auto space-y-8">
        {/* Staff View Filter */}
        <div className="flex items-center gap-3 pb-4 mb-2 overflow-x-auto border-b border-outline-variant">
          <div className="flex items-center gap-1.5 text-on-surface-variant text-sm font-medium pr-2 border-r border-outline-variant">
            <Filter size={14} /> Active View
          </div>
          <button 
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${activeStaffFilter === 'all' ? 'bg-primary text-on-primary' : 'bg-surface text-primary border border-outline-variant hover:bg-surface-container-low'}`}
            onClick={() => setActiveStaffFilter('all')}
          >
            All Accounts
          </button>
          <button 
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${activeStaffFilter === 'unassigned' ? 'bg-primary text-on-primary' : 'bg-surface text-primary border border-outline-variant hover:bg-surface-container-low'}`}
            onClick={() => setActiveStaffFilter('unassigned')}
          >
            Unassigned
          </button>
          {staffList.map(staff => (
            <button 
              key={staff.id}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${activeStaffFilter === staff.id ? 'bg-primary text-on-primary' : 'bg-surface text-primary border border-outline-variant hover:bg-surface-container-low'}`}
              onClick={() => setActiveStaffFilter(staff.id)}
            >
              {staff.name}
            </button>
          ))}
        </div>

        {/* Performance Goals */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-surface rounded-xl border border-outline-variant p-6 relative">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-primary">Weekly Target</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">Mon-Sun ({getWeekInterval()})</p>
              </div>
              <button className="text-primary hover:bg-surface-container p-1 rounded transition-colors" onClick={() => setActiveModal('editTargets')}>
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
            </div>
            
            <div className="flex justify-between items-end mb-2">
              <span className="font-headline-lg text-headline-lg text-primary"><span className="text-sm text-on-surface-variant mr-1">RM</span>{weeklyRecovered.toLocaleString()}</span>
              <span className="font-body-md text-body-md text-on-surface-variant mb-1">/ RM{weeklyTarget.toLocaleString()}</span>
            </div>
            <div className="w-full bg-surface-container-high rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${weeklyTarget > 0 ? Math.min(100, (weeklyRecovered / weeklyTarget) * 100) : 0}%` }}></div>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-outline-variant p-6 relative">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-primary">Monthly Target</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
              </div>
              <button className="text-primary hover:bg-surface-container p-1 rounded transition-colors" onClick={() => setActiveModal('editTargets')}>
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
            </div>
            
            <div className="flex justify-between items-end mb-2">
              <span className="font-headline-lg text-headline-lg text-primary"><span className="text-sm text-on-surface-variant mr-1">RM</span>{monthlyRecovered.toLocaleString()}</span>
              <span className="font-body-md text-body-md text-on-surface-variant mb-1">/ RM{monthlyTarget.toLocaleString()}</span>
            </div>
            <div className="w-full bg-surface-container-high rounded-full h-2">
              <div className="bg-secondary h-2 rounded-full transition-all duration-500" style={{ width: `${monthlyTarget > 0 ? Math.min(100, (monthlyRecovered / monthlyTarget) * 100) : 0}%` }}></div>
            </div>
          </div>
        </section>

        {/* Priority Action Center */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface rounded-xl border border-outline-variant p-6 relative overflow-hidden flex flex-col justify-between h-32 group hover:bg-surface-container-lowest transition-colors cursor-pointer" onClick={() => document.getElementById('section-due-today')?.scrollIntoView({ behavior: 'smooth' })}>
            <div className="absolute top-0 left-0 w-1.5 h-full bg-status-pending"></div>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-status-pending mb-1">Must Collect Today</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">Due today</p>
              </div>
              <span className="font-headline-lg text-headline-lg text-status-pending">{filteredDueToday.length}</span>
            </div>
            <div className="flex justify-end">
              <button className="text-status-pending font-label-md text-label-md flex items-center gap-1 hover:underline" onClick={(e) => { e.stopPropagation(); handleOpenPayment(); }}>
                Log Payment <span className="material-symbols-outlined text-sm">payments</span>
              </button>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-outline-variant p-6 relative overflow-hidden flex flex-col justify-between h-32 group hover:bg-surface-container-lowest transition-colors cursor-pointer" onClick={() => document.getElementById('section-upcoming-due')?.scrollIntoView({ behavior: 'smooth' })}>
            <div className="absolute top-0 left-0 w-1.5 h-full bg-secondary"></div>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-secondary mb-1">Upcoming Due</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">Tomorrow & later</p>
              </div>
              <span className="font-headline-lg text-headline-lg text-secondary">{filteredScheduled.length}</span>
            </div>
            <div className="flex justify-end">
              <span className="text-secondary font-label-md text-label-md flex items-center gap-1">
                Early reminder <span className="material-symbols-outlined text-sm">notifications</span>
              </span>
            </div>
          </div>
          
          <div className="bg-surface rounded-xl border border-outline-variant p-6 relative overflow-hidden flex flex-col justify-between h-32 group hover:bg-surface-container-lowest transition-colors cursor-pointer" onClick={() => document.getElementById('section-overdue')?.scrollIntoView({ behavior: 'smooth' })}>
            <div className="absolute top-0 left-0 w-1.5 h-full bg-status-overdue"></div>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-status-overdue mb-1">Overdue</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">No update yet</p>
              </div>
              <span className="font-headline-lg text-headline-lg text-status-overdue">{filteredOverdue.length}</span>
            </div>
            <div className="flex justify-end">
              <button className="text-status-overdue font-label-md text-label-md flex items-center gap-1 hover:underline" onClick={(e) => { e.stopPropagation(); handleOpenPostpone(); }}>
                Reschedule <span className="material-symbols-outlined text-sm">calendar_today</span>
              </button>
            </div>
          </div>
        </section>

        {/* Daily Action List */}
        <section>
          <div className="flex justify-between items-end mb-4 border-b border-outline-variant pb-2 mt-8">
            <h2 className="font-headline-sm text-headline-sm text-primary">Queue Details</h2>
          </div>
          <div className="space-y-8">
            
            {filteredOverdue.length === 0 && filteredDueToday.length === 0 && filteredScheduled.length === 0 && (
              <div className="p-8 text-center text-on-surface-variant border border-outline-variant border-dashed rounded-xl">
                No active items in the queue.
              </div>
            )}

            {filteredDueToday.length > 0 && (
              <div className="space-y-4">
                <h3 id="section-due-today" className="font-headline-sm text-status-pending flex items-center gap-2"><span className="material-symbols-outlined">today</span> Must Collect Today</h3>
                {filteredDueToday.map(item => (
                  <article key={item.id} className="bg-surface rounded-xl border border-outline-variant shadow-sm relative overflow-hidden hover:border-secondary transition-colors">
                    <div className="absolute top-0 left-0 w-1 h-full bg-status-pending"></div>
                    <div className="p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-headline-sm text-headline-sm text-primary">{item.name}</h3>
                          {activeStaffFilter === 'all' && renderStaffBadge(item.debtorId)}
                        </div>
                        <p className="font-label-md text-label-md text-on-surface-variant">Time: {item.time}</p>
                      </div>
                      <div className="flex-1 md:text-right">
                        <p className="font-label-md text-label-md text-on-surface-variant mb-1">Scheduled Amount</p>
                        <p className="font-headline-md text-headline-md text-primary"><span className="text-on-surface-variant text-sm mr-1">RM</span>{item.amount.toLocaleString()}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2 w-full md:w-auto mt-4 md:mt-0">
                        <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 border border-outline-variant text-primary rounded-lg font-label-md text-label-md hover:bg-surface-container transition-colors" onClick={() => handleOpenPostpone(item.id)}>
                          Reason for Delay
                        </button>
                        <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg font-label-md text-label-md hover:bg-secondary-container transition-colors" onClick={() => handleOpenPayment(item.id)}>
                          Record Payment
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {filteredScheduled.length > 0 && (
              <div className="space-y-4">
                <h3 id="section-upcoming-due" className="font-headline-sm text-secondary flex items-center gap-2"><span className="material-symbols-outlined">event</span> Upcoming Due</h3>
                {filteredScheduled.map(item => {
                  const debtor = debtors.find(d => d.id === item.debtorId);
                  const delaysCount = debtor?.delayHistory?.length || 0;
                  return (
                  <article key={item.id} className="bg-surface rounded-xl border border-outline-variant shadow-sm relative overflow-hidden hover:border-secondary transition-colors opacity-80">
                    <div className="p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-headline-sm text-headline-sm text-primary">{item.name}</h3>
                          <span className="bg-surface-container text-on-surface-variant px-2 py-0.5 rounded font-status-pill text-status-pill tracking-wider uppercase">Due {item.date}</span>
                          {activeStaffFilter === 'all' && renderStaffBadge(item.debtorId)}
                          {delaysCount > 0 && debtor && (
                            <button 
                              onClick={() => setViewDelayHistoryDebtorId(debtor.id)}
                              className="text-black font-extrabold text-xs bg-[#facc15] px-2.5 py-0.5 rounded shadow-sm hover:bg-[#eab308] transition-colors cursor-pointer"
                              title="Click to view reasons for delay"
                            >
                              ({delaysCount})
                            </button>
                          )}
                        </div>
                        <p className="font-label-md text-label-md text-on-surface-variant">Scheduled Follow-up</p>
                      </div>
                      <div className="flex-1 md:text-right">
                        <p className="font-label-md text-label-md text-on-surface-variant mb-1">Scheduled Amount</p>
                        <p className="font-headline-md text-headline-md text-primary"><span className="text-on-surface-variant text-sm mr-1">RM</span>{item.amount.toLocaleString()}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2 w-full md:w-auto mt-4 md:mt-0">
                        <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#25D366] text-white rounded-lg font-label-md text-label-md hover:bg-[#128C7E] transition-colors" onClick={() => window.open(`https://wa.me/?text=Hi%20${encodeURIComponent(item.name)},%20this%20is%20an%20early%20reminder%20for%20your%20upcoming%20payment%20of%20RM${item.amount}.`, '_blank')}>
                          <span className="material-symbols-outlined text-[18px]">chat</span> Early Reminder
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
              </div>
            )}

            {filteredOverdue.length > 0 && (
              <div className="space-y-4">
                <h3 id="section-overdue" className="font-headline-sm text-status-overdue flex items-center gap-2"><span className="material-symbols-outlined">warning</span> Overdue (No Update)</h3>
                {filteredOverdue.map(item => (
                  <article key={item.id} className="bg-surface rounded-xl border border-outline-variant shadow-sm relative overflow-hidden hover:border-secondary transition-colors">
                    <div className="absolute top-0 left-0 w-1 h-full bg-status-overdue"></div>
                    <div className="p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-headline-sm text-headline-sm text-primary">{item.name}</h3>
                          <span className="bg-status-overdue text-white px-2 py-0.5 rounded font-status-pill text-status-pill tracking-wider uppercase">Overdue {item.daysOverdue}d</span>
                          {activeStaffFilter === 'all' && renderStaffBadge(item.debtorId)}
                        </div>
                        <p className="font-label-md text-label-md text-on-surface-variant">Creditor: {item.case}</p>
                      </div>
                      <div className="flex-1 md:text-right">
                        <p className="font-label-md text-label-md text-on-surface-variant mb-1">Scheduled Amount</p>
                        <p className="font-headline-md text-headline-md text-primary"><span className="text-on-surface-variant text-sm mr-1">RM</span>{item.amount.toLocaleString()}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2 w-full md:w-auto mt-4 md:mt-0">
                        <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 border border-outline-variant text-primary rounded-lg font-label-md text-label-md hover:bg-surface-container transition-colors" onClick={() => handleOpenPostpone(item.id)}>
                          Reschedule
                        </button>
                        <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg font-label-md text-label-md hover:bg-secondary-container transition-colors" onClick={() => handleOpenPayment(item.id)}>
                          Record Payment
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

          </div>
        </section>
      </div>
    );
  }

  const renderProfiles = () => {
    if (selectedProfileId) {
      const debtor = debtors.find(d => d.id === selectedProfileId);
      if (!debtor) return null;
      
      const progress = Math.min(100, Math.round((debtor.paid / debtor.totalDebt) * 100));
      const remaining = debtor.totalDebt - debtor.paid;

      return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <button 
            className="btn btn-outline btn-sm" 
            style={{ marginBottom: '24px', border: 'none', padding: '0' }}
            onClick={() => setSelectedProfileId(null)}
          >
            <ArrowLeft size={16} /> Back to Directory
          </button>
          
          <div className="card">
            <div className="card-header" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                  <h2 style={{ fontSize: '1.5rem', margin: 0 }}>{debtor.name}</h2>
                  <select 
                    style={{ 
                      padding: '4px 8px', 
                      borderRadius: '4px', 
                      border: `1px solid ${debtor.status === 'missing' ? 'var(--danger)' : 'var(--success)'}`,
                      backgroundColor: `${debtor.status === 'missing' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)'}`,
                      color: `${debtor.status === 'missing' ? 'var(--danger)' : 'var(--success)'}`,
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                    value={debtor.status || 'active'}
                    onChange={async (e) => {
                      const newStatus = e.target.value as 'active' | 'missing';
                      await updateDebtorField(debtor.id, { status: newStatus });
                    }}
                  >
                    <option value="active">Active</option>
                    <option value="missing">Missing</option>
                  </select>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Creditor: {debtor.creditor} • {debtor.phone}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.875rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Address</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      style={{ padding: '6px 10px', fontSize: '0.875rem' }} 
                      value={debtor.address || ''} 
                      onChange={e => updateDebtorField(debtor.id, { address: e.target.value })}
                      placeholder="Enter address"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Emergency Contact</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      style={{ padding: '6px 10px', fontSize: '0.875rem' }} 
                      value={debtor.emergencyContact || ''} 
                      onChange={e => updateDebtorField(debtor.id, { emergency_contact: e.target.value })}
                      placeholder="Emergency contact"
                    />
                  </div>
                </div>
              </div>
              <button 
                className="btn btn-outline" 
                style={{ color: 'var(--danger)', borderColor: 'var(--danger)', padding: '6px 12px' }}
                onClick={() => handleDeleteDebtor(debtor.id)}
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>
            
            <div className="card-body" style={{ padding: '32px 24px' }}>
              
              {/* Staff Assignment */}
              <div style={{ marginBottom: '32px', paddingBottom: '32px', borderBottom: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>Account Assignment</h3>
                <div className="form-group" style={{ maxWidth: '300px' }}>
                  <label className="form-label">Handling Staff</label>
                  <select 
                    className="form-select"
                    value={debtor.assignedStaffId || ''}
                    onChange={async (e) => {
                      const newStaffId = e.target.value || null;
                      await updateDebtorField(debtor.id, { assigned_staff_id: newStaffId });
                    }}
                  >
                    <option value="">-- Unassigned --</option>
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px' }}>
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Collection Progress</p>
                    <p style={{ fontSize: '2rem', fontWeight: 700 }}>RM{debtor.paid.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>/ RM{debtor.totalDebt.toLocaleString()}</span></p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Remaining Debt</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--danger)' }}>RM{remaining.toLocaleString()}</p>
                  </div>
                </div>
                
                <div style={{ height: '12px', background: 'var(--bg-surface-hover)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: progress === 100 ? 'var(--success)' : 'var(--accent)', transition: 'width 0.5s ease-out' }}></div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '32px' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>Log Collection</h3>
                  <div className="form-group">
                    <label className="form-label">Amount Paid (RM)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value)}
                      placeholder="e.g. 500"
                    />
                  </div>
                  <button 
                    className="btn btn-primary" 
                    style={{ width: '100%' }}
                    onClick={() => {
                      const amount = parseFloat(paymentAmount);
                      if (amount > 0) {
                        setSelectedDebtorId(debtor.id);
                        handleConfirmPayment();
                        setPaymentAmount('');
                      }
                    }}
                  >
                    Record Payment
                  </button>
                </div>
                
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>Edit Initial Debt</h3>
                  <div className="form-group">
                    <label className="form-label">Total Debt Amount (RM)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={editTotalDebt}
                      onChange={e => setEditTotalDebt(e.target.value)}
                      placeholder={debtor.totalDebt.toString()}
                    />
                  </div>
                  <button 
                    className="btn btn-outline" 
                    style={{ width: '100%' }}
                    onClick={async () => {
                      const newTotal = parseFloat(editTotalDebt);
                      if (newTotal > 0) {
                        await updateDebtorField(debtor.id, { total_debt: newTotal });
                        setEditTotalDebt('');
                      }
                    }}
                  >
                    Update Debt Amount
                  </button>
                </div>
              </div>

              {/* Payment Schedule Setup */}
              <div style={{ marginTop: '32px', borderTop: '1px solid var(--border-color)', paddingTop: '32px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>Setup Payment Schedule</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Frequency</label>
                    <select className="form-select" value={scheduleFreq} onChange={e => setScheduleFreq(e.target.value)}>
                      <option>Daily</option>
                      <option>Weekly</option>
                      <option>Bi-Weekly</option>
                      <option>Monthly</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Installment Amt (RM)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={installmentAmt} 
                      onChange={e => setInstallmentAmt(e.target.value)} 
                      placeholder="e.g. 250" 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Start Date</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={startDate} 
                      onChange={e => setStartDate(e.target.value)} 
                    />
                  </div>
                </div>
                <button 
                  className="btn btn-primary" 
                  onClick={handleGenerateSchedule} 
                  disabled={!installmentAmt || !startDate || remaining <= 0}
                  style={{ width: '100%' }}
                >
                  Generate Schedule & Push to Dashboard
                </button>
              </div>

              {/* Display Generated Schedule */}
              {debtor.schedules && debtor.schedules.length > 0 && (
                <div style={{ marginTop: '32px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px' }}>Active Schedule ({debtor.schedules.length} Installments)</h3>
                  <div className="list-group" style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)' }}>
                    {debtor.schedules.map((sch, idx) => (
                      <div key={sch.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
                        <span>Installment #{idx + 1} ({new Date(sch.dateObj).toLocaleDateString()})</span>
                        <span style={{ fontWeight: 600 }}>RM{sch.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      );
    }

    const filteredDebtors = useMemo(() => {
      return debtors.filter(d => {
        const matchStatus = filterStatus === 'all' || d.status === filterStatus;
        const matchCreditor = filterCreditor === 'all' || d.creditor === filterCreditor;
        const matchCategory = filterCategory === 'all' || d.category === filterCategory;
        return matchStatus && matchCreditor && matchCategory;
      });
    }, [debtors, filterStatus, filterCreditor, filterCategory]);

    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Debtor Directory</h2>
            <p className="subtitle">Manage profiles and track individual collection progress.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label className="btn btn-outline" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Upload size={16} /> Import Excel
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleImportExcel} style={{ display: 'none' }} />
            </label>
            <button className="btn btn-outline" onClick={handleExportExcel} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Download size={16} /> Export Excel
            </button>
            <button className="btn btn-primary" onClick={() => setActiveModal('addDebtor')}>
              <Plus size={16} /> Add Debtor
            </button>
          </div>
        </header>

        {/* Filters */}
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-body" style={{ display: 'flex', gap: '16px', padding: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: '4px', display: 'block' }}>Status</label>
              <select className="form-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="missing">Missing</option>
                <option value="settled">Settled</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: '4px', display: 'block' }}>Creditor</label>
              <select className="form-select" value={filterCreditor} onChange={e => setFilterCreditor(e.target.value)}>
                <option value="all">All Creditors</option>
                {availableCreditors.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: '4px', display: 'block' }}>Category</label>
              <select className="form-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="all">All Categories</option>
                {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: 'white', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>
           <div className="card-body" style={{ padding: '24px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'flex-end' }}>
               <div>
                 <span style={{ fontSize: '0.875rem', opacity: 0.8, display: 'block', marginBottom: '4px' }}>Portfolio Health</span>
                 <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>{Math.round(systemProgress)}% Collected</span>
               </div>
               <div style={{ textAlign: 'right' }}>
                 <span style={{ fontSize: '0.875rem', opacity: 0.8, display: 'block', marginBottom: '4px' }}>Remaining Recovery</span>
                 <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>RM {(totalSystemDebt - totalSystemPaid).toLocaleString()}</span>
               </div>
             </div>
             <div className="progress-bg" style={{ height: '12px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '6px' }}>
               <div className="progress-fill" style={{ width: `${systemProgress}%`, backgroundColor: '#3b82f6', boxShadow: '0 0 15px rgba(59,130,246,0.5)', borderRadius: '6px' }}></div>
             </div>
             <div style={{ marginTop: '16px', fontSize: '0.875rem', opacity: 0.7, display: 'flex', gap: '24px' }}>
               <span>Total Debt: RM {totalSystemDebt.toLocaleString()}</span>
               <span>Total Collected: RM {totalSystemPaid.toLocaleString()}</span>
             </div>
           </div>
        </div>

        <div className="card">
          <div className="list-group">
            {filteredDebtors.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>No debtors match your filters.</div>}
            {filteredDebtors.map(debtor => {
              const progress = Math.min(100, Math.round((debtor.paid / debtor.totalDebt) * 100));
              const isComplete = progress >= 100;

              return (
                <div 
                  key={debtor.id} 
                  className="list-item" 
                  style={{ gridTemplateColumns: '2fr 3fr auto', cursor: 'pointer' }}
                  onClick={() => setSelectedProfileId(debtor.id)}
                >
                  <div>
                    <div className="debtor-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {debtor.name}
                      {renderStaffBadge(debtor.id)}
                      {debtor.status === 'missing' ? (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#ef4444', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Missing</span>
                      ) : debtor.status === 'settled' ? (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#dcfce7', color: '#16a34a', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Settled</span>
                      ) : (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#d1fae5', color: '#065f46', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Active</span>
                      )}
                    </div>
                    <div className="debtor-meta">{debtor.category} • {debtor.creditor}</div>
                  </div>
                  
                  <div style={{ paddingRight: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.8125rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>RM{debtor.paid.toLocaleString()} paid</span>
                      <span style={{ fontWeight: 500 }}>RM{debtor.totalDebt.toLocaleString()} total</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-surface-hover)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: isComplete ? 'var(--success)' : 'var(--accent)' }}></div>
                    </div>
                  </div>

                  <div>
                    <ChevronRight size={20} color="var(--text-tertiary)" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <header className="page-header">
        <h2>Staff Management</h2>
        <p className="subtitle">Manage staff accounts and system preferences.</p>
      </header>

      <div className="card">
        <div className="card-header">
          <h3>Staff Management</h3>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Enter new staff name..." 
              value={newStaffName} 
              onChange={e => setNewStaffName(e.target.value)} 
              style={{ flex: 1 }}
            />
            <button 
              className="btn btn-primary"
              onClick={handleAddStaff}
            >
              Add Staff
            </button>
          </div>
          <div className="list-group">
            {staffList.map(staff => (
              <div key={staff.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <UserCircle size={24} color="var(--text-tertiary)" />
                  <div>
                    <div style={{ fontWeight: 600 }}>{staff.name}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{staff.role}</div>
                  </div>
                </div>
                <button 
                  className="btn btn-outline btn-sm" 
                  style={{ color: 'var(--danger)', borderColor: 'var(--border-color)' }}
                  onClick={() => handleDeleteStaff(staff.id, staff.name)}
                >
                  Remove
                </button>
              </div>
            ))}
            {staffList.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>No staff members added yet.</div>}
          </div>
        </div>
      </div>
      {isAdmin && (
        <div className="card" style={{ marginTop: '24px', border: '1px solid #fee2e2', backgroundColor: '#fff5f5' }}>
          <div className="card-header" style={{ borderBottomColor: '#fecaca' }}>
            <h3 style={{ color: '#b91c1c' }}>System Administration</h3>
          </div>
          <div className="card-body">
            <p style={{ fontSize: '0.8125rem', color: '#7f1d1d', marginBottom: '16px', lineHeight: '1.4' }}>
              <strong>Create Public User Access:</strong> Link a Supabase UID to a custom Access ID and PIN. 
              This allows external users to see only their specific data pool.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <input 
                type="text" className="form-input" placeholder="Supabase UID" 
                value={targetUid} onChange={e => setTargetUid(e.target.value)} 
              />
              <input 
                type="email" className="form-input" placeholder="User Email" 
                value={targetEmail} onChange={e => setTargetEmail(e.target.value)} 
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <input 
                type="password" className="form-input" placeholder="User Password" 
                value={targetPassword} onChange={e => setTargetPassword(e.target.value)} 
              />
              <input 
                type="text" className="form-input" placeholder="Set Access ID" 
                value={newAccessId} onChange={e => setNewAccessId(e.target.value)} 
              />
              <input 
                type="text" className="form-input" placeholder="Set PIN" 
                value={newPin} onChange={e => setNewPin(e.target.value)} 
              />
            </div>
            <button 
              className="btn btn-primary" style={{ width: '100%', backgroundColor: '#ef4444' }}
              onClick={handleCreateUserAccess}
            >
              Authorize User Access
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: '32px', textAlign: 'center' }}>
        <button 
          className="btn btn-outline" 
          style={{ borderColor: '#e2e8f0', color: '#64748b' }}
          onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}
        >
          Logout Session
        </button>
      </div>
    </div>
  );

  if (loading) {
    return <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center font-bold text-[#1e293b]">Initializing System...</div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <div className="bg-white rounded-[32px] border border-[#e2e8f0] p-10 w-full max-w-[440px] shadow-[0_20px_50px_rgba(0,0,0,0.05)]">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-[#3b82f6]/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-3xl text-[#3b82f6]">shield_person</span>
            </div>
            <h1 className="text-[28px] font-bold text-[#0f172a] tracking-tight mb-2">Debt Monitor System</h1>
            <p className="text-[#64748b] text-sm font-medium">Enter your credentials to access your dashboard</p>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider ml-1">Access ID</label>
              <input 
                type="text" 
                className="w-full bg-[#f1f5f9] border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-[#3b82f6]/20 outline-none transition-all text-[#1e293b] font-medium"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder=""
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-wider ml-1">Secret PIN</label>
              <input 
                type="password" 
                className="w-full bg-[#f1f5f9] border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-[#3b82f6]/20 outline-none transition-all text-[#1e293b] font-medium"
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value)}
                placeholder=""
              />
            </div>

            {authError && (
              <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-semibold text-center animate-pulse">
                {authError}
              </div>
            )}
            
            <button 
              onClick={handleLogin}
              className="w-full bg-[#0f172a] text-white py-4 rounded-2xl font-bold hover:bg-[#1e293b] transition-all shadow-[0_10px_20px_rgba(15,23,42,0.15)] active:scale-[0.98]"
            >
              Access Dashboard
            </button>
          </div>
          
          <p className="text-center mt-10 text-[11px] text-[#94a3b8] font-medium">
            Authorized Personnel Only • Secure Data Isolation Active
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background text-on-background font-body-md text-body-md h-screen flex overflow-hidden">
      {/* Navigation Drawer (Desktop) */}
      <nav className="hidden md:flex flex-col bg-surface-container-low border-r border-outline-variant h-screen w-64 p-spacing-margin-mobile flex-shrink-0">
        <div className="mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-container-highest border border-outline-variant relative flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-on-surface-variant">account_circle</span>
            </div>
            <div className="flex-1">
              <h2 className="font-headline-sm text-headline-sm text-primary">Collection System</h2>
              <p className="font-label-md text-label-md text-status-paid mt-1">System Active</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <a href="#" className={`flex items-center gap-3 p-3 font-semibold rounded-lg transition-all duration-200 ease-in-out ${activeNav === 'dashboard' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container-high'}`} onClick={() => setActiveNav('dashboard')}>
            <span className="material-symbols-outlined">assignment_late</span>
            <span className="font-label-md text-label-md">Daily Queue</span>
          </a>
          <a href="#" className={`flex items-center gap-3 p-3 font-semibold rounded-lg transition-all duration-200 ease-in-out ${activeNav === 'profiles' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container-high'}`} onClick={() => { setActiveNav('profiles'); setSelectedProfileId(null); }}>
            <span className="material-symbols-outlined">folder_shared</span>
            <span className="font-label-md text-label-md">Debtor Profiles</span>
          </a>
          <a href="#" className={`flex items-center gap-3 p-3 font-semibold rounded-lg transition-all duration-200 ease-in-out ${activeNav === 'settings' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container-high'}`} onClick={() => setActiveNav('settings')}>
            <span className="material-symbols-outlined">settings</span>
            <span className="font-label-md text-label-md">Staff Management</span>
          </a>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* TopAppBar */}
        <header className="bg-surface border-b border-outline-variant w-full h-16 flex justify-between items-center px-spacing-margin-desktop md:px-spacing-margin-desktop px-4 flex-shrink-0 z-10">
          <div className="flex items-center gap-4">
            <button className="md:hidden text-primary hover:opacity-80 active:scale-95 transition-transform">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <h1 className="font-headline-md text-headline-md font-bold text-primary">
              {activeNav === 'dashboard' ? '' : activeNav === 'profiles' ? 'Debtor Profiles' : 'Staff Management'}
            </h1>
          </div>
          <button 
            className="text-primary hover:opacity-80 active:scale-95 transition-transform relative cursor-pointer p-2"
            onClick={() => {
              setShowNotificationsModal(true);
              setHasNewActivity(false);
            }}
            title="View Live Notifications"
          >
            <span className="material-symbols-outlined text-2xl">notifications</span>
            {hasNewActivity && (
              <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-status-overdue rounded-full border border-surface animate-pulse"></div>
            )}
          </button>
        </header>

        {/* Scrollable Canvas */}
        <main className="flex-1 overflow-y-auto bg-background p-spacing-margin-mobile md:p-spacing-margin-desktop pb-24 md:pb-spacing-margin-desktop">
          {activeNav === 'dashboard' && renderDashboard()}
          {activeNav === 'profiles' && renderProfiles()}
          {activeNav === 'settings' && renderSettings()}
        </main>
      </div>

      {/* BottomNavBar (Mobile) */}
      <nav className="fixed bottom-0 w-full z-50 flex justify-around items-center px-4 py-2 md:hidden bg-surface border-t border-outline-variant shadow-lg">
        <a href="#" className={`flex flex-col items-center justify-center p-2 rounded-xl min-w-[64px] transition-transform active:scale-90 ${activeNav === 'dashboard' ? 'text-secondary bg-secondary-container/10' : 'text-on-surface-variant hover:bg-surface-container-high'}`} onClick={() => setActiveNav('dashboard')}>
          <span className="material-symbols-outlined" data-weight={activeNav === 'dashboard' ? "fill" : ""}>priority_high</span>
          <span className="font-label-md text-[10px] mt-1">Queue</span>
        </a>
        <a href="#" className={`flex flex-col items-center justify-center p-2 rounded-xl min-w-[64px] transition-transform active:scale-90 ${activeNav === 'profiles' ? 'text-secondary bg-secondary-container/10' : 'text-on-surface-variant hover:bg-surface-container-high'}`} onClick={() => { setActiveNav('profiles'); setSelectedProfileId(null); }}>
          <span className="material-symbols-outlined" data-weight={activeNav === 'profiles' ? "fill" : ""}>person_search</span>
          <span className="font-label-md text-[10px] mt-1">Profiles</span>
        </a>
        <a href="#" className={`flex flex-col items-center justify-center p-2 rounded-xl min-w-[64px] transition-transform active:scale-90 ${activeNav === 'settings' ? 'text-secondary bg-secondary-container/10' : 'text-on-surface-variant hover:bg-surface-container-high'}`} onClick={() => setActiveNav('settings')}>
          <span className="material-symbols-outlined" data-weight={activeNav === 'settings' ? "fill" : ""}>admin_panel_settings</span>
          <span className="font-label-md text-[10px] mt-1">Staff Management</span>
        </a>
      </nav>

      {/* Modals */}
      {activeModal === 'payment' && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Record Payment</h2>
              <button className="btn btn-outline btn-sm" onClick={() => setActiveModal(null)} style={{ border: 'none' }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Debtor Selection</label>
                <select 
                  className="form-select" 
                  value={selectedDebtorId} 
                  onChange={(e) => setSelectedDebtorId(e.target.value)}
                >
                  {debtors.filter(d => (d.totalDebt - d.paid) > 0).map(d => (
                    <option key={d.id} value={d.id}>{d.name} (Creditor: {d.creditor}) - Balance: RM{(d.totalDebt - d.paid).toLocaleString()}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Amount Paid (RM)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="0.00" 
                    value={paymentAmount} 
                    onChange={e => setPaymentAmount(e.target.value)} 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Date</label>
                  <input type="date" className="form-input" defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
              </div>
              <div className="form-actions">
                <button className="btn btn-outline" onClick={() => setActiveModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleConfirmPayment}>Confirm Payment</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'postpone' && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Postpone Payment</h2>
              <button className="btn btn-outline btn-sm" onClick={() => setActiveModal(null)} style={{ border: 'none' }}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--warning-light)', border: '1px solid #fcd34d', borderRadius: 'var(--radius)', fontSize: '0.8125rem' }}>
                <strong>Note:</strong> Original due date will remain recorded. A hard task will be created for the new follow-up date.
              </div>
              <div className="form-group">
                <label className="form-label">Debtor Selection</label>
                <select 
                  className="form-select" 
                  value={selectedDebtorId} 
                  onChange={(e) => setSelectedDebtorId(e.target.value)}
                >
                  {debtors.filter(d => (d.totalDebt - d.paid) > 0).map(d => (
                    <option key={d.id} value={d.id}>{d.name} (Creditor: {d.creditor}) - Balance: RM{(d.totalDebt - d.paid).toLocaleString()}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">New Follow-up Date</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={postponeDate}
                  onChange={(e) => setPostponeDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Interaction Notes</label>
                <textarea 
                  className="form-input" 
                  rows={3} 
                  placeholder="Reason for delay..."
                  value={postponeReason}
                  onChange={(e) => setPostponeReason(e.target.value)}
                ></textarea>
              </div>
              <div className="form-actions">
                <button className="btn btn-outline" onClick={() => setActiveModal(null)}>Cancel</button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleConfirmPostpone}
                  disabled={!postponeDate}
                >
                  Log Interaction & Postpone
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'addDebtor' && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Add New Debtor</h2>
              <button className="btn btn-outline btn-sm" onClick={() => setActiveModal(null)} style={{ border: 'none' }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Debtor Name *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. John Doe"
                  value={newDebtor.name}
                  onChange={e => setNewDebtor(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Creditor Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. ABC Bank"
                    value={newDebtor.creditor}
                    onChange={e => setNewDebtor(prev => ({ ...prev, creditor: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Personal"
                    list="category-list"
                    value={newDebtor.category}
                    onChange={e => setNewDebtor(prev => ({ ...prev, category: e.target.value }))}
                  />
                  <datalist id="category-list">
                    {availableCategories.map(cat => <option key={cat} value={cat} />)}
                  </datalist>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Initial Debt Amount (RM) *</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="e.g. 5000"
                    value={newDebtor.totalDebt}
                    onChange={e => setNewDebtor(prev => ({ ...prev, totalDebt: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="+60 12-345 6789"
                    value={newDebtor.phone}
                    onChange={e => setNewDebtor(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="123 Main St"
                    value={newDebtor.address}
                    onChange={e => setNewDebtor(prev => ({ ...prev, address: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Emergency Contact</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Wife: +60 11-111 2222"
                    value={newDebtor.emergencyContact}
                    onChange={e => setNewDebtor(prev => ({ ...prev, emergencyContact: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select 
                  className="form-select"
                  value={newDebtor.status}
                  onChange={e => setNewDebtor(prev => ({ ...prev, status: e.target.value as 'active' | 'missing' }))}
                >
                  <option value="active">Active</option>
                  <option value="missing">Missing</option>
                </select>
              </div>
              <div className="form-actions">
                <button className="btn btn-outline" onClick={() => setActiveModal(null)}>Cancel</button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleAddDebtor}
                  disabled={!newDebtor.name || !newDebtor.totalDebt}
                >
                  Create Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'editTargets' && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Edit Targets</h2>
              <button className="btn btn-outline btn-sm" onClick={() => setActiveModal(null)} style={{ border: 'none' }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Weekly Target (RM)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={editWeeklyTarget}
                  onChange={e => setEditWeeklyTarget(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Monthly Target (RM)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={editMonthlyTarget}
                  onChange={e => setEditMonthlyTarget(e.target.value)}
                />
              </div>
              <div className="form-actions">
                <button className="btn btn-outline" onClick={() => setActiveModal(null)}>Cancel</button>
                <button 
                  className="btn btn-primary" 
                  onClick={async () => {
                    const weekly = parseFloat(editWeeklyTarget) || 0;
                    const monthly = parseFloat(editMonthlyTarget) || 0;
                    await supabase.from('metrics').update({
                      weekly_target: weekly,
                      monthly_target: monthly
                    }).eq('id', 'singleton');
                    setActiveModal(null);
                  }}
                >
                  Save Targets
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewDelayHistoryDebtorId && (
        <div className="modal-overlay" onClick={() => setViewDelayHistoryDebtorId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delay History & Remarks</h2>
              <button className="btn btn-outline btn-sm" onClick={() => setViewDelayHistoryDebtorId(null)} style={{ border: 'none' }}>✕</button>
            </div>
            <div className="modal-body">
              {(() => {
                const debtor = debtors.find(d => d.id === viewDelayHistoryDebtorId);
                const history = debtor?.delayHistory || [];
                if (history.length === 0) {
                  return <p style={{ color: 'var(--text-secondary)' }}>No recorded delays for this debtor.</p>;
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {history.map((note, idx) => (
                      <div key={idx} style={{ padding: '12px', background: 'var(--surface-container-lowest)', borderLeft: '4px solid #eab308', borderRadius: '4px', fontSize: '0.875rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', fontSize: '0.75rem' }}>Delay #{idx + 1}</div>
                        <div>{note}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="form-actions" style={{ marginTop: '24px' }}>
                <button className="btn btn-primary" onClick={() => setViewDelayHistoryDebtorId(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Right Slide-over Panel for Activity Feed */}
      {showNotificationsModal && (
        <div className="fixed inset-0 z-50 overflow-hidden" onClick={() => setShowNotificationsModal(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" />

          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div 
              className="w-screen max-w-md bg-surface border-l border-outline-variant shadow-2xl flex flex-col h-full transform transition-transform duration-300 ease-in-out"
              onClick={e => e.stopPropagation()}
            >
              {/* Panel Header */}
              <div className="p-6 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined">history</span>
                  </div>
                  <div>
                    <h2 className="font-headline-sm text-base font-bold text-primary">System Activity Feed</h2>
                    <p className="text-xs text-on-surface-variant mt-0.5">Live tracking of ongoing actions</p>
                  </div>
                </div>
                <button 
                  className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                  onClick={() => setShowNotificationsModal(false)}
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>

              {/* Panel Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {activities.length === 0 ? (
                  <div className="text-center py-12 text-on-surface-variant">
                    <span className="material-symbols-outlined text-4xl opacity-30 mb-2 block">notifications_paused</span>
                    <p className="text-sm">No activity logged yet.</p>
                  </div>
                ) : (
                  <div className="relative border-l-2 border-outline-variant/30 ml-3 pl-4 space-y-6">
                    {activities.map((act, index) => (
                      <div key={act.id} className="relative group">
                        {/* Timeline Node Dot */}
                        <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-surface" />
                        
                        <div className="bg-surface-container-lowest hover:bg-surface-container-low transition-colors p-3 rounded-xl border border-outline-variant/40 shadow-sm">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[10px] font-semibold tracking-wider text-primary uppercase">Activity #{activities.length - index}</span>
                            <span className="text-[10px] font-mono text-on-surface-variant bg-surface-container-highest px-1.5 py-0.5 rounded">{act.time}</span>
                          </div>
                          <p className="text-xs text-on-surface font-medium leading-relaxed">{act.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
