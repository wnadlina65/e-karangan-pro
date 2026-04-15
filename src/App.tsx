/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, 
  LogOut, 
  Plus, 
  Send, 
  Save, 
  ArrowLeft, 
  Eye, 
  Edit2, 
  Trash2, 
  CheckCircle, 
  AlertCircle, 
  User as UserIcon,
  BarChart3,
  Archive,
  Printer,
  X,
  Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Essay, Role, EssayStatus } from './types';
import { 
  WORD_TARGET, 
  MAX_MARKS, 
  getGradeInfo, 
  formatDate, 
  countWords 
} from './constants';
import { 
  auth, 
  db, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot,
  handleFirestoreError,
  OperationType,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from './firebase';

// --- Components ---

const Badge = ({ status, children }: { status: EssayStatus | 'teacher' | 'student', children: React.ReactNode }) => {
  const styles: Record<string, string> = {
    teacher: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    student: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    submitted: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    reviewed: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    draft: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${styles[status]}`}>
      {children}
    </span>
  );
};

const Card: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = "" }) => (
  <div className={`bg-slate-800 border border-white/10 rounded-2xl transition-all duration-200 hover:translate-y-[-2px] hover:shadow-xl hover:shadow-black/30 ${className}`}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className = "", 
  disabled = false,
  type = "button"
}: { 
  children: React.ReactNode, 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'blue' | 'danger',
  className?: string,
  disabled?: boolean,
  type?: "button" | "submit"
}) => {
  const variants = {
    primary: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white hover:opacity-90 active:scale-95',
    secondary: 'bg-slate-700/50 text-slate-200 border border-white/10 hover:bg-white/5 active:scale-95',
    blue: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white hover:opacity-90 active:scale-95',
    danger: 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 active:scale-95',
  };
  return (
    <button 
      type={type}
      onClick={onClick} 
      disabled={disabled}
      className={`px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [essays, setEssays] = useState<Essay[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [screen, setScreen] = useState<'login' | 'dashboard' | 'write' | 'review' | 'select-teacher'>('login');
  const [editingEssay, setEditingEssay] = useState<Essay | null>(null);
  const [viewingEssay, setViewingEssay] = useState<Essay | null>(null);
  const [gradingEssay, setGradingEssay] = useState<Essay | null>(null);
  const [filter, setFilter] = useState<EssayStatus | 'all'>('all');
  const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            setUser(userData);
            if (userData.role === 'student' && !userData.teacherId) {
              setScreen('select-teacher');
            } else {
              setScreen(userData.role === 'student' ? 'dashboard' : 'review');
            }
          } else {
            setUser(null);
            setScreen('login');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setUser(null);
        setScreen('login');
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Teachers
  useEffect(() => {
    if (!isAuthReady || !user || (user.role === 'student' && user.teacherId)) return;

    const teachersQuery = query(collection(db, 'users'), where('role', '==', 'teacher'));
    const unsubscribe = onSnapshot(teachersQuery, (snapshot) => {
      const teacherList = snapshot.docs.map(doc => doc.data() as User);
      setTeachers(teacherList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  // Real-time Essays Listener
  useEffect(() => {
    if (!isAuthReady || !user) {
      setEssays([]);
      return;
    }

    if (user.role === 'student' && !user.teacherId) {
      setEssays([]);
      return;
    }

    let essaysQuery;
    if (user.role === 'teacher') {
      // Teachers see only essays assigned to them
      essaysQuery = query(
        collection(db, 'essays'), 
        where('teacherId', '==', user.id),
        where('status', 'in', ['submitted', 'reviewed'])
      );
    } else {
      // Students see only their own essays
      essaysQuery = query(collection(db, 'essays'), where('userId', '==', user.id));
    }

    const unsubscribe = onSnapshot(essaysQuery, (snapshot) => {
      const essayList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Essay));
      setEssays(essayList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'essays');
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  const [loginError, setLoginError] = useState<string | null>(null);

  const handleSimpleLogin = async (name: string, email: string, role: Role) => {
    try {
      setLoginError(null);
      const emailKey = email.toLowerCase().trim();
      const HIDDEN_PASSWORD = 'spm_karangan_secure_no_pass';
      
      let firebaseUser;
      try {
        // Try to sign in first
        const result = await signInWithEmailAndPassword(auth, emailKey, HIDDEN_PASSWORD);
        firebaseUser = result.user;
      } catch (error: any) {
        // If user doesn't exist, create them
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
          const result = await createUserWithEmailAndPassword(auth, emailKey, HIDDEN_PASSWORD);
          firebaseUser = result.user;
        } else {
          throw error;
        }
      }

      await syncUser(firebaseUser, role, name);
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/operation-not-allowed') {
        setLoginError('Sila aktifkan "Email/Password" di Firebase Console > Authentication.');
      } else if (error.code === 'auth/email-already-in-use') {
        showToast('Emel ini sudah digunakan dengan kaedah lain.', 'error');
      } else {
        showToast('Gagal log masuk. Sila cuba lagi.', 'error');
      }
    }
  };

  const syncUser = async (firebaseUser: any, role: Role, customName?: string) => {
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const userDoc = await getDoc(userDocRef);
    
    let userData: User;
    if (!userDoc.exists()) {
      userData = {
        id: firebaseUser.uid,
        name: customName || firebaseUser.displayName || 'Anonymous',
        email: firebaseUser.email || '',
        role: role
      };
      await setDoc(userDocRef, userData);
    } else {
      userData = userDoc.data() as User;
    }
    
    setUser(userData);
    if (userData.role === 'student' && !userData.teacherId) {
      setScreen('select-teacher');
    } else {
      setScreen(userData.role === 'student' ? 'dashboard' : 'review');
    }
    showToast(`Selamat datang, ${userData.name}!`);
  };

  const handleSelectTeacher = async (teacherId: string) => {
    if (!user || user.role !== 'student') return;
    try {
      const userDocRef = doc(db, 'users', user.id);
      await updateDoc(userDocRef, { teacherId });
      const updatedUser = { ...user, teacherId };
      setUser(updatedUser);
      setScreen('dashboard');
      showToast('Guru telah dipilih!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.id}`);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      showToast('Anda telah log keluar.');
    } catch (error) {
      showToast('Gagal log keluar.', 'error');
    }
  };

  const saveEssay = async (title: string, content: string, status: EssayStatus) => {
    if (!user || !user.teacherId) return;
    
    const essayId = editingEssay?.id || crypto.randomUUID();
    const essayData: Omit<Essay, 'id'> = {
      userId: user.id,
      userName: user.name,
      teacherId: user.teacherId,
      title,
      content,
      marks: editingEssay?.marks ?? -1,
      feedback: editingEssay?.feedback ?? '',
      status,
      createdAt: editingEssay?.createdAt || new Date().toISOString(),
    };

    try {
      const essayDocRef = doc(db, 'essays', essayId);
      await setDoc(essayDocRef, essayData, { merge: true });
      
      setScreen('dashboard');
      setEditingEssay(null);
      showToast(status === 'submitted' ? 'Karangan dihantar!' : 'Draf disimpan!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `essays/${essayId}`);
    }
  };

  const deleteEssay = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'essays', id));
      showToast('Karangan dipadam.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `essays/${id}`);
    }
  };

  const submitGrade = async (id: string, marks: number, feedback: string) => {
    try {
      const essayDocRef = doc(db, 'essays', id);
      await updateDoc(essayDocRef, { marks, feedback, status: 'reviewed' });
      setGradingEssay(null);
      showToast('Penilaian disimpan!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `essays/${id}`);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (screen === 'login') return (
    <LoginScreen 
      onSimpleLogin={handleSimpleLogin}
      configError={loginError}
    />
  );

  return (
    <div className="min-h-screen text-slate-100 font-sans selection:bg-emerald-500/30">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-slate-900/40 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <BookOpen className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-extrabold bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">
            E-Karangan
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Badge status={user?.role as any}>{user?.role === 'student' ? 'Pelajar' : 'Guru'}</Badge>
          <span className="text-sm font-medium text-slate-400 hidden sm:block">{user?.name}</span>
          <Button variant="secondary" onClick={handleLogout} className="px-3 py-2">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Keluar</span>
          </Button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6">
        {screen === 'select-teacher' && user?.role === 'student' && (
          <TeacherSelectionScreen 
            teachers={teachers} 
            onSelect={handleSelectTeacher} 
          />
        )}

        {screen === 'dashboard' && user?.role === 'student' && (
          <StudentDashboard 
            user={user} 
            essays={essays} 
            filter={filter}
            setFilter={setFilter}
            onWrite={() => setScreen('write')}
            onEdit={(e) => { setEditingEssay(e); setScreen('write'); }}
            onDelete={deleteEssay}
            onView={setViewingEssay}
          />
        )}

        {screen === 'review' && user?.role === 'teacher' && (
          <TeacherDashboard 
            essays={essays}
            onGrade={setGradingEssay}
          />
        )}

        {screen === 'write' && (
          <WriteScreen 
            essay={editingEssay} 
            onSave={saveEssay} 
            onCancel={() => { setScreen('dashboard'); setEditingEssay(null); }} 
          />
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {viewingEssay && (
          <ViewModal essay={viewingEssay} onClose={() => setViewingEssay(null)} />
        )}
        {gradingEssay && (
          <GradeModal essay={gradingEssay} onGrade={submitGrade} onClose={() => setGradingEssay(null)} />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className={`fixed bottom-8 left-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${
              toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/50 text-emerald-200' : 'bg-red-900/90 border-red-500/50 text-red-200'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-semibold">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-Screens ---

function LoginScreen({ 
  onSimpleLogin,
  configError
}: { 
  onSimpleLogin: (n: string, e: string, r: Role) => void,
  configError: string | null
}) {
  const [role, setRole] = useState<Role>('student');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSimpleLogin(name, email, role);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-slate-900/50 backdrop-blur-2xl border border-white/10 p-10 rounded-[2.5rem] shadow-2xl"
      >
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-emerald-500/20 mx-auto mb-6">
            <BookOpen className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-2">E-Karangan SPM</h1>
          <p className="text-slate-400 font-medium">Sistem Penilaian Karangan Pintar</p>
        </div>

        {configError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium text-center">
            {configError}
          </div>
        )}

        <div className="flex gap-2 p-1.5 bg-slate-800/50 rounded-2xl mb-8">
          <button 
            onClick={() => setRole('student')}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${role === 'student' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:text-slate-200'}`}
          >
            🎓 Pelajar
          </button>
          <button 
            onClick={() => setRole('teacher')}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${role === 'teacher' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:text-slate-200'}`}
          >
            👨‍🏫 Guru
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Nama Penuh</label>
            <input 
              type="text" 
              required
              placeholder="Masukkan nama penuh anda"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-800 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Emel</label>
            <input 
              type="email" 
              required
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-800 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          
          <Button type="submit" className="w-full py-4 text-lg">
            Log Masuk
          </Button>

          <p className="text-center text-sm text-slate-500 mt-6">
            Sistem akan menyimpan data anda berdasarkan emel yang dimasukkan.
          </p>
        </form>
      </motion.div>
    </div>
  );
}

function TeacherSelectionScreen({ 
  teachers, 
  onSelect 
}: { 
  teachers: User[], 
  onSelect: (id: string) => void 
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto text-center py-12">
      <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
        <UserIcon className="text-amber-500 w-10 h-10" />
      </div>
      <h2 className="text-3xl font-bold mb-4">Pilih Guru Anda</h2>
      <p className="text-slate-400 mb-10">Sila pilih guru yang akan menilai karangan anda.</p>

      <div className="grid grid-cols-1 gap-4">
        {teachers.length === 0 ? (
          <div className="p-8 bg-slate-900/50 rounded-3xl border border-dashed border-white/10">
            <p className="text-slate-500">Tiada guru berdaftar buat masa ini.</p>
          </div>
        ) : (
          teachers.map(teacher => (
            <button
              key={teacher.id}
              onClick={() => onSelect(teacher.id)}
              className="flex items-center justify-between p-6 bg-slate-900 border border-white/5 rounded-2xl hover:border-emerald-500/50 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center group-hover:bg-emerald-500/10 transition-colors">
                  <UserIcon className="w-6 h-6 text-slate-400 group-hover:text-emerald-500" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-white">{teacher.name}</p>
                  <p className="text-xs text-slate-500">{teacher.email}</p>
                </div>
              </div>
              <ArrowLeft className="w-5 h-5 text-slate-600 rotate-180 group-hover:text-emerald-500 transition-colors" />
            </button>
          ))
        )}
      </div>
    </motion.div>
  );
}

function StudentDashboard({ 
  user, 
  essays, 
  filter, 
  setFilter, 
  onWrite, 
  onEdit, 
  onDelete, 
  onView 
}: { 
  user: User, 
  essays: Essay[], 
  filter: EssayStatus | 'all',
  setFilter: (f: EssayStatus | 'all') => void,
  onWrite: () => void,
  onEdit: (e: Essay) => void,
  onDelete: (id: string) => void,
  onView: (e: Essay) => void
}) {
  const myEssays = essays.filter(e => e.userId === user.id);
  const reviewed = myEssays.filter(e => e.status === 'reviewed');
  const avgMarks = reviewed.length ? Math.round(reviewed.reduce((s, e) => s + e.marks, 0) / reviewed.length) : null;

  const filtered = myEssays.filter(e => filter === 'all' || e.status === filter);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        <Card className="p-6">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Jumlah Karangan</p>
          <p className="text-4xl font-black text-white">{myEssays.length}</p>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Telah Dinilai</p>
          <p className="text-4xl font-black text-emerald-500">{reviewed.length}</p>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Purata Markah</p>
          <p className="text-4xl font-black text-blue-500">{avgMarks ?? '—'}<span className="text-lg text-slate-600 ml-1">/30</span></p>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
        <h2 className="text-2xl font-bold">Karangan Saya</h2>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button variant="secondary" onClick={() => window.print()} className="flex-1 sm:flex-none">
            <Printer className="w-4 h-4" />
            Cetak
          </Button>
          <Button onClick={onWrite} className="flex-1 sm:flex-none">
            <Plus className="w-5 h-5" />
            Tulis Baru
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-900 rounded-xl w-fit mb-8 border border-white/5">
        {(['all', 'draft', 'submitted', 'reviewed'] as const).map(t => (
          <button 
            key={t}
            onClick={() => setFilter(t)}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${filter === t ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {t === 'all' ? 'Semua' : t === 'draft' ? 'Draf' : t === 'submitted' ? 'Dihantar' : 'Dinilai'}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/50 rounded-3xl border border-dashed border-white/10">
            <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Edit2 className="text-slate-600 w-8 h-8" />
            </div>
            <p className="text-slate-400 font-medium">Tiada karangan dijumpai.</p>
            <p className="text-slate-600 text-sm">Mulakan penulisan pertama anda hari ini!</p>
          </div>
        ) : (
          filtered.map(essay => (
            <Card key={essay.id} className="p-6 group">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <Badge status={essay.status}>{essay.status}</Badge>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{formatDate(essay.createdAt)}</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2 truncate group-hover:text-emerald-400 transition-colors">{essay.title}</h3>
                  <p className="text-slate-400 text-sm line-clamp-2 leading-relaxed">{essay.content}</p>
                </div>
                
                <div className="flex items-center gap-6">
                  {essay.marks >= 0 && (
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Markah</p>
                      <p className="text-2xl font-black" style={{ color: getGradeInfo(essay.marks).color }}>{essay.marks}<span className="text-sm opacity-50">/30</span></p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => onView(essay)} className="w-10 h-10 p-0">
                      <Eye className="w-5 h-5" />
                    </Button>
                    {essay.status !== 'reviewed' && (
                      <Button variant="secondary" onClick={() => onEdit(essay)} className="w-10 h-10 p-0">
                        <Edit2 className="w-5 h-5" />
                      </Button>
                    )}
                    <Button variant="danger" onClick={() => onDelete(essay.id)} className="w-10 h-10 p-0">
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </motion.div>
  );
}

function TeacherDashboard({ 
  essays, 
  onGrade 
}: { 
  essays: Essay[], 
  onGrade: (e: Essay) => void 
}) {
  const pending = essays.filter(e => e.status === 'submitted');
  const reviewed = essays.filter(e => e.status === 'reviewed');
  const students = [...new Set(essays.map(e => e.userId))].length;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        <Card className="p-6">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Perlu Dinilai</p>
          <p className="text-4xl font-black text-amber-500">{pending.length}</p>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Telah Dinilai</p>
          <p className="text-4xl font-black text-emerald-500">{reviewed.length}</p>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Jumlah Pelajar</p>
          <p className="text-4xl font-black text-blue-500">{students}</p>
        </Card>
      </div>

      <h2 className="text-2xl font-bold mb-8">Karangan Pelajar</h2>

      <div className="space-y-4">
        {pending.length === 0 && reviewed.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/50 rounded-3xl border border-dashed border-white/10">
            <p className="text-slate-400 font-medium">Tiada karangan untuk dinilai.</p>
          </div>
        ) : (
          [...pending, ...reviewed].map(essay => (
            <Card key={essay.id} className="p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5" />
                      {essay.userName}
                    </span>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">• {formatDate(essay.createdAt)}</span>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">• {countWords(essay.content)} perkataan</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2 truncate">{essay.title}</h3>
                  <p className="text-slate-400 text-sm line-clamp-2 leading-relaxed">{essay.content}</p>
                </div>
                
                <div className="flex items-center gap-6">
                  {essay.marks >= 0 ? (
                    <div className="w-14 h-14 rounded-full border-4 flex items-center justify-center text-xl font-black" style={{ borderColor: getGradeInfo(essay.marks).color, color: getGradeInfo(essay.marks).color }}>
                      {essay.marks}
                    </div>
                  ) : (
                    <div className="px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-xl text-xs font-bold uppercase tracking-widest">
                      Belum Dinilai
                    </div>
                  )}
                  <Button variant="blue" onClick={() => onGrade(essay)} className="whitespace-nowrap">
                    {essay.marks >= 0 ? 'Kemaskini' : 'Nilai Sekarang'}
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </motion.div>
  );
}

function WriteScreen({ 
  essay, 
  onSave, 
  onCancel 
}: { 
  essay: Essay | null, 
  onSave: (t: string, c: string, s: EssayStatus) => void, 
  onCancel: () => void 
}) {
  const [title, setTitle] = useState(essay?.title || '');
  const [content, setContent] = useState(essay?.content || '');
  
  const words = useMemo(() => countWords(content), [content]);
  const progress = Math.min((words / WORD_TARGET) * 100, 100);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="secondary" onClick={onCancel} className="w-10 h-10 p-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-2xl font-bold">{essay ? 'Edit Karangan' : 'Tulis Karangan Baru'}</h2>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => onSave(title, content, 'draft')}>
            <Save className="w-4 h-4" />
            Simpan Draf
          </Button>
          <Button onClick={() => onSave(title, content, 'submitted')}>
            <Send className="w-4 h-4" />
            Hantar
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Tajuk Karangan</label>
          <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Masukkan tajuk karangan..."
            className="w-full bg-slate-900 border border-white/5 rounded-2xl px-6 py-4 text-xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-slate-700"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Isi Karangan</label>
          <textarea 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Mulakan penulisan anda di sini..."
            className="w-full bg-slate-900 border border-white/5 rounded-2xl px-8 py-8 text-slate-300 text-lg leading-relaxed min-height-[500px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all placeholder:text-slate-700 resize-none"
            rows={15}
          />
        </div>

        <div className="bg-slate-900 rounded-2xl p-6 border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <span className={`text-sm font-bold ${words >= WORD_TARGET ? 'text-emerald-500' : 'text-slate-400'}`}>
              {words} patah perkataan
            </span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sasaran: {WORD_TARGET}</span>
          </div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full bg-gradient-to-r from-emerald-500 to-blue-500"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// --- Modals ---

function ViewModal({ essay, onClose }: { essay: Essay, onClose: () => void }) {
  const grade = essay.marks >= 0 ? getGradeInfo(essay.marks) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-3xl bg-slate-900 border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
          <div>
            <h3 className="text-2xl font-bold text-white mb-2">{essay.title}</h3>
            <div className="flex items-center gap-3">
              <Badge status={essay.status}>{essay.status}</Badge>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{formatDate(essay.createdAt)}</span>
              {grade && (
                <span className="text-sm font-bold" style={{ color: grade.color }}>
                  • {essay.marks}/30 - {grade.text}
                </span>
              )}
            </div>
          </div>
          <Button variant="secondary" onClick={onClose} className="w-10 h-10 p-0 rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-10">
          <div className="prose prose-invert max-w-none">
            {essay.content.split('\n').map((p, i) => (
              <p key={i} className="text-slate-300 text-lg leading-loose mb-6 text-justify indent-8">
                {p}
              </p>
            ))}
          </div>
          
          {essay.feedback && (
            <div className="mt-12 p-8 bg-emerald-500/5 border border-emerald-500/20 rounded-3xl">
              <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-3">Ulasan Guru</p>
              <p className="text-slate-300 italic leading-relaxed">"{essay.feedback}"</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-white/5 bg-slate-900/50 text-right">
          <Button variant="secondary" onClick={onClose}>Tutup</Button>
        </div>
      </motion.div>
    </div>
  );
}

function GradeModal({ 
  essay, 
  onGrade, 
  onClose 
}: { 
  essay: Essay, 
  onGrade: (id: string, m: number, f: string) => void, 
  onClose: () => void 
}) {
  const [marks, setMarks] = useState(essay.marks >= 0 ? essay.marks : 0);
  const [feedback, setFeedback] = useState(essay.feedback || '');
  const [stars, setStars] = useState(essay.marks >= 0 ? Math.ceil(essay.marks / 6) : 0);

  const handleStarClick = (s: number) => {
    setStars(s);
    setMarks(s * 6);
  };

  const gradeInfo = getGradeInfo(marks);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-3xl bg-slate-900 border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
          <div>
            <h3 className="text-xl font-bold text-white mb-1">Nilai Karangan</h3>
            <p className="text-sm font-medium text-emerald-500 flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5" />
              {essay.userName}
            </p>
          </div>
          <Button variant="secondary" onClick={onClose} className="w-10 h-10 p-0 rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          <div className="bg-slate-950/50 rounded-3xl p-8 border border-white/5 max-h-60 overflow-y-auto">
            <h4 className="text-lg font-bold text-white mb-4">{essay.title}</h4>
            <div className="prose prose-invert prose-sm">
              {essay.content.split('\n').map((p, i) => (
                <p key={i} className="text-slate-400 leading-relaxed mb-4 text-justify indent-6">{p}</p>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">Penilaian Pantas (Bintang)</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button 
                      key={s}
                      onClick={() => handleStarClick(s)}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${stars >= s ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-slate-800 text-slate-600 hover:bg-slate-700'}`}
                    >
                      <Star className={`w-6 h-6 ${stars >= s ? 'fill-current' : ''}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">Markah Tepat (0-30)</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="number" 
                    min={0}
                    max={30}
                    value={marks}
                    onChange={(e) => setMarks(Number(e.target.value))}
                    className="w-24 bg-slate-800 border border-white/5 rounded-2xl px-5 py-4 text-2xl font-black text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: gradeInfo.color }}>{gradeInfo.text}</p>
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Tahap Penguasaan</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">Ulasan / Maklum Balas</label>
              <textarea 
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Tulis ulasan anda di sini..."
                className="w-full bg-slate-800 border border-white/5 rounded-2xl px-6 py-5 text-slate-300 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none h-40"
              />
            </div>
          </div>
        </div>

        <div className="p-8 border-t border-white/5 bg-slate-900/50 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button onClick={() => onGrade(essay.id, marks, feedback)}>Simpan Penilaian</Button>
        </div>
      </motion.div>
    </div>
  );
}
