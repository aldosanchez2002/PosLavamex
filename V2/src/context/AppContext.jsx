import React, { useState, useEffect, useContext, createContext } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    getFirestore, collection, addDoc, updateDoc, doc, onSnapshot,
    query, orderBy, serverTimestamp, writeBatch, setDoc, getDocs,
    where, deleteDoc, limit
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { DEFAULTS, SIZES, SERVICES } from '../config/constants';
import { PrintService } from '../services/PrintService';
import { calculateTicketTotals, getLocalDateStr } from '../utils/helpers';

export const AppContext = createContext();

export const AppProvider = ({ children }) => {
    const [role, setRole] = useState(() => localStorage.getItem('lavamex_role') || null);
    const [view, setView] = useState('GREETER');
    const [employees, setEmployees] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [history, setHistory] = useState([]);
    const [deductions, setDeductions] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [businessExpenses, setBusinessExpenses] = useState([]);
    const [cashCounts, setCashCounts] = useState([]);
    const [cashDrops, setCashDrops] = useState([]);
    const [cashIns, setCashIns] = useState([]);
    const [editingTicket, setEditingTicket] = useState(null);

    const [exRate, setExRate] = useState(DEFAULTS.EXCHANGE_RATE);
    const [snackPrice, setSnackPrice] = useState(DEFAULTS.SNACK_PRICE);
    const [prices, setPrices] = useState({});
    const [commissions, setCommissions] = useState({});
    const [extrasList, setExtrasList] = useState([]);

    const [payment, setPayment] = useState({ mxn: '', usd: '' });
    const [activeId, setActiveId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleDbAction = async (actionFn) => {
        try {
            await actionFn();
        } catch (e) {
            alert("Error: " + e.message);
            console.error(e);
        }
    };

    const login = (r) => {
        setRole(r);
        localStorage.setItem('lavamex_role', r);
        if (r) setView(r === 'ADMIN' ? 'ADMIN' : (r === 'CASHIER' ? 'CASHIER' : 'GREETER'));
    };

    const logout = () => {
        setRole(null);
        localStorage.removeItem('lavamex_role');
        setView('GREETER');
    };

    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, "employees"), orderBy("name")), (snap) => {
            if (snap.empty && employees.length === 0) {
                DEFAULTS.INITIAL_EMPLOYEES.forEach(e => addDoc(collection(db, "employees"), e));
            }
            setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => !e.archived));
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        const unsubP = onSnapshot(doc(db, "settings", "prices"), (docSnap) => {
            if (docSnap.exists()) setPrices(docSnap.data());
            else setDoc(doc(db, "settings", "prices"), DEFAULTS.PRICES);
        });
        const unsubC = onSnapshot(doc(db, "settings", "commissions"), (docSnap) => {
            if (docSnap.exists()) setCommissions(docSnap.data());
            else setDoc(doc(db, "settings", "commissions"), DEFAULTS.COMMISSIONS);
        });
        const unsubE = onSnapshot(collection(db, "extras"), (snap) => {
            const dbItems = snap.docs.map(d => ({ ...d.data(), docId: d.id }));
            const cleanList = DEFAULTS.EXTRAS.map(def => {
                const match = dbItems.find(item => item.id === def.id);
                return match ? { ...def, ...match } : def;
            });
            setExtrasList(cleanList);
            if (snap.empty) DEFAULTS.EXTRAS.forEach(e => addDoc(collection(db, "extras"), e));
        });
        const unsubG = onSnapshot(doc(db, "settings", "general"), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.exchangeRate) setExRate(data.exchangeRate);
                if (data.snackPrice) setSnackPrice(data.snackPrice);
            } else {
                setDoc(doc(db, "settings", "general"), {
                    exchangeRate: DEFAULTS.EXCHANGE_RATE,
                    snackPrice: DEFAULTS.SNACK_PRICE,
                });
            }
        });
        return () => { unsubP(); unsubC(); unsubE(); unsubG(); };
    }, []);

    useEffect(() => {
        const qT = query(collection(db, "tickets"), orderBy("timestamp", "desc"));
        const unsubT = onSnapshot(qT, (snap) => {
            const active = [], hist = [];
            snap.forEach(d => {
                const dat = {
                    id: d.id, ...d.data(),
                    timestamp: d.data().timestamp?.toDate() || new Date(),
                    paidAt: d.data().paidAt?.toDate() || null
                };
                if (dat.status === 'PENDING') active.push(dat);
                else hist.push(dat);
            });
            setTickets(active);
            setHistory(hist);
        });
        const unsubD = onSnapshot(collection(db, "deductions"), (snap) => {
            setDeductions(snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id, ...data,
                    timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp || new Date())
                };
            }));
        });
        const qE = query(collection(db, "expenses"), orderBy("timestamp", "desc"));
        const unsubE = onSnapshot(qE, (snap) => {
            setExpenses(snap.docs.map(d => ({
                id: d.id, ...d.data(),
                timestamp: d.data().timestamp?.toDate() || new Date()
            })));
        });
        const qBE = query(collection(db, "business_expenses"), orderBy("timestamp", "desc"));
        const unsubBE = onSnapshot(qBE, (snap) => {
            setBusinessExpenses(snap.docs.map(d => ({
                id: d.id, ...d.data(),
                timestamp: d.data().timestamp?.toDate() || new Date()
            })));
        });
        const qCC = query(collection(db, "cash_counts"), orderBy("timestamp", "desc"), limit(50));
        const unsubCC = onSnapshot(qCC, (snap) => {
            setCashCounts(snap.docs.map(d => ({
                id: d.id, ...d.data(),
                timestamp: d.data().timestamp?.toDate() || new Date()
            })));
        });
        const qCD = query(collection(db, "cash_drops"), orderBy("timestamp", "desc"));
        const unsubCD = onSnapshot(qCD, (snap) => {
            setCashDrops(snap.docs.map(d => ({
                id: d.id, ...d.data(),
                timestamp: d.data().timestamp?.toDate() || new Date()
            })));
        });
        const qCI = query(collection(db, "cash_ins"), orderBy("timestamp", "desc"));
        const unsubCI = onSnapshot(qCI, (snap) => {
            setCashIns(snap.docs.map(d => ({
                id: d.id, ...d.data(),
                timestamp: d.data().timestamp?.toDate() || new Date()
            })));
        });
        return () => { unsubT(); unsubD(); unsubE(); unsubBE(); unsubCC(); unsubCD(); unsubCI(); };
    }, []);

    const updateGlobalSettings = (newRate, newSnackPrice) => handleDbAction(async () => {
        await setDoc(doc(db, "settings", "general"), {
            exchangeRate: newRate, snackPrice: newSnackPrice
        }, { merge: true });
    });

    const getOpeningCash = (targetDate) => {
        if (!cashCounts || cashCounts.length === 0) return { mxn: 0, usd: 0 };
        const prevCount = cashCounts.find(c => c.timestamp < targetDate);
        if (prevCount) return { mxn: prevCount.declaredMxn || 0, usd: prevCount.declaredUsd || 0 };
        return { mxn: 0, usd: 0 };
    };

    const saveTicket = (data) => handleDbAction(async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const snacks = editingTicket ? (editingTicket.snackCount || 0) : 0;
            const serviceId = data.service ? data.service.id : null;
            const sizeId = data.size ? data.size.id : null;
            const totals = calculateTicketTotals(serviceId, sizeId, data.extras, prices, commissions, snacks, snackPrice);
            const ticketData = {
                ...data, price: totals.totalPrice, commission: totals.totalCommission, basePrice: totals.basePrice,
                snackCount: snacks, status: 'PENDING', timestamp: serverTimestamp()
            };

            if (editingTicket) {
                await updateDoc(doc(db, "tickets", editingTicket.id), ticketData);
                setEditingTicket(null);
                if (role === 'CASHIER') setView('CASHIER');
            } else {
                const ref = await addDoc(collection(db, "tickets"), ticketData);
                const html = PrintService.getJobTicketHtml({ ...ticketData, timestamp: new Date() }, ref.id.slice(-4).toUpperCase());
                PrintService.print(html, role);
            }
        } finally { setIsSubmitting(false); }
    });

    const updateSnacks = (id, count) => handleDbAction(async () => {
        const t = tickets.find(x => x.id === id); if (!t) return;
        const newCount = Math.max(0, count);
        const totals = calculateTicketTotals(t.service?.id, t.size?.id, t.extras || [], prices, commissions, newCount, snackPrice);
        await updateDoc(doc(db, "tickets", id), { snackCount: newCount, price: totals.totalPrice });
    });

    const updateQuickItem = (ticketId, type, change) => handleDbAction(async () => {
        const t = tickets.find(x => x.id === ticketId); if (!t) return;
        if (type === 'SNACKS') {
            const newCount = Math.max(0, (t.snackCount || 0) + change);
            const totals = calculateTicketTotals(t.service?.id, t.size?.id, t.extras || [], prices, commissions, newCount, snackPrice);
            await updateDoc(doc(db, "tickets", ticketId), { snackCount: newCount, price: totals.totalPrice });
            return;
        }
        let newExtras = [...(t.extras || [])];
        const targetId = type === 'PINO' ? 'QA_PINO' : 'QA_BOLEADA';
        const label = type === 'PINO' ? 'Pino (Caja)' : 'Boleada (Caja)';
        const dbExtra = extrasList.find(e => e.id === (type === 'PINO' ? 'PINO' : 'BOLEADA'));
        const price = dbExtra ? dbExtra.price : (type === 'PINO' ? 35 : 60);

        if (change > 0) newExtras.push({ id: targetId, label, price, commission: 0 });
        else {
            let idx = -1;
            for (let i = newExtras.length - 1; i >= 0; i--) {
                if (newExtras[i].id === targetId) { idx = i; break; }
            }
            if (idx !== -1) newExtras.splice(idx, 1); else return;
        }
        const totals = calculateTicketTotals(t.service?.id, t.size?.id, newExtras, prices, commissions, t.snackCount || 0, snackPrice);
        await updateDoc(doc(db, "tickets", ticketId), { extras: newExtras, price: totals.totalPrice, commission: totals.totalCommission });
    });

    const saveBatchAttendance = (updates) => handleDbAction(async () => {
        const batch = writeBatch(db);
        const dateKey = getLocalDateStr();
        const monthKey = dateKey.slice(0, 7);
        const records = {};
        Object.values(updates).forEach(item => {
            records[item.name] = item.active;
            if (item.id) batch.update(doc(db, "employees", item.id), { active: item.active });
        });
        batch.set(doc(db, "attendance", dateKey), { date: dateKey, month: monthKey, records: records }, { merge: true });
        await batch.commit();
    });

    const addCashCount = (data) => handleDbAction(async () => {
        await addDoc(collection(db, "cash_counts"), { ...data, timestamp: serverTimestamp() });
    });

    const addCashDrop = (amountMxn, amountUsd) => handleDbAction(async () => {
        const timestamp = new Date();
        const code = `DROP-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const dropData = { amountMxn: parseFloat(amountMxn) || 0, amountUsd: parseFloat(amountUsd) || 0, timestamp: serverTimestamp(), user: role, code, status: 'PENDING_PICKUP' };
        await addDoc(collection(db, "cash_drops"), dropData);
        const html = PrintService.getCashDropTicketHtml({ ...dropData, timestamp });
        PrintService.print(html, role);
        alert(`Retiro Registrado: ${code}`);
    });

    const addCashIn = (amountMxn, amountUsd, reason) => handleDbAction(async () => {
        await addDoc(collection(db, "cash_ins"), { amountMxn: parseFloat(amountMxn) || 0, amountUsd: parseFloat(amountUsd) || 0, reason: reason || 'Ingreso Extra', user: role, timestamp: serverTimestamp() });
        alert("Efectivo agregado exitosamente.");
    });

    const addEmployee = (name) => handleDbAction(() => addDoc(collection(db, "employees"), { name, active: true, role: 'WASHER' }));
    const updateEmployee = (id, data) => handleDbAction(() => updateDoc(doc(db, "employees", id), data));
    const archiveEmployee = (id) => handleDbAction(() => updateDoc(doc(db, "employees", id), { archived: true }));
    const deleteTicket = (id) => handleDbAction(async () => { if (confirm("¿Seguro que deseas borrar este ticket?")) await updateDoc(doc(db, "tickets", id), { status: 'CANCELLED' }); });
    const addDeduction = (employee, amount, description) => handleDbAction(() => addDoc(collection(db, "deductions"), { employee, amount: parseFloat(amount), description, status: 'PENDING', timestamp: serverTimestamp() }));
    const addExpense = (desc, amount) => handleDbAction(async () => { await addDoc(collection(db, "expenses"), { description: desc, amount: parseFloat(amount), status: 'PENDING', createdBy: role, timestamp: serverTimestamp() }); alert("Gasto registrado, pendiente de aprobación."); });
    const addBusinessExpense = (desc, amount) => handleDbAction(async () => { await addDoc(collection(db, "business_expenses"), { description: desc, amount: parseFloat(amount), timestamp: serverTimestamp(), createdBy: role }); alert("Gasto administrativo registrado (externo)."); });
    const updateExpense = (id, data) => handleDbAction(() => updateDoc(doc(db, "expenses", id), data));
    const resolveExpense = (id, status) => handleDbAction(() => updateDoc(doc(db, "expenses", id), { status: status, processedAt: serverTimestamp(), processedBy: role }));

    const processPayment = () => handleDbAction(async () => {
        if (isSubmitting) return;
        const t = tickets.find(x => x.id === activeId); if (!t) return;
        const isExceptionOnly = !t.service && t.extras?.length > 0 && t.extras.every(e => ['PINO', 'SNACKS', 'QA_PINO', 'QA_BOLEADA'].includes(e.id));
        if ((!t.washers || t.washers.length === 0) && !isExceptionOnly) return alert("Error: No se puede cobrar. Asigne lavadores antes de cobrar.");
        
        const mxnVal = parseFloat(payment.mxn) || 0;
        const usdVal = parseFloat(payment.usd) || 0;
        const isOnlyUsd = usdVal > 0 && mxnVal === 0;
        const total = mxnVal + (usdVal * exRate);
        if (total < t.price) return alert("Falta dinero");

        setIsSubmitting(true);
        try {
            const changeMxn = total - t.price;
            const changeUsd = changeMxn / exRate;
            const details = { mxn: mxnVal, usd: usdVal, rate: exRate, changeMxn, changeUsd, isOnlyUsd, method: 'CASH' };
            await updateDoc(doc(db, "tickets", t.id), { status: 'PAID', paidAt: serverTimestamp(), paymentDetails: details });
            const html = PrintService.getReceiptHtml(t, details, t.id.slice(-4).toUpperCase(), snackPrice);
            PrintService.print(html, role);
            setActiveId(null); setPayment({ mxn: '', usd: '' });
        } finally { setIsSubmitting(false); }
    });

    const processCardPayment = () => handleDbAction(async () => {
        if (isSubmitting) return;
        const t = tickets.find(x => x.id === activeId); if (!t) return;
        const isExceptionOnly = !t.service && t.extras?.length > 0 && t.extras.every(e => ['PINO', 'SNACKS', 'QA_PINO', 'QA_BOLEADA'].includes(e.id));
        if ((!t.washers || t.washers.length === 0) && !isExceptionOnly) return alert("Error: No se puede cobrar. Asigne lavadores antes de cobrar.");
        
        setIsSubmitting(true);
        try {
            const details = { mxn: t.price, usd: 0, rate: exRate, changeMxn: 0, changeUsd: 0, isOnlyUsd: false, method: 'CARD' };
            await updateDoc(doc(db, "tickets", t.id), { status: 'PAID', paidAt: serverTimestamp(), paymentDetails: details });
            const html = PrintService.getReceiptHtml(t, details, t.id.slice(-4).toUpperCase(), snackPrice);
            PrintService.print(html, role);
            setActiveId(null); setPayment({ mxn: '', usd: '' });
        } finally { setIsSubmitting(false); }
    });

    const startEdit = (ticket) => { setEditingTicket(ticket); setView('GREETER'); };
    const cancelEdit = () => { setEditingTicket(null); if (role === 'CASHIER') setView('CASHIER'); };

    const value = {
        role, login, logout, view, setView, employees, tickets, history, deductions, expenses, businessExpenses, cashCounts, cashDrops, cashIns,
        prices, commissions, extrasList, exRate, snackPrice, updateGlobalSettings, editingTicket, startEdit, cancelEdit, activeId, setActiveId, payment, setPayment,
        saveTicket, updateSnacks, updateQuickItem, saveBatchAttendance, addEmployee, archiveEmployee, deleteTicket, addDeduction, addExpense, addBusinessExpense, updateExpense, resolveExpense, processPayment, processCardPayment, addCashCount, addCashDrop, addCashIn, updateEmployee, getOpeningCash, db, isSubmitting
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
