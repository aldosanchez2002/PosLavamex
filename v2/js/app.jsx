import React, { useState, useEffect, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { Car, CheckCircle, Calculator, History, Settings, LogOut, Lock, Coffee } from 'lucide-react';

const { AppContext, AppProvider, Button, GreeterView, CashierView, AdminPanel } = window;
const { validatePin, formatCurrency, getLocalDateStr } = window.AppCore;

const LoginScreen = () => {
    const { login } = useContext(AppContext);
    const [pin, setPin] = useState('');
    const handleLogin = () => {
        const role = validatePin(pin);
        if (role) login(role); else { alert('PIN Incorrecto'); setPin(''); }
    };
    return (
        <div className="flex h-screen bg-gray-900 justify-center items-center p-4">
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-sm text-center">
                <h1 className="text-3xl font-bold mb-6 text-gray-800">LAVAMEX POS</h1>
                <div className="flex flex-col gap-4">
                    <input type="password" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="PIN" className="w-full p-4 border rounded-lg text-center text-3xl tracking-widest mb-2" autoFocus />
                    <Button onClick={handleLogin} className="w-full p-4 text-lg">ENTRAR</Button>
                </div>
            </div>
        </div>
    );
};

const HistoryView = () => {
    const { history, tickets, deductions } = useContext(AppContext);
    const todayStr = getLocalDateStr();

    const allPaid = history.concat(tickets.filter(t => t.status === 'PAID'));

    const todayTickets = allPaid.filter(t => {
        const tDate = t.paidAt ? getLocalDateStr(t.paidAt) : getLocalDateStr(t.timestamp);
        return tDate === todayStr;
    });

    const todayDeductions = deductions.filter(d => d.amount > 0 && getLocalDateStr(d.timestamp) === todayStr);

    return (
        <div className="p-4 h-full overflow-auto grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow overflow-hidden h-fit border border-gray-200">
                <div className="p-4 bg-gray-50 border-b font-bold text-gray-700 flex justify-between items-center">
                    <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> Tickets Pagados (Hoy)</div>
                </div>
                <div className="overflow-auto max-h-[60vh] md:max-h-[80vh]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 font-bold text-gray-700 sticky top-0">
                            <tr>
                                <th className="p-3">ID</th>
                                <th className="p-3">Hora</th>
                                <th className="p-3">Descripción</th>
                                <th className="p-3">Servicio</th>
                                <th className="p-3 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {todayTickets.map(t => (
                                <tr key={t.id} className="border-t hover:bg-gray-50">
                                    <td className="p-3 font-mono text-xs">#{t.id.slice(-4).toUpperCase()}</td>
                                    <td className="p-3">{t.timestamp instanceof Date ? t.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}</td>
                                    <td className="p-3 font-bold text-gray-700 uppercase">{t.vehicleDesc || '-'}</td>
                                    <td className="p-3">
                                        <div className="font-medium">{t.service?.label || 'Extras'}</div>
                                        {t.snackCount > 0 && <span className="text-xs text-orange-600 font-bold block">(+{t.snackCount} Snacks)</span>}
                                    </td>
                                    <td className="p-3 font-bold text-green-600 text-right">{formatCurrency(t.price)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="bg-white rounded-xl shadow overflow-hidden h-fit border border-gray-200">
                <div className="p-4 bg-gray-50 border-b font-bold text-gray-700 flex justify-between items-center"><span>Deducciones (Hoy)</span><Coffee className="w-4 h-4 text-orange-500" /></div>
                <div className="overflow-auto max-h-[60vh] md:max-h-[80vh]">
                    <table className="w-full text-sm text-left"><thead className="bg-orange-50 font-bold text-orange-800 sticky top-0"><tr><th className="p-3">Fecha</th><th className="p-3">Empleado</th><th className="p-3">Detalle</th><th className="p-3 text-right">Monto</th></tr></thead><tbody>{todayDeductions.map(d => <tr key={d.id} className="border-t hover:bg-orange-50"><td className="p-3">{d.timestamp instanceof Date ? d.timestamp.toLocaleDateString() : '...'}</td><td className="p-3 font-bold">{d.employee}</td><td className="p-3 text-gray-600 italic">{d.description || 'Snack'}</td><td className="p-3 font-bold text-red-500 text-right">-{formatCurrency(d.amount)}</td></tr>)}</tbody></table>
                </div>
            </div>
        </div>
    );
};

const LavamexPOS = () => {
    const { role, view, setView, logout } = useContext(AppContext);
    const [isLocked, setIsLocked] = useState(false);

    useEffect(() => {
        const checkTime = () => {
            const now = new Date();
            const hours = now.getHours();
            const outsideHours = hours < 7 || hours >= 19;
            setIsLocked(false);
        };

        checkTime();
        const interval = setInterval(checkTime, 60000);
        return () => clearInterval(interval);
    }, [role]);

    if (!role) return <LoginScreen />;

    if (isLocked) return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-900 text-white p-4">
            <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl text-center max-w-md w-full border border-gray-700">
                <div className="bg-red-900/30 p-4 rounded-full w-fit mx-auto mb-6">
                    <Lock size={48} className="text-red-500" />
                </div>
                <h1 className="text-2xl font-bold mb-2">El sistema está bloqueado</h1>
                <Button onClick={logout} variant="danger" className="w-full py-3">
                    <LogOut className="mr-2" size={18} /> Cerrar Sesión
                </Button>
            </div>
        </div>
    );

    return (
        <div className="h-[100dvh] flex flex-col bg-gray-100 font-sans">
            <header className="bg-slate-900 text-white p-3 flex justify-between items-center shadow-md shrink-0 z-50">
                <a href="https://lavamex.work/menu" className="flex items-center gap-2 font-bold text-lg md:text-xl truncate hover:opacity-80 transition-opacity">
                    <Car className="text-blue-400 shrink-0" /> <span>LAVAMEX</span>
                </a>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    <button onClick={() => setView('GREETER')} className={`px-3 py-2 rounded flex gap-2 items-center text-sm font-bold whitespace-nowrap transition-colors ${view === 'GREETER' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}><CheckCircle size={18} /> <span className="hidden sm:inline">Entrada</span></button>
                    {(role === 'CASHIER' || role === 'ADMIN') && <><button onClick={() => setView('CASHIER')} className={`px-3 py-2 rounded flex gap-2 items-center text-sm font-bold whitespace-nowrap transition-colors ${view === 'CASHIER' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}><Calculator size={18} /> <span className="hidden sm:inline">Caja</span></button><button onClick={() => setView('HISTORY')} className={`px-3 py-2 rounded flex gap-2 items-center text-sm font-bold whitespace-nowrap transition-colors ${view === 'HISTORY' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}><History size={18} /> <span className="hidden sm:inline">Historial</span></button></>}
                    {role === 'ADMIN' && <button onClick={() => setView('ADMIN')} className={`px-3 py-2 rounded flex gap-2 items-center text-sm font-bold whitespace-nowrap transition-colors ${view === 'ADMIN' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}><Settings size={18} /> <span className="hidden sm:inline">Admin</span></button>}
                    <button onClick={logout} className="bg-red-900/80 px-3 rounded ml-2 hover:bg-red-700 shrink-0"><LogOut size={18} /></button>
                </div>
            </header>
            <main className="flex-1 overflow-hidden relative">
                {view === 'GREETER' && <GreeterView />}
                {view === 'CASHIER' && <CashierView />}
                {view === 'HISTORY' && <HistoryView />}
                {view === 'ADMIN' && <AdminPanel />}
            </main>
        </div>
    );
};

window.addEventListener('load', () => {
    const root = createRoot(document.getElementById('root'));
    root.render(<AppProvider><LavamexPOS /></AppProvider>);
});