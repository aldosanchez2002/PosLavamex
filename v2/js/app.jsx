import React, { useState, useEffect, useContext, createContext } from 'react';
import { createRoot } from 'react-dom/client';
import { User, DollarSign, Car, CheckCircle, FileText, Settings, Trash2, LogOut, Users, Calculator, Printer, Wifi, Lock, Archive, Pencil, PlusCircle, Coffee, History, ArrowLeft, Save, UserCheck, Activity, Database, PlayCircle, AlertTriangle, Upload, Loader2, Calendar, CreditCard, TrendingUp, Banknote, TrendingDown, AlertCircle, Check, X, Briefcase, Clock, EyeOff, ClipboardList, ShieldCheck, UserCog, Zap } from 'lucide-react';
import { collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp, writeBatch, setDoc, getDocs, where, deleteDoc, limit } from 'firebase/firestore';

// Attach global methods from core
const { db, SIZES, SERVICES, DEFAULTS, handleDbAction, formatCurrency, getLocalDateStr, getMonthStr, calculateTicketTotals, calculatePayroll, validatePin, toggleSelection, PrintService } = window.AppCore;

const AppContext = createContext();

const AppProvider = ({ children }) => {
    // ... Copy the exact React Context implementation from original index.html ...
    // State definitions
    const [role, setRole] = useState(() => localStorage.getItem('lavamex_role') || null);
    const [view, setView] = useState('GREETER');
    // ... [Add rest of AppProvider exactly as original] ...

    const value = { role, view, setView, /* ... rest of context values ... */ };
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

const Button = ({ onClick, children, variant = 'primary', className = '', ...props }) => {
    const base = "p-3 rounded-xl font-bold transition-transform active:scale-95 shadow-sm flex items-center justify-center gap-2";
    const styles = { primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300", danger: "bg-red-100 text-red-700 border border-red-200 hover:bg-red-200", secondary: "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50", success: "bg-green-600 text-white hover:bg-green-700", warning: "bg-orange-100 text-orange-700 border border-orange-200 hover:bg-orange-200", ghost: "bg-transparent text-gray-500 hover:bg-gray-100", blueLight: "bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200", orangeLight: "bg-orange-100 text-orange-700 border border-orange-200 hover:bg-orange-200" };
    return <button onClick={onClick} className={`${base} ${styles[variant] || styles.primary} ${className}`} {...props}>{children}</button>;
};

const Modal = ({ title, onClose, children, icon: Icon, footer }) => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm">
            <h3 className="font-bold mb-4 text-lg text-gray-800 flex items-center">{Icon && <Icon className="mr-2" />} {title}</h3>
            <div className="mb-6">{children}</div>
            {footer ? footer : <button onClick={onClose} variant="secondary" className="w-full">Cerrar</button>}
        </div>
    </div>
);

// ... Add LoginScreen, GreeterView, CashierView, HistoryView, AdminPanel components exactly as original ...

const LavamexPOS = () => {
    const { role, view, setView, logout } = useContext(AppContext);
    // ... LavamexPOS logic
    if (!role) return <LoginScreen />;
    return (
        <div className="h-[100dvh] flex flex-col bg-gray-100 font-sans">
            <header className="bg-slate-900 text-white p-3 flex justify-between items-center shadow-md shrink-0 z-50">
                <a href="https://lavamex.work/menu" className="flex items-center gap-2 font-bold text-lg md:text-xl truncate hover:opacity-80 transition-opacity">
                    <Car className="text-blue-400 shrink-0" /> <span>LAVAMEX</span>
                </a>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {/* Header buttons */}
                </div>
            </header>
            <main className="flex-1 overflow-hidden relative">
                {/* View Routing */}
            </main>
        </div>
    );
};

// Wait for DOM
window.addEventListener('load', () => {
    const root = createRoot(document.getElementById('root'));
    root.render(<AppProvider><LavamexPOS /></AppProvider>);
});