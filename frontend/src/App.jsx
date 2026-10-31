import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, Bell, BookOpen,
  CalendarCheck, ChartNoAxesCombined, Check, ChevronDown, ClipboardList,
  GraduationCap, LayoutDashboard, LogOut, Menu, Plus, Search, Settings,
  ShieldCheck, Sparkles, Sun, Moon, Users, X, Pencil, Trash2, RefreshCw, Save,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import api, { messageFromError } from './api';


const initialStudent = {
  roll_no: '',
  name: '',
  email: '',
  department: 'Computer Science',
  semester: 1,
  phone: '',
  status: 'Active',
  password: '',
};


function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('campusflow_user') || 'null'); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('campusflow_token'));
  const [page, setPage] = useState('Dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('campusflow_theme') === 'dark' ? 'dark' : 'light');
  const [refreshKey, setRefreshKey] = useState(0);
  const [dashboard, setDashboard] = useState(null);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [studentModal, setStudentModal] = useState(null);
  const [studentForm, setStudentForm] = useState(initialStudent);
  const [attendance, setAttendance] = useState([]);
  const [attendanceForm, setAttendanceForm] = useState({ student_id: '', date: new Date().toISOString().slice(0, 10), subject: 'Data Structures', status: 'Present' });
  const [attendanceMonth, setAttendanceMonth] = useState(new Date().toISOString().slice(0, 7));
  const [marks, setMarks] = useState([]);
  const [marksForm, setMarksForm] = useState({ student_id: '', semester: 3, subject: 'Data Structures', assessment: 'Internal 1', gpa: 8 });
  const [marksSemester, setMarksSemester] = useState('3');

  const isStudent = user?.role === 'Student';
  const canEdit = ['Admin', 'Faculty'].includes(user?.role);
  const canDelete = user?.role === 'Admin';

  useEffect(() => {
    if (!token || !user) return;
    loadCore();
  }, [token, user, refreshKey]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('campusflow_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(timer);
  }, [notice]);

  async function loadCore() {
    try {
      const [dash, studentRes] = await Promise.all([api.get('/dashboard'), api.get('/students')]);
      setDashboard(dash.data);
      setStudents(studentRes.data.students || []);
      const firstId = user?.student_id || studentRes.data.students?.[0]?.student_id || '';
      setAttendanceForm((old) => ({ ...old, student_id: old.student_id || firstId }));
      setMarksForm((old) => ({ ...old, student_id: old.student_id || firstId }));
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) logout();
      else setNotice({ type: 'error', text: messageFromError(err) });
    }
  }

  async function signIn(email, password) {
    setBusy(true);
    try {
      const response = await api.post('/auth/login', { email, password });
      localStorage.setItem('campusflow_token', response.data.token);
      localStorage.setItem('campusflow_user', JSON.stringify(response.data.user));
      setToken(response.data.token);
      setUser(response.data.user);
      setPage('Dashboard');
      setNotice({ type: 'success', text: `Welcome back, ${response.data.user.name}.` });
    } catch (err) {
      setNotice({ type: 'error', text: messageFromError(err) });
    } finally { setBusy(false); }
  }

  function logout() {
    localStorage.removeItem('campusflow_token');
    localStorage.removeItem('campusflow_user');
    setToken(null); setUser(null); setDashboard(null); setStudents([]);
  }


async function saveStudent(event) {
  event.preventDefault();
  setBusy(true);

  try {
    if (studentModal?.student_id) {
      const { password, ...studentDetails } = studentForm;

      await api.put(
        `/students/${studentModal.student_id}`,
        studentDetails
      );

      setNotice({
        type: 'success',
        text: 'Student details updated successfully.',
      });
    } else {
      await api.post('/students', studentForm);

      setNotice({
        type: 'success',
        text: 'Student profile and login account created successfully.',
      });
    }

    setStudentModal(null);
    setStudentForm(initialStudent);
    setRefreshKey((x) => x + 1);
  } catch (err) {
    setNotice({
      type: 'error',
      text: messageFromError(err),
    });
  } finally {
    setBusy(false);
  }
}


  async function deleteStudent(student) {
    if (!window.confirm(`Delete ${student.name}? This removes their profile from MongoDB.`)) return;
    try {
      await api.delete(`/students/${student.student_id}`);
      setNotice({ type: 'success', text: 'Student deleted.' });
      setRefreshKey((x) => x + 1);
    } catch (err) { setNotice({ type: 'error', text: messageFromError(err) }); }
  }

  async function loadAttendance(studentId = attendanceForm.student_id, month = attendanceMonth) {
    if (!studentId) return;
    try {
      const result = await api.get('/attendance', { params: { student_id: studentId, month } });
      setAttendance(result.data.attendance || []);
    } catch (err) { setNotice({ type: 'error', text: messageFromError(err) }); }
  }

  async function submitAttendance(event) {
    event.preventDefault();
    try {
      await api.post('/attendance', attendanceForm);
      setNotice({ type: 'success', text: 'Attendance saved successfully.' });
      loadAttendance();
      setRefreshKey((x) => x + 1);
    } catch (err) { setNotice({ type: 'error', text: messageFromError(err) }); }
  }

  async function loadMarks(studentId = marksForm.student_id, semester = marksSemester) {
    if (!studentId) return;
    try {
      const result = await api.get('/marks', { params: { student_id: studentId, semester } });
      setMarks(result.data.marks || []);
    } catch (err) { setNotice({ type: 'error', text: messageFromError(err) }); }
  }

  async function submitMarks(event) {
    event.preventDefault();
    try {
      await api.post('/marks', { ...marksForm, semester: Number(marksForm.semester), gpa: Number(marksForm.gpa) });
      setNotice({ type: 'success', text: 'Assessment GPA saved successfully.' });
      loadMarks(marksForm.student_id, String(marksForm.semester));
      setRefreshKey((x) => x + 1);
    } catch (err) { setNotice({ type: 'error', text: messageFromError(err) }); }
  }

  const filteredStudents = useMemo(() => students.filter((s) =>
    [s.name, s.roll_no, s.department, s.email].some((v) => String(v || '').toLowerCase().includes(search.toLowerCase()))
  ), [students, search]);

  if (!token || !user) return <LoginScreen onLogin={signIn} busy={busy} notice={notice} />;

  const nav = [
    { label: 'OVERVIEW', items: [{ name: 'Dashboard', icon: LayoutDashboard }] },
    { label: 'ACADEMICS', items: [
      { name: 'Students', icon: Users },
      { name: 'Attendance', icon: CalendarCheck },
      { name: 'Marks & Grades', icon: ClipboardList },
      { name: 'Reports', icon: ChartNoAxesCombined },
    ] },
  ];
  const pageIcon = { Dashboard: LayoutDashboard, Students: Users, Attendance: CalendarCheck, 'Marks & Grades': ClipboardList, Reports: ChartNoAxesCombined };
  const PageIcon = pageIcon[page] || LayoutDashboard;

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><GraduationCap size={23} /></div>
          <div><div className="brand-name">CampusFlow</div><div className="brand-caption">ACADEMIC ERP</div></div>
          <button className="icon-btn sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18}/></button>
        </div>
        <div className="campus-card">
          <div className="campus-avatar">CU</div>
          <div className="campus-copy"><strong>Campus University</strong><span>Academic year 2026–27</span></div>
          <ChevronDown size={15} className="muted-icon"/>
        </div>
        <div className="nav-wrap">
          {nav.map((group) => <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.filter((item) => item.name !== 'Students' || !isStudent).map((item) => {
              const Icon = item.icon;
              return <button key={item.name} className={`nav-item ${page === item.name ? 'active' : ''}`} onClick={() => { setPage(item.name); setSidebarOpen(false); }}>
                <Icon size={18}/><span>{item.name}</span>{item.name === 'Reports' && <span className="nav-soon">NEW</span>}
              </button>;
            })}
          </div>)}
        </div>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><Sparkles size={17}/></div><strong>Need a hand?</strong><p>Keep your academic records organized and up to date.</p><button onClick={() => setNotice({ type: 'info', text: 'For this local demo, see README.md for setup and API documentation.' })}>View quick guide <ArrowUpRight size={14}/></button></div>
          <button className="nav-item settings-item" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}><span>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</span><span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span></button>
          <div className="profile-mini"><div className="avatar">{(user.name || 'U').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()}</div><div className="profile-copy"><strong>{user.name}</strong><span>{user.role}</span></div><button className="icon-btn logout-btn" onClick={logout} title="Sign out"><LogOut size={17}/></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-btn mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={21}/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{page}</strong></div></div>
          <div className="topbar-actions"><div className="term-pill"><span className="status-dot"/> Semester {isStudent ? '3' : '2026–27'}</div><button className="icon-btn notification-btn" onClick={() => setNotice({ type: 'info', text: 'You are all caught up — no new notifications.' })} aria-label="Notifications"><Bell size={19}/><i/></button><div className="topbar-divider"/><div className="top-user"><div className="avatar small">{(user.name || 'U')[0].toUpperCase()}</div><div><strong>{user.name}</strong><span>{user.role}</span></div></div></div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div><div className="eyebrow"><span className="eyebrow-line"/> COLLEGE MANAGEMENT PORTAL</div><h1>{page === 'Marks & Grades' ? 'Marks & Grades' : page === 'Dashboard' ? 'Good to see you, ' + (user.name || '').split(' ')[0] + ' 👋' : page}</h1><p>{pageDescription(page)}</p></div>
            <div className="heading-actions"><button className="btn btn-outline" onClick={() => setRefreshKey((x) => x + 1)}><RefreshCw size={15}/> Refresh</button>{page === 'Students' && canEdit && <button className="btn btn-primary" onClick={() => { setStudentForm(initialStudent); setStudentModal({}); }}><Plus size={17}/> Add student</button>}</div>
          </div>

          {page === 'Dashboard' && <DashboardPage dashboard={dashboard} students={students} user={user} onNavigate={setPage} />}
          {page === 'Students' && <StudentsPage students={filteredStudents} search={search} setSearch={setSearch} canEdit={canEdit} canDelete={canDelete} onEdit={(s) => { setStudentForm({ ...s }); setStudentModal(s); }} onDelete={deleteStudent} />}
          {page === 'Attendance' && <AttendancePage students={students} user={user} form={attendanceForm} setForm={setAttendanceForm} month={attendanceMonth} setMonth={setAttendanceMonth} attendance={attendance} onSubmit={submitAttendance} onLoad={loadAttendance} canEdit={canEdit} />}
          {page === 'Marks & Grades' && <MarksPage students={students} user={user} form={marksForm} setForm={setMarksForm} semester={marksSemester} setSemester={setMarksSemester} marks={marks} onSubmit={submitMarks} onLoad={loadMarks} canEdit={canEdit} />}
          {page === 'Reports' && <ReportsPage dashboard={dashboard} students={students} />}
        </div>
        <footer className="footer"><span>© 2026 CampusFlow Academic ERP</span><span><span className="status-dot"/> All systems operational</span><span>Built for better learning outcomes</span></footer>
      </main>

      {studentModal && <StudentModal form={studentForm} setForm={setStudentForm} editing={!!studentModal.student_id} busy={busy} onClose={() => setStudentModal(null)} onSubmit={saveStudent}/>}
      {notice && <div className={`toast toast-${notice.type}`}><span className="toast-symbol">{notice.type === 'success' ? <Check size={17}/> : notice.type === 'error' ? <AlertCircle size={17}/> : <Activity size={17}/>}</span><span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={16}/></button></div>}
    </div>
  );
}

function pageDescription(page) {
  return ({
    Dashboard: 'Here’s what’s happening across your academic community.',
    Students: 'Manage student profiles, enrollment details, and academic records.',
    Attendance: 'Track classroom attendance and keep records up to date.',
    'Marks & Grades': 'Record assessments and monitor academic achievement.',
    Reports: 'A snapshot of academic activity and student outcomes.',
  })[page] || '';
}

function LoginScreen({ onLogin, busy, notice }) {
  const [email, setEmail] = useState('admin@college.local');
  const [password, setPassword] = useState('Admin123!');
  const [showPassword, setShowPassword] = useState(false);
  return <div className="login-page">
    <div className="login-visual"><div className="login-visual-top"><div className="brand-mark"><GraduationCap size={23}/></div><span>CampusFlow</span></div><div className="visual-content"><div className="visual-badge"><Sparkles size={14}/> YOUR CAMPUS, CONNECTED</div><h1>Every learner.<br/><em>Every milestone.</em><br/>One place.</h1><p>A smarter academic workspace for student information, attendance, and performance — designed to help your campus thrive.</p><div className="visual-stats"><div><strong>360°</strong><span>Student view</span></div><div><strong>Real-time</strong><span>Academic records</span></div><div><strong>One hub</strong><span>Campus operations</span></div></div></div><div className="visual-footer"><span>ACADEMIC EXCELLENCE, SIMPLIFIED</span><span>01 — 04</span></div><div className="visual-orb orb-one"/><div className="visual-orb orb-two"/></div>
    <div className="login-form-side"><div className="login-form-wrap"><div className="mobile-brand"><div className="brand-mark"><GraduationCap size={23}/></div><strong>CampusFlow</strong></div><div className="login-kicker">WELCOME TO CAMPUSFLOW</div><h2>Sign in to your workspace</h2><p className="login-subtitle">Enter your credentials to access your academic portal.</p>
      {notice && <div className={`login-notice ${notice.type}`}>{notice.text}</div>}
      <form onSubmit={(e) => { e.preventDefault(); onLogin(email, password); }} className="login-form">
        <label>Email address</label><div className="input-wrap"><span className="input-leading">@</span><input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu"/></div>
        <div className="password-label"><label>Password</label><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div><div className="input-wrap"><span className="input-leading">⌑</span><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password"/></div>
        <button className="btn btn-primary login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to portal'} <ArrowUpRight size={17}/></button>
      </form>
      <div className="login-separator"><span/> <small>DEMO ACCESS</small> <span/></div>
      <div className="demo-accounts"><button onClick={() => { setEmail('admin@college.local'); setPassword('Admin123!'); }}><ShieldCheck size={16}/><span><strong>Administrator</strong><small>Full system access</small></span><ArrowUpRight size={14}/></button><button onClick={() => { setEmail('faculty@college.local'); setPassword('Faculty123!'); }}><BookOpen size={16}/><span><strong>Faculty</strong><small>Academic management</small></span><ArrowUpRight size={14}/></button><button onClick={() => { setEmail('student@college.local'); setPassword('Student123!'); }}><GraduationCap size={16}/><span><strong>Student</strong><small>Personal academic view</small></span><ArrowUpRight size={14}/></button></div>
      <div className="login-legal">By signing in, you agree to your institution’s acceptable-use policies.<br/><span>Secure access · Local development environment</span></div>
    </div></div>
  </div>;
}

function DashboardPage({ dashboard, students, user, onNavigate }) {
  const data = dashboard || {};
  const trend = [
    { month: 'Jan', gpa: 6.8, attendance: 74 }, { month: 'Feb', gpa: 7.2, attendance: 79 },
    { month: 'Mar', gpa: 7.0, attendance: 77 }, { month: 'Apr', gpa: 7.8, attendance: 82 },
    { month: 'May', gpa: 8.1, attendance: 84 }, { month: 'Jun', gpa: 8.5, attendance: 88 },
  ];
  const stats = [
    { label: 'Total students', value: data.total_students ?? '—', change: 'Enrolled learners', icon: Users, color: 'blue', detail: 'Student directory' },
    { label: 'Average GPA', value: `${data.average_gpa ?? 0}/10`, change: 'Across recorded assessments', icon: ChartNoAxesCombined, color: 'purple', detail: 'Academic results' },
    { label: 'Attendance rate', value: `${data.attendance_rate ?? 0}%`, change: 'This month · recorded sessions', icon: CalendarCheck, color: 'green', detail: 'Attendance log' },
    { label: 'Assessments', value: data.assessments_count ?? 0, change: 'Marks entries recorded', icon: ClipboardList, color: 'orange', detail: 'Marks & grades' },
  ];
  return <>
    <div className="welcome-strip"><div className="welcome-icon"><Sparkles size={20}/></div><div><strong>Your academic overview is ready.</strong><p>Review your key metrics, keep records current, and support student success.</p></div><button onClick={() => onNavigate('Reports')}>View reports <ArrowUpRight size={15}/></button></div>
    <div className="stats-grid">{stats.map((s) => { const Icon = s.icon; return <div className="stat-card" key={s.label}><div className="stat-top"><span>{s.label}</span><div className={`stat-icon ${s.color}`}><Icon size={18}/></div></div><div className="stat-value">{s.value}</div><div className="stat-bottom"><span className="stat-change"><span className="tiny-dot"/> {s.change}</span><span className="stat-link">{s.detail}</span></div></div>; })}</div>
    <div className="dashboard-grid">
      <section className="panel performance-panel"><div className="panel-heading"><div><h3>Academic performance</h3><p>Illustrative six-month trend</p></div><button className="select-pill" onClick={() => onNavigate('Reports')}>View report <ArrowUpRight size={14}/></button></div><div className="chart-legend"><span><i className="legend-blue"/> Average GPA</span><span><i className="legend-green"/> Attendance</span><span className="legend-note">Illustrative trend</span></div><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}><defs><linearGradient id="gpaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5a77e8" stopOpacity={0.22}/><stop offset="100%" stopColor="#5a77e8" stopOpacity={0.01}/></linearGradient><linearGradient id="attendanceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#32b58c" stopOpacity={0.15}/><stop offset="100%" stopColor="#32b58c" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9edf4"/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#8a95a9', fontSize: 11 }}/><YAxis yAxisId="gpa" domain={[0, 10]} axisLine={false} tickLine={false} tick={{ fill: '#8a95a9', fontSize: 11 }}/><YAxis yAxisId="attendance" orientation="right" domain={[50, 100]} axisLine={false} tickLine={false} tick={{ fill: '#8a95a9', fontSize: 11 }}/><Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e9edf4', boxShadow: '0 8px 30px #1a2b4b12' }}/><Area yAxisId="gpa" type="monotone" dataKey="gpa" name="Average GPA" stroke="#5a77e8" strokeWidth={2.5} fill="url(#gpaFill)" activeDot={{ r: 5 }}/><Area yAxisId="attendance" type="monotone" dataKey="attendance" name="Attendance" stroke="#32b58c" strokeWidth={2.5} fill="url(#attendanceFill)" activeDot={{ r: 5 }}/></AreaChart></ResponsiveContainer></div><div className="chart-footnote"><span><i className="tiny-dot blue-dot"/> Academic results are read from your database.</span><span>Trend is illustrative demo data</span></div></section>
      <section className="panel quick-panel"><div className="panel-heading"><div><h3>Quick actions</h3><p>Common tasks, one click away</p></div><div className="quick-spark"><Sparkles size={16}/></div></div><div className="quick-list">
        {(!user || user.role !== 'Student') && <button onClick={() => onNavigate('Students')}><span className="quick-icon q-blue"><Users size={18}/></span><span><strong>Manage students</strong><small>Add or update student profiles</small></span><ArrowUpRight size={16}/></button>}
        <button onClick={() => onNavigate('Attendance')}><span className="quick-icon q-green"><CalendarCheck size={18}/></span><span><strong>Record attendance</strong><small>Mark today's class attendance</small></span><ArrowUpRight size={16}/></button>
        <button onClick={() => onNavigate('Marks & Grades')}><span className="quick-icon q-purple"><ClipboardList size={18}/></span><span><strong>Enter assessment marks</strong><small>Update subject-wise performance</small></span><ArrowUpRight size={16}/></button>
        <button onClick={() => onNavigate('Reports')}><span className="quick-icon q-orange"><ChartNoAxesCombined size={18}/></span><span><strong>View reports</strong><small>Review academic summaries</small></span><ArrowUpRight size={16}/></button>
      </div><div className="quick-note"><ShieldCheck size={16}/><span>Access is based on your assigned role.</span></div></section>
    </div>
    <div className="bottom-grid">
      <section className="panel table-panel"><div className="panel-heading"><div><h3>{user?.role === 'Student' ? 'Your profile' : 'Recently enrolled students'}</h3><p>Student information overview</p></div><button className="text-action" onClick={() => onNavigate('Students')}>View all <ArrowUpRight size={14}/></button></div><StudentTable students={data.recent_students || students.slice(0, 5)} compact /></section>
      <section className="panel activity-panel"><div className="panel-heading"><div><h3>Recent attendance</h3><p>Latest attendance records this month</p></div><button className="text-action" onClick={() => onNavigate('Attendance')}>View log <ArrowUpRight size={14}/></button></div>{(data.recent_attendance || []).length ? <div className="activity-list">{data.recent_attendance.map((a, i) => <div className="activity-row" key={`${a.roll_no}-${a.date}-${a.subject}-${i}`}><div className={`activity-mark ${a.status.toLowerCase()}`}>{a.status === 'Present' ? <Check size={15}/> : <X size={15}/>}</div><div className="activity-copy"><strong>{a.name}</strong><span>{a.subject} · {a.date}</span></div><span className={`status-badge ${a.status.toLowerCase()}`}>{a.status}</span></div>)}</div> : <EmptyState icon={CalendarCheck} title="No attendance records yet" text="Record attendance to see recent activity here."/>}</section>
    </div>
  </>;
}

function StudentTable({ students, compact = false, canEdit = false, canDelete = false, onEdit, onDelete }) {
  if (!students?.length) return <EmptyState icon={Users} title="No students found" text="Try another search or add a student record."/>;
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>STUDENT</th><th>ROLL NUMBER</th><th>DEPARTMENT</th><th>SEMESTER</th><th>STATUS</th>{!compact && <th>ACTIONS</th>}</tr></thead><tbody>{students.map((s, i) => <tr key={s.student_id}><td><div className="student-cell"><div className={`student-avatar av-${i % 5}`}>{s.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}</div><div><strong>{s.name}</strong><small>{s.email}</small></div></div></td><td><span className="roll-code">{s.roll_no}</span></td><td>{s.department}</td><td><span className="semester-tag">Sem {s.semester}</span></td><td><span className={`status-badge ${(s.status || 'Active').toLowerCase()}`}>{s.status || 'Active'}</span></td>{!compact && <td><div className="table-actions">{canEdit && <button title="Edit student" onClick={() => onEdit(s)}><Pencil size={15}/></button>}{canDelete && <button title="Delete student" className="danger-action" onClick={() => onDelete(s)}><Trash2 size={15}/></button>}</div></td>}</tr>)}</tbody></table></div>;
}

function StudentsPage({ students, search, setSearch, canEdit, canDelete, onEdit, onDelete }) {
  return <section className="panel full-panel"><div className="list-toolbar"><div><h3>Student directory</h3><p>{students.length} student record{students.length === 1 ? '' : 's'} shown</p></div><div className="search-wrap"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, roll no, branch…"/><kbd>⌘ K</kbd></div></div><StudentTable students={students} canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete}/><div className="table-footer"><span>Showing {students.length} records · Maximum 500</span><span>Data stored in MongoDB</span></div></section>;
}

function AttendancePage({ students, user, form, setForm, month, setMonth, attendance, onSubmit, onLoad, canEdit }) {
  useEffect(() => { if (form.student_id) onLoad(form.student_id, month); }, [form.student_id, month]);
  const selected = students.find((s) => s.student_id === form.student_id);
  return <div className="module-grid"><section className="panel module-form-panel"><div className="panel-heading"><div><h3>{canEdit ? 'Mark attendance' : 'Attendance lookup'}</h3><p>Record class attendance by student and subject.</p></div><div className="module-icon green"><CalendarCheck size={19}/></div></div><form className="erp-form" onSubmit={onSubmit}>
    <label>Student</label><select required value={form.student_id} disabled={user.role === 'Student'} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>{students.map((s) => <option key={s.student_id} value={s.student_id}>{s.name} · {s.roll_no}</option>)}</select>
    {canEdit && <><label>Attendance date</label><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}/><label>Subject</label><input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}/><label>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['Present', 'Absent', 'Late', 'Excused'].map((s) => <option key={s}>{s}</option>)}</select><button className="btn btn-primary form-submit"><Save size={16}/> Save attendance</button></>}
    {!canEdit && <><label>Month</label><input type="month" value={month} onChange={(e) => setMonth(e.target.value)}/><button type="button" className="btn btn-primary form-submit" onClick={() => onLoad(form.student_id, month)}><Search size={16}/> Load attendance</button></>}
    <div className="form-hint"><ShieldCheck size={15}/>{canEdit ? 'Attendance is stored in Cassandra by student and month.' : 'You can only view your own attendance.'}</div>
  </form></section><section className="panel module-results-panel"><div className="panel-heading"><div><h3>Attendance history</h3><p>{selected ? `${selected.name} · ${month}` : month}</p></div><span className="count-pill">{attendance.length} records</span></div>{attendance.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>DATE</th><th>SUBJECT</th><th>STATUS</th></tr></thead><tbody>{[...attendance].sort((a,b) => b.date.localeCompare(a.date)).map((a, i) => <tr key={`${a.date}-${a.subject}-${i}`}><td>{a.date}</td><td><strong>{a.subject}</strong></td><td><span className={`status-badge ${a.status.toLowerCase()}`}>{a.status}</span></td></tr>)}</tbody></table></div> : <EmptyState icon={CalendarCheck} title="Nothing to show yet" text="Choose a student and month, or record attendance to begin."/ >}</section></div>;
}

function MarksPage({ students, user, form, setForm, semester, setSemester, marks, onSubmit, onLoad, canEdit }) {
  useEffect(() => { if (form.student_id) onLoad(form.student_id, semester); }, [form.student_id, semester]);
  const selected = students.find((s) => s.student_id === form.student_id);
  const avg = marks.length ? marks.reduce((sum, mark) => sum + mark.gpa, 0) / marks.length : 0;
  return <>
    <div className="marks-summary">
      <div className="mini-stat"><div className="mini-stat-icon purple"><ChartNoAxesCombined size={18}/></div><div><span>Assessment entries</span><strong>{marks.length}</strong></div></div>
      <div className="mini-stat"><div className="mini-stat-icon blue"><Activity size={18}/></div><div><span>Average GPA</span><strong>{avg.toFixed(2)}/10</strong></div></div>
      <div className="mini-stat"><div className="mini-stat-icon green"><GraduationCap size={18}/></div><div><span>Academic term</span><strong>Semester {semester}</strong></div></div>
    </div>
    <div className="module-grid">
      <section className="panel module-form-panel">
        <div className="panel-heading"><div><h3>{canEdit ? 'Enter assessment GPA' : 'Your results'}</h3><p>Record a GPA for each subject assessment.</p></div><div className="module-icon purple"><ClipboardList size={19}/></div></div>
        <form className="erp-form" onSubmit={onSubmit}>
          <label>Student</label><select required disabled={user.role === 'Student'} value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>{students.map((student) => <option key={student.student_id} value={student.student_id}>{student.name} · {student.roll_no}</option>)}</select>
          <label>Semester</label><select value={canEdit ? form.semester : semester} onChange={(e) => { setSemester(e.target.value); setForm({ ...form, semester: Number(e.target.value) }); }}>{Array.from({ length: 8 }, (_, i) => i + 1).map((value) => <option value={value} key={value}>{value}</option>)}</select>
          {canEdit && <>
            <label>Subject</label><input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}/>
            <label>Assessment name</label><input required value={form.assessment} onChange={(e) => setForm({ ...form, assessment: e.target.value })}/>
            <label>GPA (0–10)</label><input type="number" min="0" max="10" step="0.01" required value={form.gpa} onChange={(e) => setForm({ ...form, gpa: e.target.value })}/>
            <button className="btn btn-primary form-submit"><Save size={16}/> Save GPA</button>
          </>}
          <div className="form-hint"><ShieldCheck size={15}/>{canEdit ? 'GPA results are stored in Cassandra by student and semester.' : 'You can only view your own results.'}</div>
        </form>
      </section>
      <section className="panel module-results-panel">
        <div className="panel-heading"><div><h3>Assessment results</h3><p>{selected ? selected.name : 'Student'} · Semester {semester}</p></div><span className="count-pill">{marks.length} entries</span></div>
        {marks.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>SUBJECT</th><th>ASSESSMENT</th><th>GPA</th></tr></thead><tbody>{marks.map((mark, i) => <tr key={`${mark.subject}-${mark.assessment}-${i}`}><td><strong>{mark.subject}</strong></td><td>{mark.assessment}</td><td>{Number(mark.gpa).toFixed(2)}/10</td></tr>)}</tbody></table></div> : <EmptyState icon={ClipboardList} title="No results recorded" text="Select a student and semester, then enter an assessment GPA to get started."/>}
      </section>
    </div>
  </>;
}

function ReportsPage({ dashboard, students }) {
  const d = dashboard || {};
  return <><div className="stats-grid report-stats"><div className="stat-card"><div className="stat-top"><span>Students in directory</span><div className="stat-icon blue"><Users size={18}/></div></div><div className="stat-value">{d.total_students ?? students.length}</div><div className="stat-bottom"><span className="stat-change">MongoDB records</span></div></div><div className="stat-card"><div className="stat-top"><span>Average GPA</span><div className="stat-icon purple"><ChartNoAxesCombined size={18}/></div></div><div className="stat-value">{d.average_gpa ?? 0}/10</div><div className="stat-bottom"><span className="stat-change">Recorded assessments</span></div></div><div className="stat-card"><div className="stat-top"><span>Attendance rate</span><div className="stat-icon green"><CalendarCheck size={18}/></div></div><div className="stat-value">{d.attendance_rate ?? 0}%</div><div className="stat-bottom"><span className="stat-change">This calendar month</span></div></div></div><section className="panel full-panel"><div className="panel-heading"><div><h3>Student roster export</h3><p>Download the visible student roster as CSV for offline analysis.</p></div><button className="btn btn-outline" onClick={() => downloadCsv(students)}><ArrowDownRight size={16}/> Export CSV</button></div><StudentTable students={students.slice(0, 100)} compact/></section><div className="report-note"><AlertCircle size={17}/><div><strong>About these reports</strong><p>Summary metrics are calculated from records stored in MongoDB and Cassandra. The dashboard’s six-month line chart is illustrative demo data and is not presented as historical database results.</p></div></div></>;
}

function downloadCsv(students) {
  const fields = ['roll_no', 'name', 'email', 'department', 'semester', 'phone', 'status'];
  const escape = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = [fields.join(','), ...students.map((s) => fields.map((f) => escape(s[f])).join(','))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'student-roster.csv'; a.click(); URL.revokeObjectURL(url);
}


function StudentModal({ form, setForm, editing, busy, onClose, onSubmit }) {
  const update = (key, value) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <div className="modal-heading">
          <div>
            <div className="eyebrow">STUDENT RECORD</div>
            <h2>{editing ? 'Edit student details' : 'Add a new student'}</h2>
            <p>
              Enter the student’s enrollment and contact information.
            </p>
          </div>

          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={19} />
          </button>
        </div>

        <form className="erp-form modal-form" onSubmit={onSubmit}>
          <div className="form-two-col">
            <div>
              <label>Roll number *</label>
              <input
                required
                value={form.roll_no || ''}
                onChange={(e) => update('roll_no', e.target.value)}
                placeholder="26CSE004"
              />
            </div>

            <div>
              <label>Full name *</label>
              <input
                required
                value={form.name || ''}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Student full name"
              />
            </div>
          </div>

          <label>Email address *</label>
          <input
            type="email"
            required
            value={form.email || ''}
            onChange={(e) => update('email', e.target.value)}
            placeholder="student@college.edu"
          />

          {!editing && (
            <div>
              <label>Initial login password *</label>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={form.password || ''}
                onChange={(e) => update('password', e.target.value)}
                placeholder="At least 8 characters"
              />
              <p className="form-hint">
                The student will use this password to log in.
              </p>
            </div>
          )}

          <div className="form-two-col">
            <div>
              <label>Department *</label>
              <select
                required
                value={form.department || 'Computer Science'}
                onChange={(e) => update('department', e.target.value)}
              >
                {[
                  'Computer Science',
                  'Electronics',
                  'Electrical Engineering',
                  'Mechanical Engineering',
                  'Civil Engineering',
                  'Information Technology',
                ].map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Semester *</label>
              <select
                required
                value={form.semester || 1}
                onChange={(e) =>
                  update('semester', Number(e.target.value))
                }
              >
                {Array.from({ length: 8 }, (_, i) => i + 1).map(
                  (semester) => (
                    <option value={semester} key={semester}>
                      {semester}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          <div className="form-two-col">
            <div>
              <label>Phone</label>
              <input
                value={form.phone || ''}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="Contact number"
              />
            </div>

            <div>
              <label>Status</label>
              <select
                value={form.status || 'Active'}
                onChange={(e) => update('status', e.target.value)}
              >
                <option>Active</option>
                <option>Inactive</option>
                <option>Graduated</option>
              </select>
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy}
            >
              <Save size={16} />
              {busy
                ? 'Saving…'
                : editing
                  ? 'Save changes'
                  : 'Create student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


function EmptyState({ icon: Icon, title, text }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={23}/></div><strong>{title}</strong><p>{text}</p></div>;
}

export default App;
