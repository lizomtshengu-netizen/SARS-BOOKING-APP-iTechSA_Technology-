/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut, 
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  updateDoc,
  deleteDoc,
  serverTimestamp,
  getDocs,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { Logo } from './components/Logo';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  LogOut, 
  Plus, 
  CheckCircle, 
  AlertCircle, 
  ChevronRight,
  ShieldCheck,
  FileText,
  Trash2,
  Search,
  Filter,
  X,
  ChevronDown,
  CalendarDays,
  Mail,
  History,
  Users as UsersIcon
} from 'lucide-react';
import { format, addDays, isAfter, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends Component<any, any> {
  state = { hasError: false, error: null };

  constructor(props: { children: ReactNode }) {
    super(props);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error) errorMessage = `Database Error: ${parsed.error}`;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-gray-900">Something went wrong</h2>
              <p className="text-gray-600">{errorMessage}</p>
            </div>
            <Button onClick={() => window.location.reload()} className="w-full">
              Reload Application
            </Button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  idNumber: string;
  phoneNumber: string;
  role: 'client' | 'admin';
}

interface Appointment {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  serviceId: string;
  serviceName: string;
  branch: string;
  date: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'rejected';
  rejectionReason?: string;
  createdAt: string;
}

interface Service {
  id: string;
  name: string;
  description: string;
}

interface AuditLog {
  id: string;
  adminId: string;
  adminEmail: string;
  action: 'appointment_cancelled' | 'appointment_rejected' | 'user_role_changed';
  targetId: string;
  details?: string;
  timestamp: string;
}

// --- Constants ---
const BRANCHES = [
  'iTechSA Technology Practitioner'
];

const SERVICES: Service[] = [
  { id: 'pit', name: 'Personal Income Tax', description: 'Assistance with individual tax returns and queries.' },
  { id: 'vat', name: 'Value Added Tax (VAT)', description: 'VAT registration, returns, and compliance.' },
  { id: 'cit', name: 'Corporate Income Tax', description: 'Business tax services and company registrations.' },
  { id: 'customs', name: 'Customs & Excise', description: 'Import/export duties and customs regulations.' },
  { id: 'audit', name: 'Audit & Compliance', description: 'Support for ongoing tax audits and compliance checks.' }
];

// --- Components ---

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md',
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}) => {
  const variants = {
    primary: 'bg-[#003B5C] text-white hover:bg-[#002B44]',
    secondary: 'bg-[#F2A900] text-[#003B5C] hover:bg-[#D99700]',
    outline: 'border-2 border-[#003B5C] text-[#003B5C] hover:bg-[#003B5C] hover:text-white',
    ghost: 'text-[#003B5C] hover:bg-gray-100'
  };

  const sizes = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };

  return (
    <button 
      className={cn(
        'rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('bg-white rounded-xl shadow-sm border border-gray-100 p-6', className)}>
    {children}
  </div>
);

const Input = ({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) => (
  <div className="space-y-1">
    <label className="text-sm font-medium text-gray-700">{label}</label>
    <input 
      className={cn(
        'w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#003B5C] focus:border-transparent outline-none transition-all',
        error && 'border-red-500 focus:ring-red-500'
      )}
      {...props}
    />
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);

const Select = ({ label, options, error, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: string[]; error?: string }) => (
  <div className="space-y-1">
    <label className="text-sm font-medium text-gray-700">{label}</label>
    <select 
      className={cn(
        'w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#003B5C] focus:border-transparent outline-none transition-all bg-white',
        error && 'border-red-500 focus:ring-red-500'
      )}
      {...props}
    >
      <option value="">Select an option</option>
      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);

// --- Main App ---

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allScheduledAppointments, setAllScheduledAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState<{ show: boolean; type: 'terms' | 'privacy' | 'popia' | 'all' }>({ show: false, type: 'all' });
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ show: boolean; appointmentId: string | null; type: 'reject' | 'cancel' | null }>({ show: false, appointmentId: null, type: null });
  const [prevAppointments, setPrevAppointments] = useState<Appointment[]>([]);
  const [activeAdminTab, setActiveAdminTab] = useState<'appointments' | 'users' | 'audit_logs'>('appointments');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  
  // Auth state
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [appointmentUserDetails, setAppointmentUserDetails] = useState<Record<string, UserProfile>>({});
  const [loadingUserDetails, setLoadingUserDetails] = useState<string | null>(null);
  const [bookingForm, setBookingForm] = useState({
    service: '',
    branch: '',
    date: '',
    time: ''
  });
  const [isConflict, setIsConflict] = useState(false);

  const isAdmin = user?.email?.toLowerCase() === 'lizomtshengu@gmail.com' || profile?.role === 'admin';

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserProfile);
          } else {
            // New user setup
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || displayName || 'SARS User',
              email: firebaseUser.email || '',
              idNumber: '',
              phoneNumber: '',
              role: 'client'
            };
            setProfile(newProfile);
            // We'll save this after they fill in the details
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setProfile(null);
        setAppointments([]);
      }
      setIsAuthReady(true);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!showBookingModal) {
      setBookingForm({
        service: '',
        branch: '',
        date: '',
        time: ''
      });
      setBookingError(null);
      setIsConflict(false);
    }
  }, [showBookingModal]);

  // Real-time conflict detection
  useEffect(() => {
    if (bookingForm.date && bookingForm.time && bookingForm.branch) {
      const appointmentDate = `${bookingForm.date}T${bookingForm.time}:00Z`;
      const hasConflict = allScheduledAppointments.some(app => 
        app.date === appointmentDate && 
        app.branch === bookingForm.branch &&
        app.status === 'scheduled'
      );
      setIsConflict(hasConflict);
      if (hasConflict) {
        setBookingError('This time slot is already booked at this branch. Please select another time.');
      } else {
        setBookingError(null);
      }
    } else {
      setIsConflict(false);
      setBookingError(null);
    }
  }, [bookingForm.date, bookingForm.time, bookingForm.branch, allScheduledAppointments]);

  // Appointments Listener
  useEffect(() => {
    if (!user || !isAuthReady) return;

    // Listener for the user's view (Admin sees all, User sees their own)
    let q;
    const path = 'appointments';
    if (isAdmin) {
      q = query(collection(db, path));
    } else {
      q = query(collection(db, path), where('userId', '==', user.uid));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setAppointments(apps.sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    // Listener for conflict detection (all scheduled appointments)
    let unsubscribeConflicts = () => {};
    const qConflicts = query(collection(db, path), where('status', '==', 'scheduled'));
    unsubscribeConflicts = onSnapshot(qConflicts, (snapshot) => {
      const scheduledApps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setAllScheduledAppointments(scheduledApps);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => {
      unsubscribe();
      unsubscribeConflicts();
    };
  }, [user, isAuthReady, isAdmin]);

  // Filtered Appointments
  const filteredAppointments = appointments.filter(app => {
    const matchesSearch = 
      app.serviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.branch.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.userName?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (app.userEmail?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    const matchesService = serviceFilter === 'all' || app.serviceName === serviceFilter;
    
    let matchesDate = true;
    if (dateRange.start || dateRange.end) {
      const appDate = parseISO(app.date);
      const start = dateRange.start ? startOfDay(parseISO(dateRange.start)) : null;
      const end = dateRange.end ? endOfDay(parseISO(dateRange.end)) : null;
      
      if (start && end) {
        matchesDate = isWithinInterval(appDate, { start, end });
      } else if (start) {
        matchesDate = isAfter(appDate, start) || appDate.getTime() === start.getTime();
      } else if (end) {
        matchesDate = !isAfter(appDate, end);
      }
    }
    
    return matchesSearch && matchesStatus && matchesService && matchesDate;
  });

  // Real-time Rejection Notification
  useEffect(() => {
    if (isAdmin || !user) return;

    appointments.forEach(app => {
      const prevApp = prevAppointments.find(p => p.id === app.id);
      if (prevApp && prevApp.status === 'scheduled' && app.status === 'rejected') {
        toast.error(`Appointment Rejected`, {
          description: `Your appointment for ${app.serviceName} has been rejected. Reason: ${app.rejectionReason || 'No reason provided.'}`,
          duration: 10000,
        });
      }
    });

    setPrevAppointments(appointments);
  }, [appointments, isAdmin, user]);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const q = query(collection(db, 'audit_logs'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => doc.data() as AuditLog);
      setAuditLogs(logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'audit_logs');
    });

    return () => unsubscribe();
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(doc => doc.data() as UserProfile);
      setAllUsers(users);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, [user, isAdmin]);

  const logAuditAction = async (action: AuditLog['action'], targetId: string, details?: string) => {
    if (!user || !isAdmin) return;

    const logData: Omit<AuditLog, 'id'> = {
      adminId: user.uid,
      adminEmail: user.email || '',
      action,
      targetId,
      details,
      timestamp: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'audit_logs'), logData).then(async (docRef) => {
        await updateDoc(docRef, { id: docRef.id });
      });
    } catch (error) {
      console.error("Failed to log audit action:", error);
    }
  };

  const handleUpdateUserRole = async (targetUserId: string, newRole: 'client' | 'admin') => {
    if (!user || !isAdmin) return;
    const path = `users/${targetUserId}`;
    try {
      const userRef = doc(db, 'users', targetUserId);
      const targetUser = allUsers.find(u => u.uid === targetUserId);
      const oldRole = targetUser?.role;
      
      await updateDoc(userRef, { role: newRole });
      
      await logAuditAction(
        'user_role_changed',
        targetUserId,
        `Changed role from ${oldRole} to ${newRole} for user ${targetUser?.email}`
      );
      
      toast.success(`User role updated to ${newRole}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleLogin = async () => {
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login error:', error);
      setAuthError(error.message || 'Failed to sign in with Google');
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('Email login error:', error);
      setAuthError(error.message || 'Invalid email or password');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match');
      return;
    }

    if (!displayName) {
      setAuthError('Please enter your full name');
      return;
    }

    setAuthLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // Update profile with display name
      await updateProfile(userCredential.user, { displayName });
      
      // The onAuthStateChanged listener will handle the profile creation in Firestore
      toast.success('Account created successfully!');
    } catch (error: any) {
      console.error('Email registration error:', error);
      setAuthError(error.message || 'Failed to create account');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleViewDetails = async (app: Appointment) => {
    if (expandedAppId === app.id) {
      setExpandedAppId(null);
      return;
    }

    setExpandedAppId(app.id);

    if (!appointmentUserDetails[app.userId]) {
      setLoadingUserDetails(app.id);
      try {
        const userDoc = await getDoc(doc(db, 'users', app.userId));
        if (userDoc.exists()) {
          setAppointmentUserDetails(prev => ({
            ...prev,
            [app.userId]: userDoc.data() as UserProfile
          }));
        }
      } catch (error) {
        console.error("Error fetching user details:", error);
        toast.error("Failed to load user details");
      } finally {
        setLoadingUserDetails(null);
      }
    }
  };

  const handleUpdateAppointmentStatus = async (id: string, status: 'completed' | 'rejected' | 'cancelled', reason?: string) => {
    const path = `appointments/${id}`;
    try {
      const appRef = doc(db, 'appointments', id);
      const updateData: any = { status };
      if (reason) updateData.rejectionReason = reason;
      
      await updateDoc(appRef, updateData);
      
      if (status === 'rejected' || status === 'cancelled') {
        const app = appointments.find(a => a.id === id);
        const endpoint = status === 'rejected' ? '/api/rejections' : '/api/cancellations';
        // Notify via API
        try {
          await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              appointment: app, 
              reason,
              userEmail: app?.userEmail 
            })
          });
        } catch (err) {
          console.error(`Failed to send ${status} notification email:`, err);
        }

        // Log audit action
        await logAuditAction(
          status === 'rejected' ? 'appointment_rejected' : 'appointment_cancelled',
          id,
          `Reason: ${reason || 'No reason provided'}`
        );
      }
      
      toast.success(`Appointment ${status} successfully!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    const path = `appointments/${id}`;
    try {
      await deleteDoc(doc(db, 'appointments', id));
      toast.success('Appointment cleared from your list');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !profile) return;

    const path = `users/${user.uid}`;
    try {
      await setDoc(doc(db, 'users', user.uid), profile);
      toast.success('Profile updated successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleBookAppointment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBookingError(null);
    if (!user || !profile) return;

    const { service: serviceName, branch, date, time } = bookingForm;

    // 1. Basic required fields check
    if (!serviceName || !branch || !date || !time) {
      setBookingError('Please fill in all required fields.');
      return;
    }

    // 2. Date validation (must be in the future, from tomorrow onwards)
    const selectedDate = parseISO(date);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    if (selectedDate < tomorrow) {
      setBookingError('Appointments must be booked at least 24 hours in advance.');
      return;
    }

    // 3. Weekend check (SARS branches are closed on weekends)
    const dayOfWeek = selectedDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      setBookingError('Appointments are only available on weekdays (Monday to Friday).');
      return;
    }

    // 4. Time validation (Business hours: 08:00 - 16:00)
    const [hours, minutes] = time.split(':').map(Number);
    if (hours < 8 || (hours === 16 && minutes > 0) || hours > 16) {
      setBookingError('Please select a time within business hours (08:00 - 16:00).');
      return;
    }

    // 5. Service validation
    const service = SERVICES.find(s => s.name === serviceName);
    if (!service) {
      setBookingError('Invalid service selected.');
      return;
    }

    // 6. Branch validation
    if (!BRANCHES.includes(branch)) {
      setBookingError('Invalid branch selected.');
      return;
    }

    const appointmentDate = `${date}T${time}:00Z`;

    // 7. Conflict detection
    if (isConflict) {
      setBookingError('This time slot is already booked at this branch. Please select another time.');
      return;
    }

    const path = 'appointments';
    try {
      const appData = {
        userId: user.uid,
        userEmail: user.email || '',
        userName: user.displayName || '',
        serviceId: service?.id || 'unknown',
        serviceName: service?.name || serviceName,
        branch,
        date: appointmentDate,
        status: 'scheduled',
        reminderSent: false,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'appointments'), appData);

      // 2. Send Email Notification via API
      try {
        await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking: appData, userEmail: user.email })
        });
      } catch (err) {
        console.error('Failed to send booking notification email:', err);
      }

      // 3. Send WhatsApp Notification
      const whatsappMessage = `*New Booking Confirmation*\n\n` +
        `*Service:* ${appData.serviceName}\n` +
        `*Branch:* ${appData.branch}\n` +
        `*Date:* ${format(parseISO(appData.date), 'PPP')}\n` +
        `*Time:* ${format(parseISO(appData.date), 'p')}\n` +
        `*User:* ${user.displayName} (${user.email})`;
      
      window.open(`https://wa.me/27768699399?text=${encodeURIComponent(whatsappMessage)}`, '_blank');

      setShowBookingModal(false);
      toast.success('Appointment booked successfully! A notification has been sent.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#003B5C]"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="flex justify-center">
            <Logo className="h-16 md:h-24 w-auto" />
          </div>
          <div className="space-y-4 border-2 border-gray-200 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05),inset_0_2px_0_rgba(255,255,255,1)] rounded-3xl py-10 px-6 bg-white">
            <div className="space-y-2">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight uppercase">SARS BOOKING</h1>
              <div className="flex justify-center">
                <img 
                  src="https://lh3.googleusercontent.com/d/1JrlTMGni6sfMNhbgJCpU4W4DZHsOHo8K" 
                  alt="SARS Logo" 
                  className="h-[4.2rem] md:h-[6.3rem] w-auto"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
            <p className="text-sm md:text-base text-gray-500">Secure appointment management for South African taxpayers.</p>
          </div>
          <Card className="p-6 md:p-8 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-center p-1 bg-gray-100 rounded-xl">
                <button 
                  onClick={() => setAuthMode('login')}
                  className={cn(
                    "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                    authMode === 'login' ? "bg-white text-[#003B5C] shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Login
                </button>
                <button 
                  onClick={() => setAuthMode('register')}
                  className={cn(
                    "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                    authMode === 'register' ? "bg-white text-[#003B5C] shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Register
                </button>
              </div>

              <form onSubmit={authMode === 'login' ? handleEmailLogin : handleEmailRegister} className="space-y-4">
                {authMode === 'register' && (
                  <Input 
                    label="Full Name" 
                    placeholder="Enter your full name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                )}
                <Input 
                  label="Email Address" 
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <div className="space-y-1">
                  <Input 
                    label="Password" 
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  {authMode === 'register' && (
                    <Input 
                      label="Confirm Password" 
                      type="password"
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  )}
                </div>

                {authError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-xs text-red-600">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={authLoading}
                >
                  {authLoading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                  ) : (
                    authMode === 'login' ? 'Sign In' : 'Create Account'
                  )}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">Or continue with</span>
                </div>
              </div>

              <motion.div
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full"
              >
                <Button 
                  onClick={handleLogin} 
                  variant="outline"
                  className="w-full py-2.5 text-sm font-semibold bg-white hover:bg-gray-50 border border-gray-200 shadow-sm transition-all duration-300 rounded-xl flex items-center justify-center gap-2 group"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span className="text-gray-600 group-hover:text-blue-600 transition-colors">
                    Sign in with Google
                  </span>
                </Button>
              </motion.div>
            </div>
          </Card>
          <p className="text-xs text-gray-400">
            By signing in, you agree to our <button onClick={() => setShowLegalModal({ show: true, type: 'all' })} className="text-[#003B5C] hover:underline font-medium">Terms of Service, Privacy Policy & POPIA Compliance</button>.
          </p>
        </motion.div>

        {/* Legal Modal */}
        <AnimatePresence>
          {showLegalModal.show && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                  <div>
                    <h2 className="text-xl font-bold text-[#003B5C]">Legal Information</h2>
                    <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mt-1">iTechSA Technology SARS Booking Portal</p>
                  </div>
                  <button 
                    onClick={() => setShowLegalModal({ ...showLegalModal, show: false })}
                    className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                  >
                    <X className="w-6 h-6 text-gray-500" />
                  </button>
                </div>
                
                <div className="p-8 overflow-y-auto space-y-8 text-sm text-gray-600 leading-relaxed custom-scrollbar">
                  {/* Terms of Service */}
                  <section className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-900 border-b pb-2">Terms of Service</h3>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold text-gray-800">1. Acceptance of Terms</h4>
                        <p>By accessing and using the iTechSA Technology SARS Booking Portal (“the Portal”), you agree to comply with and be bound by these Terms of Service. If you do not agree, you must not use the Portal.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">2. Purpose of the Portal</h4>
                        <p>The Portal is designed to facilitate booking appointments and managing related services for SARS-related engagements. It is intended for lawful use by individuals requiring such services.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">3. User Responsibilities</h4>
                        <p>Users agree to provide accurate and up-to-date personal information, use the Portal only for legitimate purposes, maintain confidentiality of login credentials, and refrain from submitting false or misleading information.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">4. Prohibited Use</h4>
                        <p>Users must not attempt unauthorized access, interfere with system functionality, or use the Portal for unlawful activities.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">5. Service Availability</h4>
                        <p>iTechSA Technology does not guarantee uninterrupted service and may perform maintenance resulting in downtime.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">6. Limitation of Liability</h4>
                        <p>iTechSA Technology is not liable for losses from incorrect user data, system downtime, or indirect damages.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">7. Termination</h4>
                        <p>Access may be suspended or terminated for violations of these terms.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">8. Amendments</h4>
                        <p>Terms may be updated periodically, and continued use constitutes acceptance of changes.</p>
                      </div>
                    </div>
                  </section>

                  {/* Privacy Policy */}
                  <section className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-900 border-b pb-2">Privacy Policy</h3>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold text-gray-800">1. Information Collected</h4>
                        <p>Includes name, contact details, ID or tax number, booking details, and system usage data.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">2. Purpose of Data Collection</h4>
                        <p>Used for booking facilitation, identity verification, communication, system improvement, and legal compliance.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">3. Legal Basis</h4>
                        <p>Processed in accordance with POPIA.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">4. Data Sharing</h4>
                        <p>Shared only with SARS, authorized personnel, service providers, or authorities when required.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">5. Data Security</h4>
                        <p>Appropriate measures are in place to protect personal data.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">6. Data Retention</h4>
                        <p>Data is retained only as long as necessary.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">7. User Rights</h4>
                        <p>Users may access, correct, delete, or object to data processing.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">8. Cookies</h4>
                        <p>Used to enhance user experience.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">9. Contact Information</h4>
                        <p>Users may contact iTechSA Technology for privacy queries.</p>
                      </div>
                    </div>
                  </section>

                  {/* POPIA Compliance */}
                  <section className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-900 border-b pb-2">POPIA Compliance</h3>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold text-gray-800">1. Lawful Processing</h4>
                        <p>All personal information is processed lawfully and reasonably in accordance with POPIA.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">2. Purpose Specification</h4>
                        <p>Information is collected for specific, lawful purposes related to bookings and administration.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">3. Minimality</h4>
                        <p>Only necessary personal information is collected.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">4. Consent</h4>
                        <p>Users consent to data processing by using the Portal.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">5. Information Quality</h4>
                        <p>Reasonable steps are taken to ensure data accuracy.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">6. Security Safeguards</h4>
                        <p>Measures are in place to prevent unauthorized access, loss, or damage.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">7. Openness</h4>
                        <p>Users are informed about data collection and usage.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">8. Data Subject Participation</h4>
                        <p>Users may access, correct, or delete their information.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">9. Information Officer</h4>
                        <p>An Information Officer is designated to ensure compliance.</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">10. Cross-Border Transfers</h4>
                        <p>Transfers occur only where adequate protection or consent exists.</p>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
                  <Button onClick={() => setShowLegalModal({ ...showLegalModal, show: false })}>
                    I Understand
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const needsProfileUpdate = !profile?.idNumber || !profile?.phoneNumber;

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" richColors />
      {/* Header */}
      <header className="bg-white text-gray-900 sticky top-0 z-50 shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 border-2 border-gray-100 shadow-[0_4px_6px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,1)] rounded-2xl px-5 py-2 mr-3 bg-white">
            <div className="flex flex-col items-center gap-0">
              <div className="p-0">
                <Logo className="h-8 w-auto" />
              </div>
              <img 
                src="https://lh3.googleusercontent.com/d/1JrlTMGni6sfMNhbgJCpU4W4DZHsOHo8K" 
                alt="SARS Logo" 
                className="h-[2.1rem] w-auto"
                referrerPolicy="no-referrer"
              />
            </div>
            <span className="font-bold text-lg md:text-xl tracking-tight uppercase">SARS <span className="font-light hidden sm:inline">Bookings</span></span>
            {isAdmin && (
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[#003B5C] text-white text-[10px] font-bold uppercase tracking-wider">
                Admin Portal
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium">{user.displayName}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
            <Button onClick={handleLogout} variant="ghost" className="text-gray-500 hover:bg-gray-100 p-2">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              Welcome back, {user.displayName?.split(' ')[0]}
              {isAdmin && <span className="ml-2 text-xs bg-[#003B5C] text-white px-2 py-1 rounded-full align-middle">Admin</span>}
            </h2>
            <p className="text-sm md:text-base text-gray-500">Manage your SARS appointments and tax services.</p>
          </div>
          <Button onClick={() => setShowBookingModal(true)} className="md:w-auto">
            <Plus className="w-5 h-5" />
            Book New Appointment
          </Button>
        </div>

        {needsProfileUpdate && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="border-l-4 border-[#F2A900] bg-amber-50">
              <div className="flex gap-4">
                <AlertCircle className="w-6 h-6 text-[#F2A900] flex-shrink-0" />
                <div className="space-y-4 flex-1">
                  <div>
                    <h3 className="font-bold text-[#003B5C]">Complete Your Profile</h3>
                    <p className="text-sm text-gray-600">We need your ID number and phone number to process bookings.</p>
                  </div>
                  <form onSubmit={handleSaveProfile} className="grid md:grid-cols-3 gap-4 items-end">
                    <Input 
                      label="ID Number" 
                      placeholder="13-digit SA ID" 
                      maxLength={13}
                      value={profile?.idNumber || ''}
                      onChange={e => setProfile(p => p ? { ...p, idNumber: e.target.value } : null)}
                      required
                    />
                    <Input 
                      label="Phone Number" 
                      placeholder="e.g. 082 123 4567" 
                      value={profile?.phoneNumber || ''}
                      onChange={e => setProfile(p => p ? { ...p, phoneNumber: e.target.value } : null)}
                      required
                    />
                    <Button type="submit" variant="secondary">Save Details</Button>
                  </form>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {isAdmin && (
          <div className="flex gap-2 overflow-x-auto pb-2 border-b border-gray-200">
            <Button 
              variant={activeAdminTab === 'appointments' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setActiveAdminTab('appointments')}
              className="whitespace-nowrap"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Appointments
            </Button>
            <Button 
              variant={activeAdminTab === 'users' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setActiveAdminTab('users')}
              className="whitespace-nowrap"
            >
              <UsersIcon className="w-4 h-4 mr-2" />
              User Management
            </Button>
            <Button 
              variant={activeAdminTab === 'audit_logs' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setActiveAdminTab('audit_logs')}
              className="whitespace-nowrap"
            >
              <History className="w-4 h-4 mr-2" />
              Audit Logs
            </Button>
          </div>
        )}

        {(!isAdmin || activeAdminTab === 'appointments') && (
          <div className="grid lg:grid-cols-3 gap-8">
          {/* Appointments List */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Calendar className="w-6 h-6 text-[#003B5C]" />
                  Your Appointments
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{filteredAppointments.length} of {appointments.length}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={cn("p-2 h-auto", showFilters && "bg-gray-100")}
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <Filter className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text"
                  placeholder="Search by service, branch, or name..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#003B5C] focus:border-transparent outline-none transition-all text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full"
                  >
                    <X className="w-3 h-3 text-gray-400" />
                  </button>
                )}
              </div>

              {/* Filter Panel */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <Card className="bg-gray-50/50 border-dashed p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Status</label>
                          <select 
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#003B5C]"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                          >
                            <option value="all">All Statuses</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="completed">Completed</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Service</label>
                          <select 
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#003B5C]"
                            value={serviceFilter}
                            onChange={(e) => setServiceFilter(e.target.value)}
                          >
                            <option value="all">All Services</option>
                            {SERVICES.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Date Range</label>
                          <div className="flex items-center gap-2">
                            <input 
                              type="date"
                              className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[#003B5C]"
                              value={dateRange.start}
                              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            />
                            <span className="text-gray-400">-</span>
                            <input 
                              type="date"
                              className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[#003B5C]"
                              value={dateRange.end}
                              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            />
                          </div>
                        </div>
                      </div>
                      {(statusFilter !== 'all' || serviceFilter !== 'all' || dateRange.start || dateRange.end) && (
                        <div className="flex justify-end">
                          <button 
                            onClick={() => {
                              setStatusFilter('all');
                              setServiceFilter('all');
                              setDateRange({ start: '', end: '' });
                            }}
                            className="text-xs text-[#003B5C] font-bold hover:underline flex items-center gap-1"
                          >
                            <X className="w-3 h-3" /> Clear Filters
                          </button>
                        </div>
                      )}
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-4">
              {appointments.length === 0 ? (
                <Card className="text-center py-12 space-y-4">
                  <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                    <Calendar className="w-8 h-8 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-gray-900 font-medium">No appointments found</p>
                    <p className="text-sm text-gray-500">Book your first appointment to get started.</p>
                  </div>
                  <Button onClick={() => setShowBookingModal(true)} variant="outline">
                    Book Now
                  </Button>
                </Card>
              ) : filteredAppointments.length === 0 ? (
                <Card className="text-center py-12 space-y-4 border-dashed">
                  <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                    <Search className="w-8 h-8 text-gray-300" />
                  </div>
                  <div>
                    <p className="text-gray-900 font-medium">No matches found</p>
                    <p className="text-sm text-gray-500">Try adjusting your search or filters.</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                      setServiceFilter('all');
                      setDateRange({ start: '', end: '' });
                    }}
                  >
                    Clear All Filters
                  </Button>
                </Card>
              ) : (
                filteredAppointments.map((app) => (
                  <motion.div 
                    key={app.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <Card className="hover:border-[#003B5C] transition-colors group">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="bg-gray-50 p-3 rounded-lg group-hover:bg-[#003B5C]/5 transition-colors">
                            <FileText className="w-6 h-6 text-[#003B5C]" />
                          </div>
                          <div className="space-y-1">
                            <h4 className="font-bold text-gray-900">{app.serviceName}</h4>
                            {isAdmin && (
                              <p className="text-xs font-medium text-[#003B5C]">
                                Booker: {app.userName} ({app.userEmail})
                              </p>
                            )}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                              <span className="text-sm text-gray-500 flex items-center gap-1">
                                <MapPin className="w-4 h-4" /> {app.branch}
                              </span>
                              <span className="text-sm text-gray-500 flex items-center gap-1">
                                <Calendar className="w-4 h-4" /> {format(parseISO(app.date), 'PPP')}
                              </span>
                              <span className="text-sm text-gray-500 flex items-center gap-1">
                                <Clock className="w-4 h-4" /> {format(parseISO(app.date), 'p')}
                              </span>
                            </div>
                            { (app.status === 'rejected' || app.status === 'cancelled') && app.rejectionReason && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className={cn(
                                  "mt-2 p-2 rounded border overflow-hidden",
                                  app.status === 'rejected' ? "bg-red-50 border-red-100" : "bg-orange-50 border-orange-100"
                                )}
                              >
                                <p className={cn(
                                  "text-xs font-medium flex items-center gap-1",
                                  app.status === 'rejected' ? "text-red-600" : "text-orange-600"
                                )}>
                                  <AlertCircle className="w-3 h-3" /> {app.status === 'rejected' ? 'Rejection' : 'Cancellation'} Reason:
                                </p>
                                <p className={cn(
                                  "text-xs mt-0.5",
                                  app.status === 'rejected' ? "text-red-500" : "text-orange-500"
                                )}>{app.rejectionReason}</p>
                              </motion.div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-3">
                          <div className="flex items-center gap-4">
                            <span className={cn(
                              'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider',
                              app.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                              app.status === 'completed' ? 'bg-green-100 text-green-700' :
                              app.status === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-700'
                            )}>
                              {app.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-xs py-1 px-2 h-auto flex items-center gap-1"
                              onClick={() => handleViewDetails(app)}
                            >
                              {expandedAppId === app.id ? <ChevronDown className="w-3 h-3 rotate-180 transition-transform" /> : <ChevronDown className="w-3 h-3 transition-transform" />}
                              {expandedAppId === app.id ? 'Hide Details' : 'View Details'}
                            </Button>
                          </div>
                          {isAdmin && app.status === 'scheduled' && (
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-xs py-1 px-2 h-auto"
                                onClick={() => handleUpdateAppointmentStatus(app.id, 'completed')}
                              >
                                Complete
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="text-xs py-1 px-2 h-auto text-orange-600 hover:bg-orange-50"
                                onClick={() => setActionModal({ show: true, appointmentId: app.id, type: 'cancel' })}
                              >
                                Cancel
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="text-xs py-1 px-2 h-auto text-red-600 hover:bg-red-50"
                                onClick={() => setActionModal({ show: true, appointmentId: app.id, type: 'reject' })}
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                          {!isAdmin && (app.status === 'completed' || app.status === 'rejected') && (
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-xs py-1 px-2 h-auto text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center gap-1"
                              onClick={() => handleDeleteAppointment(app.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Details */}
                      <AnimatePresence>
                        {expandedAppId === app.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-4 pt-4 border-t border-gray-100 overflow-hidden"
                          >
                            {loadingUserDetails === app.id ? (
                              <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                                <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-[#003B5C]"></div>
                                Loading details...
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                                {isAdmin ? (
                                  <>
                                    <div className="space-y-1">
                                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Full Name</p>
                                      <p className="text-sm font-medium text-gray-900">{appointmentUserDetails[app.userId]?.displayName || app.userName || 'Not provided'}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ID Number</p>
                                      <p className="text-sm font-medium text-gray-900">{appointmentUserDetails[app.userId]?.idNumber || 'Not provided'}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Phone Number</p>
                                      <p className="text-sm font-medium text-gray-900">{appointmentUserDetails[app.userId]?.phoneNumber || 'Not provided'}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">User Email</p>
                                      <p className="text-sm font-medium text-gray-900">{app.userEmail}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Booked On</p>
                                      <p className="text-sm font-medium text-gray-900">{format(parseISO(app.createdAt), 'PPP p')}</p>
                                    </div>
                                  </>
                                ) : (
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Booking Reference</p>
                                    <p className="text-sm font-medium text-gray-900">{app.id}</p>
                                    <p className="text-xs text-gray-500 mt-1">Booked on {format(parseISO(app.createdAt), 'PPP p')}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* Sidebar Info */}
          <div className="space-y-6">
            <Card className="bg-[#003B5C] text-white border-none">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-[#F2A900]" />
                SARS Information
              </h3>
              <div className="space-y-4 text-sm text-gray-200">
                <p>Please ensure you bring the following to your appointment:</p>
                <ul className="list-disc list-inside space-y-2">
                  <li>Original ID document</li>
                  <li>Proof of residence</li>
                  <li>Relevant tax documents</li>
                  <li>Bank statement (if required)</li>
                </ul>
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs italic opacity-70">SARS will never ask for your password or PIN via email.</p>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="font-bold text-gray-900 mb-4">Quick Links</h3>
              <div className="space-y-2">
                <a 
                  href="https://www.sarsefiling.co.za/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors text-sm text-gray-600"
                >
                  eFiling Login <ChevronRight className="w-4 h-4" />
                </a>
                <button 
                  onClick={() => setShowSupportModal(true)}
                  className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors text-sm text-gray-600"
                >
                  Contact Support <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </Card>
          </div>
        </div>
      )}

        {isAdmin && activeAdminTab === 'users' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <UsersIcon className="w-6 h-6 text-[#003B5C]" />
              User Management
            </h3>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                    <tr>
                      <th className="px-6 py-3">User</th>
                      <th className="px-6 py-3">Role</th>
                      <th className="px-6 py-3">Contact</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {allUsers.map(u => (
                      <tr key={u.uid} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{u.displayName}</div>
                          <div className="text-xs text-gray-500">{u.email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                            u.role === 'admin' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                          )}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500">
                          {u.phoneNumber || 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {u.email.toLowerCase() !== 'lizomtshengu@gmail.com' && (
                            <select 
                              className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[#003B5C]"
                              value={u.role}
                              onChange={(e) => handleUpdateUserRole(u.uid, e.target.value as 'client' | 'admin')}
                            >
                              <option value="client">Client</option>
                              <option value="admin">Admin</option>
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {isAdmin && activeAdminTab === 'audit_logs' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <History className="w-6 h-6 text-[#003B5C]" />
              Audit Logs
            </h3>
            <div className="space-y-4">
              {auditLogs.map(log => (
                <div key={log.id}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          log.action === 'appointment_cancelled' ? "bg-orange-100 text-orange-600" :
                          log.action === 'appointment_rejected' ? "bg-red-100 text-red-600" :
                          "bg-blue-100 text-blue-600"
                        )}>
                          {log.action === 'appointment_cancelled' ? <X className="w-4 h-4" /> :
                           log.action === 'appointment_rejected' ? <AlertCircle className="w-4 h-4" /> :
                           <UsersIcon className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">
                            {log.action.replace(/_/g, ' ').toUpperCase()}
                          </p>
                          <p className="text-xs text-gray-500">
                            Performed by <span className="font-medium text-gray-700">{log.adminEmail}</span>
                          </p>
                          {log.details && (
                            <p className="text-xs mt-2 p-2 bg-gray-50 rounded border border-gray-100 text-gray-600 italic">
                              {log.details}
                            </p>
                          )}
                          <p className="text-[10px] text-gray-400 mt-1">Target ID: {log.targetId}</p>
                        </div>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <p className="text-xs font-medium text-gray-500">{format(parseISO(log.timestamp), 'PPp')}</p>
                      </div>
                    </div>
                  </Card>
                </div>
              ))}
              {auditLogs.length === 0 && (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                  <History className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                  <p className="text-gray-500">No audit logs found.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Support Modal */}
      <AnimatePresence>
        {showSupportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSupportModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="bg-[#003B5C] p-6 text-white flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="bg-white p-1.5 rounded-lg shadow-sm">
                    <Logo className="h-8 w-auto" />
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-xl font-bold leading-none">Contact Support</h2>
                    <span className="text-[10px] uppercase tracking-widest opacity-70 mt-1">iTechSA Technology</span>
                  </div>
                </div>
                <button onClick={() => setShowSupportModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const data = {
                    name: formData.get('name'),
                    email: formData.get('email'),
                    subject: formData.get('subject'),
                    message: formData.get('message')
                  };

                  try {
                    const response = await fetch('/api/support', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(data)
                    });

                    if (response.ok) {
                      toast.success("Support request sent successfully!");
                      setShowSupportModal(false);
                    } else {
                      toast.error("Failed to send support request.");
                    }
                  } catch (error) {
                    console.error("Support error:", error);
                    toast.error("An error occurred.");
                  }
                }}
                className="p-6 space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Your Name</label>
                    <input 
                      required 
                      name="name"
                      defaultValue={profile?.displayName || ''}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#003B5C] focus:border-transparent transition-all outline-none" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Email Address</label>
                    <input 
                      required 
                      name="email"
                      type="email"
                      defaultValue={profile?.email || ''}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#003B5C] focus:border-transparent transition-all outline-none" 
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Subject</label>
                  <input 
                    required 
                    name="subject"
                    placeholder="What do you need help with?"
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#003B5C] focus:border-transparent transition-all outline-none" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Message</label>
                  <textarea 
                    required 
                    name="message"
                    rows={4}
                    placeholder="Describe your issue in detail..."
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#003B5C] focus:border-transparent transition-all outline-none resize-none" 
                  />
                </div>

                <Button type="submit" className="w-full py-4 text-lg">
                  Send Support Request
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showBookingModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBookingModal(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="bg-[#003B5C] p-6 text-white">
                <h3 className="text-2xl font-bold">Book Appointment</h3>
                <p className="text-gray-300 text-sm">Select your service and preferred branch.</p>
              </div>
              <form onSubmit={handleBookAppointment} className="p-6 space-y-6">
                {bookingError && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    {bookingError}
                  </div>
                )}
                
                <div className="space-y-4">
                  <Select 
                    label="Service Required" 
                    name="service"
                    value={bookingForm.service}
                    onChange={(e) => setBookingForm(prev => ({ ...prev, service: e.target.value }))}
                    options={SERVICES.map(s => s.name)}
                    required
                  />

                  <Select 
                    label="SARS Branch" 
                    name="branch"
                    value={bookingForm.branch}
                    onChange={(e) => setBookingForm(prev => ({ ...prev, branch: e.target.value }))}
                    options={BRANCHES}
                    required
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input 
                      label="Date" 
                      name="date"
                      type="date" 
                      value={bookingForm.date}
                      onChange={(e) => setBookingForm(prev => ({ ...prev, date: e.target.value }))}
                      min={format(addDays(new Date(), 1), 'yyyy-MM-dd')}
                      required
                    />
                    <Input 
                      label="Time" 
                      name="time"
                      type="time" 
                      value={bookingForm.time}
                      onChange={(e) => setBookingForm(prev => ({ ...prev, time: e.target.value }))}
                      min="08:00"
                      max="16:00"
                      required
                    />
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                    <div className={`w-1.5 h-1.5 rounded-full ${isConflict ? 'bg-red-500' : 'bg-green-500'} animate-pulse`} />
                    {isConflict ? 'Time slot unavailable' : 'Real-time conflict detection active'}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowBookingModal(false)} className="w-full sm:flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="w-full sm:flex-1" disabled={isConflict}>
                    Confirm Booking
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-5 mt-5">
        <div className="max-w-7xl mx-auto px-4">
          <div className="max-w-md mx-auto text-center flex flex-col items-center">
            <div className="flex flex-col items-center gap-1 mb-2">
              <div className="flex items-center gap-2">
                <Logo className="h-[1.95rem] w-auto" />
                <span className="font-bold text-gray-900 uppercase text-[0.975rem]">SARS BOOKINGS</span>
              </div>
              <img 
                src="https://lh3.googleusercontent.com/d/1JrlTMGni6sfMNhbgJCpU4W4DZHsOHo8K" 
                alt="SARS Logo" 
                className="h-[2.7rem] w-auto"
                referrerPolicy="no-referrer"
              />
            </div>
            <p className="text-[10px] text-gray-500 border-2 border-gray-100 shadow-[0_4px_6px_rgba(0,0,0,0.02),inset_0_1px_3px_rgba(0,0,0,0.05)] rounded-xl p-2 mt-3 bg-white">Official appointment system for iTechSA Technology.</p>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pt-3 mt-3 border-t border-gray-100 text-center text-[9px] text-gray-400">
          © {new Date().getFullYear()} iTechSA Technology. All rights reserved.
        </div>
      </footer>
      {/* Action Modal (Reject/Cancel) */}
      <AnimatePresence>
        {actionModal.show && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActionModal({ show: false, appointmentId: null, type: null })}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className={cn(
                "p-6 text-white",
                actionModal.type === 'reject' ? "bg-red-600" : "bg-orange-600"
              )}>
                <h3 className="text-xl font-bold">{actionModal.type === 'reject' ? 'Reject' : 'Cancel'} Appointment</h3>
                <p className={cn(
                  "text-sm",
                  actionModal.type === 'reject' ? "text-red-100" : "text-orange-100"
                )}>Please provide a reason for {actionModal.type === 'reject' ? 'rejection' : 'cancellation'}.</p>
              </div>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const reason = (new FormData(e.currentTarget)).get('reason') as string;
                  if (actionModal.appointmentId && actionModal.type) {
                    handleUpdateAppointmentStatus(actionModal.appointmentId, actionModal.type === 'reject' ? 'rejected' : 'cancelled', reason);
                    setActionModal({ show: false, appointmentId: null, type: null });
                  }
                }} 
                className="p-6 space-y-4"
              >
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Reason</label>
                  <textarea 
                    name="reason"
                    className={cn(
                      "w-full px-4 py-2 rounded-lg border focus:ring-2 focus:border-transparent outline-none transition-all min-h-[100px]",
                      actionModal.type === 'reject' ? "border-gray-200 focus:ring-red-500" : "border-gray-200 focus:ring-orange-500"
                    )}
                    placeholder={actionModal.type === 'reject' ? "e.g. Practitioner unavailable, please select another time." : "e.g. Branch closed for maintenance."}
                    required
                  />
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="ghost" onClick={() => setActionModal({ show: false, appointmentId: null, type: null })} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className={cn(
                    "flex-1 text-white",
                    actionModal.type === 'reject' ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"
                  )}>
                    Confirm {actionModal.type === 'reject' ? 'Rejection' : 'Cancellation'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
