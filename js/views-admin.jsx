import React, { useState, useEffect, useContext } from 'react';
import { Users, FileText, Calendar, PlusCircle, UserCog, EyeOff, Upload, Briefcase, Banknote, TrendingUp, ShieldCheck, CreditCard, AlertTriangle, Printer, Save, X, Check, ClipboardList } from 'lucide-react';
import { collection, addDoc, doc, writeBatch, getDocs, query, where } from 'firebase/firestore';

const { AppContext, Button, Modal } = window;
const { formatCurrency, getLocalDateStr, getMonthStr, calculatePayroll, PdfService, SIZES, SERVICES, handleDbAction } = window.AppCore;

const AdminCorte = () => {
    const { history, tickets, expenses, deductions, exRate, updateExpense, resolveExpense, cashCounts, cashDrops, cashIns, getOpeningCash, setView } = useContext(AppContext);
    const [corteMode, setCorteMode] = useState('DAY');
    const [corteDate, setCorteDate] = useState(getLocalDateStr());
    const [corteMonth, setCorteMonth] = useState(getMonthStr());
    const [editingExpenseId, setEditingExpenseId] = useState(null);
    const [editExpDesc, setEditExpDesc] = useState('');
    const [editExpAmt, setEditExpAmt] = useState('');

    const allPaidForCorte = history.concat(tickets.filter(t => t.status === 'PAID'));

    const corteTickets = allPaidForCorte.filter(t => {
        const d = new Date(t.paidAt ? t.paidAt : t.timestamp);
        return corteMode === 'DAY' ? getLocalDateStr(d) === corteDate : getMonthStr(d) === corteMonth;
    });

    const corteExpenses = expenses.filter(e => {
        const d = new Date(e.timestamp);
        return corteMode === 'DAY' ? getLocalDateStr(d) === corteDate : getMonthStr(d) === corteMonth;
    });

    const corteDrops = cashDrops.filter(d => {
        const dte = new Date(d.timestamp);
        return corteMode === 'DAY' ? getLocalDateStr(dte) === corteDate : getMonthStr(dte) === corteMonth;
    });

    const corteCashIns = cashIns.filter(d => {
        const dte = new Date(d.timestamp);
        return corteMode === 'DAY' ? getLocalDateStr(dte) === corteDate : getMonthStr(dte) === corteMonth;
    });

    const corteDeductions = deductions.filter(d => {
        const dte = new Date(d.timestamp);
        return corteMode === 'DAY' ? getLocalDateStr(dte) === corteDate : getMonthStr(dte) === corteMonth;
    });

    const calculateItemStats = () => {
        const stats = {
            snacks: { customerCount: 0, internalCount: 0, totalCount: 0, moneyCustomer: 0, moneyInternal: 0 },
            pinos: { count: 0, money: 0 },
            boleadas: { count: 0, money: 0 }
        };

        corteTickets.forEach(t => {
            if (t.extras && Array.isArray(t.extras)) {
                t.extras.forEach(e => {
                    if (['PINO', 'QA_PINO'].includes(e.id)) {
                        stats.pinos.count += 1;
                        stats.pinos.money += (e.price || 0);
                    }
                    if (['BOLEADA', 'QA_BOLEADA'].includes(e.id)) {
                        stats.boleadas.count += 1;
                        stats.boleadas.money += (e.price || 0);
                    }
                });
            }

            if (t.snackCount > 0) {
                stats.snacks.customerCount += t.snackCount;
                const extrasTotal = (t.extras || []).reduce((a, b) => a + (b.price || 0), 0);
                const serviceTotal = t.basePrice || 0;
                const impliedSnackRevenue = (t.price || 0) - serviceTotal - extrasTotal;
                stats.snacks.moneyCustomer += Math.max(0, impliedSnackRevenue);
            }
        });

        corteDeductions.forEach(d => {
            const desc = (d.description || '').toLowerCase().trim();
            if (desc === 'snack' || desc === 'snacks') {
                stats.snacks.internalCount += 1;
                stats.snacks.moneyInternal += (d.amount || 0);
            }
        });

        stats.snacks.totalCount = stats.snacks.customerCount + stats.snacks.internalCount;

        return stats;
    };
    const itemStats = calculateItemStats();

    const calculateCorteTotals = () => {
        let revenueCard = 0;
        let revenueCashTickets = 0;
        let netMxnFlow = 0;
        let netUsdFlow = 0;

        corteTickets.forEach(t => {
            if (t.paymentDetails?.method === 'CARD') {
                revenueCard += t.price;
            } else {
                revenueCashTickets += t.price;

                const pay = t.paymentDetails || { mxn: 0, usd: 0, changeMxn: 0, changeUsd: 0, isOnlyUsd: false };

                const mxnIn = parseFloat(pay.mxn) || 0;
                const usdIn = parseFloat(pay.usd) || 0;

                let mxnOut = 0;
                let usdOut = 0;

                if (pay.isOnlyUsd) {
                    usdOut = parseFloat(pay.changeUsd) || 0;
                } else {
                    mxnOut = parseFloat(pay.changeMxn) || 0;
                }

                netMxnFlow += (mxnIn - mxnOut);
                netUsdFlow += (usdIn - usdOut);
            }
        });

        const approvedExpensesTotal = corteExpenses.filter(e => e.status === 'APPROVED').reduce((a, b) => a + (b.amount || 0), 0);

        let startDateObj;
        if (corteMode === 'DAY') {
            startDateObj = new Date(corteDate + 'T00:00:00');
        } else {
            startDateObj = new Date(corteMonth + '-01T00:00:00');
        }
        const openingCash = getOpeningCash(startDateObj);
        const initMxn = openingCash.mxn;
        const initUsd = openingCash.usd;

        const dropsMxn = corteDrops.reduce((a, b) => a + (b.amountMxn || 0), 0);
        const dropsUsd = corteDrops.reduce((a, b) => a + (b.amountUsd || 0), 0);

        const cashInsMxn = corteCashIns.reduce((a, b) => a + (b.amountMxn || 0), 0);
        const cashInsUsd = corteCashIns.reduce((a, b) => a + (b.amountUsd || 0), 0);

        return {
            total: revenueCard + revenueCashTickets,
            card: revenueCard,
            cashTotal: revenueCashTickets,
            cashMxn: netMxnFlow, 
            cashUsd: netUsdFlow, 
            expenses: approvedExpensesTotal,
            initialMxn: initMxn,
            initialUsd: initUsd,
            cashNetMxn: (netMxnFlow + initMxn + cashInsMxn) - approvedExpensesTotal - dropsMxn,
            cashNetUsd: netUsdFlow + initUsd + cashInsUsd - dropsUsd,
            dropsMxn,
            dropsUsd,
            cashInsMxn,
            cashInsUsd,
            exchangeRate: exRate
        };
    };
    const corteTotals = calculateCorteTotals();

    const printCorte = () => {
        const relevantArqueos = cashCounts.filter(c => {
            const d = new Date(c.timestamp);
            return corteMode === 'DAY' ? getLocalDateStr(d) === corteDate : getMonthStr(d) === corteMonth;
        }).sort((a, b) => a.timestamp - b.timestamp);

        const data = {
            type: corteMode === 'DAY' ? 'Diario' : 'Mensual',
            dateLabel: corteMode === 'DAY' ? corteDate : corteMonth,
            totals: corteTotals,
            tickets: corteTickets,
            expenses: corteExpenses.filter(e => e.status === 'APPROVED'),
            cashIns: corteCashIns,
            itemStats: itemStats,
            arqueos: {
                first: relevantArqueos.length > 0 ? relevantArqueos[0] : null,
                last: relevantArqueos.length > 0 ? relevantArqueos[relevantArqueos.length - 1] : null
            }
        };
        PdfService.generateCorte(data);
    };

    const saveEditedExpense = () => { if (editingExpenseId) { updateExpense(editingExpenseId, { description: editExpDesc, amount: parseFloat(editExpAmt) || 0 }); setEditingExpenseId(null); } };

    const latestCount = cashCounts.length > 0 ? cashCounts[0] : null;
    const hasRecentDiscrepancy = latestCount && (Math.abs(latestCount.diffMxn) > 1 || Math.abs(latestCount.diffUsd) > 0.1) && getLocalDateStr(latestCount.timestamp) === getLocalDateStr();

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {hasRecentDiscrepancy && (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-sm flex items-start gap-3">
                    <AlertTriangle className="shrink-0 mt-1" />
                    <div>
                        <p className="font-bold">¡Atención! Descuadre en el último corte de caja</p>
                        <p className="text-sm">
                            Hora: {latestCount.timestamp.toLocaleTimeString()} - {latestCount.user}<br />
                            Diferencia: MXN {formatCurrency(latestCount.diffMxn)} / USD ${latestCount.diffUsd.toFixed(2)}
                        </p>
                    </div>
                </div>
            )}

            <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setCorteMode('DAY')} className={`px-3 py-1 rounded-md text-sm font-bold ${corteMode === 'DAY' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Día</button>
                    <button onClick={() => setCorteMode('MONTH')} className={`px-3 py-1 rounded-md text-sm font-bold ${corteMode === 'MONTH' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Mes</button>
                </div>
                <div className="flex items-center gap-2">{corteMode === 'DAY' ? <input type="date" value={corteDate} onChange={e => setCorteDate(e.target.value)} className="font-bold text-lg bg-transparent outline-none border p-2 rounded" /> : <input type="month" value={corteMonth} onChange={e => setCorteMonth(e.target.value)} className="font-bold text-lg bg-transparent outline-none border p-2 rounded" />}</div>
                <Button onClick={printCorte}><Printer size={18} /> PDF</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div onClick={() => setView('HISTORY')} className="cursor-pointer hover:scale-105 transition-transform bg-gradient-to-br from-green-500 to-emerald-600 text-white p-6 rounded-xl shadow-lg"><div className="flex items-center gap-2 mb-1 opacity-90"><TrendingUp size={18} /> Venta Total</div><div className="text-3xl font-bold">{formatCurrency(corteTotals.total)}</div><div className="text-sm opacity-80 mt-1">{corteTickets.length} Tickets</div></div>

                <div onClick={printCorte} className="cursor-pointer hover:scale-105 transition-transform bg-white p-4 rounded-xl shadow border border-gray-100 flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-2 text-gray-500 font-bold text-sm"><Banknote size={18} /> En Caja </div>
                    <div className="mb-2">
                        <div className="flex justify-between items-end">
                            <span className="text-xs text-gray-400 font-bold">MXN</span>
                            <span className="text-2xl font-bold text-blue-900">{formatCurrency(corteTotals.cashNetMxn)}</span>
                        </div>
                        {corteTotals.cashInsMxn > 0 && <div className="text-xs text-green-600 text-right font-bold">Incl. +{formatCurrency(corteTotals.cashInsMxn)} Ingresos</div>}
                    </div>
                    <div className="pt-2 border-t border-dashed">
                        <div className="flex justify-between items-end">
                            <span className="text-xs text-gray-400 font-bold">USD</span>
                            <span className="text-2xl font-bold text-green-700">${corteTotals.cashNetUsd.toFixed(2)}</span>
                        </div>
                        {corteTotals.cashInsUsd > 0 && <div className="text-xs text-green-600 text-right font-bold">Incl. +${corteTotals.cashInsUsd.toFixed(2)} Ingresos</div>}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow border border-gray-100"><div className="flex items-center gap-2 mb-1 text-gray-500 font-bold text-sm"><ShieldCheck size={18} /> Envios/Retiros</div><div className="text-3xl font-bold text-orange-600">{formatCurrency(corteTotals.dropsMxn)}</div><div className="text-xs text-green-600 font-bold mt-1">+ ${corteTotals.dropsUsd.toFixed(2)} USD</div></div>
                <div className="bg-white p-6 rounded-xl shadow border border-gray-100"><div className="flex items-center gap-2 mb-1 text-gray-500 font-bold text-sm"><CreditCard size={18} /> Tarjeta</div><div className="text-3xl font-bold text-blue-600">{formatCurrency(corteTotals.card)}</div></div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
                <h4 className="font-bold text-gray-700 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide"><Briefcase size={16} /> Desglose de Adicionales</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-orange-50 p-4 rounded-lg border border-orange-100 flex flex-col items-center w-full">
                        <div className="text-orange-800 font-bold text-xs uppercase mb-2">Snacks (Total: {itemStats.snacks.totalCount})</div>
                        <div className="w-full flex justify-between text-xs mb-1 px-4 text-gray-600">
                            <span>Cliente:</span>
                            <span className="font-bold text-gray-800">{itemStats.snacks.customerCount}</span>
                        </div>
                        <div className="w-full flex justify-between text-xs mb-3 px-4 text-gray-600 border-b border-orange-200 pb-2">
                            <span>Empleado:</span>
                            <span className="font-bold text-gray-800">{itemStats.snacks.internalCount}</span>
                        </div>
                        <div className="text-xl font-bold text-green-700">{formatCurrency(itemStats.snacks.moneyCustomer + itemStats.snacks.moneyInternal)}</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-100 flex flex-col items-center justify-center">
                        <div className="text-green-800 font-bold text-xs uppercase mb-1">Pinos</div>
                        <div className="text-3xl font-bold text-gray-800">{itemStats.pinos.count}</div>
                        <div className="text-sm text-green-600 font-bold">{formatCurrency(itemStats.pinos.money)}</div>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col items-center justify-center">
                        <div className="text-blue-800 font-bold text-xs uppercase mb-1">Boleadas</div>
                        <div className="text-3xl font-bold text-gray-800">{itemStats.boleadas.count}</div>
                        <div className="text-sm text-green-600 font-bold">{formatCurrency(itemStats.boleadas.money)}</div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow border overflow-hidden">
                <div className="p-4 bg-orange-50 border-b border-orange-100 font-bold text-orange-800 flex justify-between items-center">
                    <span>Retiros de Efectivo (Drops)</span>
                    <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-orange-100 text-orange-800">
                            <tr>
                                <th className="p-3">Código</th>
                                <th className="p-3">Hora</th>
                                <th className="p-3">Usuario</th>
                                <th className="p-3 text-right">Monto MXN</th>
                                <th className="p-3 text-right">Monto USD</th>
                            </tr>
                        </thead>
                        <tbody>
                            {corteDrops.length === 0 ? <tr><td colSpan="5" className="p-4 text-center text-gray-400">No hay retiros registrados en este periodo.</td></tr> : corteDrops.map(d => (
                                <tr key={d.id} className="border-t hover:bg-orange-50">
                                    <td className="p-3 font-mono font-bold text-xs">{d.code}</td>
                                    <td className="p-3">{d.timestamp.toLocaleTimeString()}</td>
                                    <td className="p-3">{d.user}</td>
                                    <td className="p-3 text-right font-bold">{formatCurrency(d.amountMxn)}</td>
                                    <td className="p-3 text-right font-bold text-green-600">${d.amountUsd.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow border overflow-hidden">
                <div className="p-4 bg-gray-50 border-b font-bold text-gray-700 flex justify-between items-center"><span>Gastos</span><span className="text-sm text-red-500 font-bold">Total: {formatCurrency(corteTotals.expenses)}</span></div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-500"><tr><th className="p-3">Concepto</th><th className="p-3">Monto</th><th className="p-3">Estado</th><th className="p-3 text-right">Acción</th></tr></thead><tbody>{corteExpenses.map(e => <tr key={e.id} className="border-t hover:bg-gray-50"><td className="p-3">{editingExpenseId === e.id ? <input value={editExpDesc} onChange={ev => setEditExpDesc(ev.target.value)} className="border p-1 rounded w-full" /> : e.description}</td><td className="p-3 font-bold text-red-600">{editingExpenseId === e.id ? <input type="number" value={editExpAmt} onChange={ev => setEditExpAmt(ev.target.value)} className="border p-1 rounded w-24" /> : `-${formatCurrency(e.amount)}`}</td><td className="p-3"><span className={`px-2 py-1 rounded text-xs font-bold ${e.status === 'APPROVED' ? 'bg-green-100 text-green-700' : (e.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700')}`}>{e.status}</span></td><td className="p-3 text-right">{editingExpenseId === e.id ? <div className="flex justify-end gap-2"><button onClick={saveEditedExpense} className="bg-blue-100 text-blue-700 p-1 rounded hover:bg-blue-200"><Save size={16} /></button><button onClick={() => setEditingExpenseId(null)} className="bg-gray-100 text-gray-700 p-1 rounded hover:bg-gray-200"><X size={16} /></button></div> : <div className="flex justify-end gap-2 items-center">{e.status === 'APPROVED' && <button onClick={() => { setEditingExpenseId(e.id); setEditExpDesc(e.description); setEditExpAmt(e.amount); }} className="text-gray-400 hover:text-blue-500"><Pencil size={14} /></button>}{e.status === 'PENDING' && <><button onClick={() => resolveExpense(e.id, 'APPROVED')} className="bg-green-100 text-green-700 p-1 rounded hover:bg-green-200"><Check size={16} /></button><button onClick={() => resolveExpense(e.id, 'REJECTED')} className="bg-red-100 text-red-700 p-1 rounded hover:bg-red-200"><X size={16} /></button></>}</div>}</td></tr>)}</tbody></table>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow border overflow-hidden">
                <div className="p-4 bg-gray-50 border-b font-bold text-gray-700 flex justify-between items-center">
                    <span>Historial de Arqueos (Últimos 20)</span>
                    <ClipboardList className="w-4 h-4 text-gray-400" />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="p-3">Fecha/Hora</th>
                                <th className="p-3 text-right">Declarado MXN</th>
                                <th className="p-3 text-right">Esperado MXN</th>
                                <th className="p-3 text-right">Dif MXN</th>
                                <th className="p-3 text-right">Declarado USD</th>
                                <th className="p-3 text-right">Esperado USD</th>
                                <th className="p-3 text-right">Dif USD</th>
                                <th className="p-3 text-right">Dif Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cashCounts.map(c => {
                                const rate = c.exchangeRate || exRate;
                                const totalDiffVal = c.diffMxn + (c.diffUsd * rate);
                                const isBad = Math.abs(c.diffMxn) > 1 || Math.abs(c.diffUsd) > 0.1;

                                return (
                                    <tr key={c.id} className={`border-t ${isBad ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                                        <td className="p-3">
                                            <div>{c.timestamp.toLocaleString()}</div>
                                            <div className="text-xs text-gray-400 font-bold">{c.user}</div>
                                        </td>
                                        <td className="p-3 text-right">{formatCurrency(c.declaredMxn)}</td>
                                        <td className="p-3 text-right text-gray-500">{formatCurrency(c.expectedMxn)}</td>
                                        <td className={`p-3 text-right font-bold ${c.diffMxn < 0 ? 'text-red-600' : (c.diffMxn > 0 ? 'text-blue-600' : 'text-gray-400')}`}>{c.diffMxn > 0 ? '+' : ''}{formatCurrency(c.diffMxn)}</td>

                                        <td className="p-3 text-right">${(c.declaredUsd || 0).toFixed(2)}</td>
                                        <td className="p-3 text-right text-gray-500">${(c.expectedUsd || 0).toFixed(2)}</td>
                                        <td className={`p-3 text-right font-bold ${(c.diffUsd || 0) < 0 ? 'text-red-600' : ((c.diffUsd || 0) > 0 ? 'text-blue-600' : 'text-gray-400')}`}>{(c.diffUsd || 0) > 0 ? '+' : ''}${(c.diffUsd || 0).toFixed(2)}</td>

                                        <td className={`p-3 text-right font-black ${totalDiffVal < 0 ? 'text-red-700' : 'text-green-700'}`}>{formatCurrency(totalDiffVal)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const AdminNomina = () => {
    const { employees, history, deductions, commissions, extrasList, db, tickets } = useContext(AppContext);
    const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; });
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

    const [previewData, setPreviewData] = useState(null);
    const [previewName, setPreviewName] = useState(null);

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59.999');

    const filterRange = (ts) => { if (!ts) return true; const date = new Date(ts.toDate ? ts.toDate() : ts); return date >= start && date <= end; };

    const rangeHistory = history.filter(t => t.status === 'PAID' && filterRange(t.timestamp));
    const rangeDeductions = deductions.filter(d => d.status === 'PENDING' && filterRange(d.timestamp));
    const payroll = calculatePayroll(employees, rangeHistory, rangeDeductions, commissions, extrasList);
    const totalNomina = Object.values(payroll).reduce((acc, p) => acc + p.netPay, 0);

    const printNomina = () => {
        PdfService.generateNomina(payroll, startDate, endDate, rangeHistory);
    };

    const closeWeek = async () => { if (!confirm("¿Archivar semana?")) return; const batch = writeBatch(db); rangeHistory.forEach(t => batch.update(doc(db, "tickets", t.id), { status: 'ARCHIVED' })); rangeDeductions.forEach(d => batch.update(doc(db, "deductions", d.id), { status: 'ARCHIVED' })); await batch.commit(); alert("Semana Cerrada"); };

    return (
        <div>
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 rounded-xl shadow-lg mb-6 flex justify-between items-center">
                <div><h2 className="text-2xl font-bold m-0 flex items-center gap-2"><Users className="w-6 h-6" /> Total Nómina</h2></div>
                <div className="text-4xl font-bold">{formatCurrency(totalNomina)}</div>
            </div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
                <div className="flex flex-wrap gap-3 items-end">
                    <div><label className="text-xs font-bold text-gray-500 block mb-1">Inicio</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border p-2 rounded-lg bg-gray-50" /></div>
                    <div><label className="text-xs font-bold text-gray-500 block mb-1">Fin</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border p-2 rounded-lg bg-gray-50" /></div>
                    <Button onClick={printNomina} variant="success"><Printer className="w-4 h-4" /> PDF</Button>
                </div>
                <Button onClick={closeWeek} variant="danger"><Archive className="w-4 h-4" /> CERRAR SEMANA</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.keys(payroll).map(name => (
                    <div key={name} onClick={() => { setPreviewData(payroll[name]); setPreviewName(name); }} className="bg-white p-5 rounded-xl shadow-sm border border-l-4 border-l-blue-500 cursor-pointer hover:shadow-md transition-all hover:bg-blue-50/30">
                        <div className="font-bold text-xl text-gray-800 mb-1">{name}</div>
                        <div className="text-3xl font-bold text-green-700">{formatCurrency(payroll[name].netPay)}</div>
                        <div className="text-sm text-gray-500 mt-2 flex justify-between border-t pt-2"><span>Com: {formatCurrency(payroll[name].total)}</span><span className="text-red-500 font-medium">Ded: {formatCurrency(payroll[name].deductionTotal)}</span></div>
                    </div>
                ))}
            </div>

            {previewData && (
                <Modal title={`Nómina: ${previewName}`} icon={FileText} onClose={() => { setPreviewData(null); setPreviewName(null); }}
                    footer={<Button onClick={() => { setPreviewData(null); setPreviewName(null); }} variant="secondary" className="w-full">Cerrar</Button>}>
                    <div className="space-y-4">
                        <div className="bg-gray-50 p-4 rounded-lg border flex justify-between items-center">
                            <div>
                                <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Total a Pagar</div>
                                <div className="text-3xl font-bold text-green-700">{formatCurrency(previewData.netPay)}</div>
                            </div>
                            <div className="text-right text-xs">
                                <div className="text-gray-600 font-medium">Ingresos: {formatCurrency(previewData.total)}</div>
                                <div className="text-red-500 font-medium">Deducciones: -{formatCurrency(previewData.deductionTotal)}</div>
                            </div>
                        </div>

                        <div>
                            <h4 className="font-bold text-xs uppercase text-gray-500 mb-2 border-b pb-1">Desglose de Servicios</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="p-1">Svc</th>
                                            {SIZES.map(s => <th key={s.id} className="p-1 text-center">{s.label.substring(0, 3)}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {SERVICES.map(svc => {
                                            const rowCounts = SIZES.map(sz => previewData.serviceGrid[svc.id][sz.id] || 0);
                                            if (!rowCounts.some(c => c > 0)) return null;
                                            return (
                                                <tr key={svc.id} className="border-b last:border-0 hover:bg-gray-50">
                                                    <td className="p-1 font-medium">{svc.label}</td>
                                                    {rowCounts.map((c, i) => <td key={i} className="p-1 text-center text-gray-600">{c || '-'}</td>)}
                                                </tr>
                                            )
                                        })}
                                        {!SERVICES.some(svc => SIZES.some(sz => (previewData.serviceGrid[svc.id][sz.id] || 0) > 0)) && (
                                            <tr><td colSpan="5" className="p-2 text-center text-gray-400 italic">Sin servicios de lavado registrados</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {Object.keys(previewData.extrasData).length > 0 && (
                            <div>
                                <h4 className="font-bold text-xs uppercase text-blue-500 mb-2 border-b pb-1 mt-4">Comisiones Extra</h4>
                                <table className="w-full text-xs">
                                    <tbody>
                                        {Object.keys(previewData.extrasData).sort().map(k => (
                                            <tr key={k} className="border-b last:border-0">
                                                <td className="p-1">{k}</td>
                                                <td className="p-1 text-center text-gray-500">x{previewData.extrasData[k].count}</td>
                                                <td className="p-1 text-right font-bold text-gray-700">{formatCurrency(previewData.extrasData[k].total)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {previewData.deductionDetails.length > 0 && (
                            <div>
                                <h4 className="font-bold text-xs uppercase text-red-500 mb-2 border-b pb-1 mt-4">Deducciones</h4>
                                <table className="w-full text-xs">
                                    <tbody>
                                        {previewData.deductionDetails.map((d, i) => (
                                            <tr key={i} className="border-b last:border-0">
                                                <td className="p-1">{d.desc || 'Varios'}</td>
                                                <td className="p-1 text-right text-red-600 font-medium">-{formatCurrency(d.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
};

const AdminAsistencia = () => {
    const { db, employees } = useContext(AppContext);
    const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));

    const generateAttendanceReport = async () => {
        const q = query(collection(db, "attendance"), where("month", "==", reportMonth));
        const snapshot = await getDocs(q);
        const attendanceData = {};
        snapshot.forEach(doc => { attendanceData[doc.id] = doc.data().records; });

        const daysInMonth = new Date(reportMonth.split('-')[0], reportMonth.split('-')[1], 0).getDate();
        PdfService.generateAttendance(reportMonth, employees, attendanceData, daysInMonth);
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-lg mx-auto">
            <h3 className="font-bold mb-4 text-gray-800 flex items-center"><Calendar className="mr-2" /> Reporte de Asistencia</h3>
            <div className="mb-4"><label className="block text-sm font-bold text-gray-600 mb-2">Mes</label><input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="border p-3 rounded-lg w-full text-lg" /></div>
            <Button onClick={generateAttendanceReport} className="w-full">Descargar PDF Mensual</Button>
        </div>
    );
};

const AdminConfig = () => {
    const { exRate, snackPrice, updateGlobalSettings, employees, addEmployee, archiveEmployee, updateEmployee } = useContext(AppContext);
    const [localExRate, setLocalExRate] = useState(exRate);
    const [localSnackPrice, setLocalSnackPrice] = useState(snackPrice);
    const [newEmpName, setNewEmpName] = useState('');
    const [editingEmp, setEditingEmp] = useState(null);

    useEffect(() => { setLocalExRate(exRate); setLocalSnackPrice(snackPrice); }, [exRate, snackPrice]);
    const handleAddEmployee = () => { if (newEmpName.trim()) { addEmployee(newEmpName.trim()); setNewEmpName(''); } };

    const handleEditEmployee = (emp) => {
        setEditingEmp({
            ...emp,
            role: emp.role || 'WASHER',
            baseSalary: emp.baseSalary || 0,
            commissionPct: emp.commissionPct || 0
        });
    };

    const saveEmployeeChanges = () => {
        if (!editingEmp) return;
        updateEmployee(editingEmp.id, {
            role: editingEmp.role,
            baseSalary: parseFloat(editingEmp.baseSalary) || 0,
            commissionPct: parseFloat(editingEmp.commissionPct) || 0
        });
        setEditingEmp(null);
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-lg mx-auto">
            <h3 className="font-bold mb-4 text-gray-800">General</h3>
            <div className="mb-6 flex flex-col gap-4">
                <div><label className="block text-sm font-bold text-gray-600 mb-2">Cambio de Dólar ($)</label><input type="number" value={localExRate} onChange={e => setLocalExRate(e.target.value)} className="border p-3 rounded-lg w-full text-lg" /></div>
                <div><label className="block text-sm font-bold text-gray-600 mb-2">Precio Snack ($)</label><input type="number" value={localSnackPrice} onChange={e => setLocalSnackPrice(e.target.value)} className="border p-3 rounded-lg w-full text-lg" /></div>
                <Button onClick={() => { updateGlobalSettings(parseFloat(localExRate), parseFloat(localSnackPrice)); alert("Ajustes actualizados"); }} className="w-full mt-2">Guardar Cambios</Button>
            </div>
            <h3 className="font-bold mb-4 border-t pt-4 text-gray-800">Empleados</h3>
            <div className="flex gap-2 mb-4"><input value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)} placeholder="Nuevo Empleado" className="border p-3 rounded-lg flex-1" /><Button onClick={handleAddEmployee}><PlusCircle className="w-5 h-5" /></Button></div>
            <div className="space-y-2">{employees.map((e) => (
                <div key={e.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                        <span className="font-medium block">{e.name}</span>
                        <span className="text-xs text-gray-500 uppercase font-bold">{e.role === 'SUPERVISOR' ? 'Supervisor' : 'Lavador'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${e.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{e.active ? 'Presente' : 'Ausente'}</span>
                        <button onClick={() => handleEditEmployee(e)} className="text-blue-500 hover:text-blue-700" title="Editar Rol"><UserCog size={18} /></button>
                        <button onClick={() => { if (confirm(`¿Ocultar a ${e.name}?`)) archiveEmployee(e.id); }} className="text-red-500 hover:text-red-700" title="Ocultar empleado"><EyeOff size={18} /></button>
                    </div>
                </div>
            ))}</div>

            {editingEmp && (
                <Modal title={`Editar Empleado: ${editingEmp.name}`} icon={UserCog} onClose={() => setEditingEmp(null)} footer={
                    <div className="flex gap-2">
                        <Button onClick={() => setEditingEmp(null)} variant="secondary" className="flex-1">Cancelar</Button>
                        <Button onClick={saveEmployeeChanges} variant="primary" className="flex-1">Guardar</Button>
                    </div>
                }>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-600 mb-1">Rol</label>
                            <select
                                className="w-full border p-2 rounded"
                                value={editingEmp.role}
                                onChange={(e) => setEditingEmp({ ...editingEmp, role: e.target.value })}
                            >
                                <option value="WASHER">Lavador (Comisión Estandar)</option>
                                <option value="SUPERVISOR">Supervisor (Sueldo + % Ventas)</option>
                            </select>
                        </div>
                        {editingEmp.role === 'SUPERVISOR' && (
                            <>
                                <div>
                                    <label className="block text-sm font-bold text-gray-600 mb-1">Sueldo Base Semanal ($)</label>
                                    <input
                                        type="number"
                                        className="w-full border p-2 rounded"
                                        value={editingEmp.baseSalary}
                                        onChange={(e) => setEditingEmp({ ...editingEmp, baseSalary: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-600 mb-1">Comisión de Ventas Totales (%)</label>
                                    <input
                                        type="number"
                                        className="w-full border p-2 rounded"
                                        value={editingEmp.commissionPct}
                                        onChange={(e) => setEditingEmp({ ...editingEmp, commissionPct: e.target.value })}
                                        placeholder="Ej. 5"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
};

const AdminPrecios = () => {
    const { prices, commissions, extrasList, db } = useContext(AppContext);
    const [editPrices, setEditPrices] = useState({});
    const [editComms, setEditComms] = useState({});
    const [editExtras, setEditExtras] = useState([]);

    useEffect(() => {
        setEditPrices(JSON.parse(JSON.stringify(prices)));
        setEditComms(JSON.parse(JSON.stringify(commissions)));
        setEditExtras(JSON.parse(JSON.stringify(extrasList)));
    }, [prices, commissions, extrasList]);

    const updateLocalPrice = (type, svcId, sizeId, val) => {
        const target = type === 'prices' ? editPrices : editComms;
        const setTarget = type === 'prices' ? setEditPrices : setEditComms;
        const newObj = { ...target };
        if (!newObj[svcId]) newObj[svcId] = {};
        newObj[svcId][sizeId] = parseFloat(val) || 0;
        setTarget(newObj);
    };

    const updateLocalExtra = (index, field, val) => {
        const arr = [...editExtras];
        arr[index][field] = val;
        setEditExtras(arr);
    };

    const saveAllSettings = () => handleDbAction(async () => {
        if (!confirm("¿Aplicar nuevos precios?")) return;
        const batch = writeBatch(db);

        batch.set(doc(db, "settings", "prices"), editPrices);
        batch.set(doc(db, "settings", "commissions"), editComms);

        editExtras.forEach(e => {
            if (e.docId) {
                batch.update(doc(db, "extras", e.docId), {
                    label: e.label,
                    price: parseFloat(e.price) || 0,
                    commission: parseFloat(e.commission) || 0,
                    id: e.id
                });
            } else {
                const newRef = doc(collection(db, "extras"));
                batch.set(newRef, {
                    id: e.id || `EXTRA_${Date.now()}`,
                    label: e.label,
                    price: parseFloat(e.price) || 0,
                    commission: parseFloat(e.commission) || 0
                });
            }
        });

        await batch.commit();
        alert("¡Precios Actualizados!");
    });

    return (
        <div className="space-y-6">
            <div className="bg-blue-50 border-blue-200 border p-4 rounded-xl flex justify-between items-center">
                <div><h3 className="font-bold text-blue-800">Edición de Precios</h3><p className="text-sm text-blue-600">Edita los valores y guarda para aplicar.</p></div>
                <Button onClick={saveAllSettings} className="px-6 py-3 shadow-lg"><Upload className="w-5 h-5" /> GUARDAR</Button>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                    <thead><tr className="bg-gray-100"><th className="p-3 border">Servicio</th>{SIZES.map(s => <th key={s.id} className="p-3 border">{s.label}</th>)}</tr></thead>
                    <tbody>
                        {SERVICES.map(svc => (
                            <tr key={svc.id}>
                                <td className="p-3 border font-medium">{svc.label}</td>
                                {SIZES.map(size => (
                                    <td key={size.id} className="p-2 border">
                                        <div className="flex flex-col gap-1">
                                            <input type="number" value={editPrices[svc.id]?.[size.id] || 0} onChange={(e) => updateLocalPrice('prices', svc.id, size.id, e.target.value)} className="border p-1 rounded w-full text-center text-green-700 font-bold" placeholder="Precio" />
                                            <input type="number" value={editComms[svc.id]?.[size.id] || 0} onChange={(e) => updateLocalPrice('commissions', svc.id, size.id, e.target.value)} className="border p-1 rounded w-full text-center text-blue-600 text-xs" placeholder="Com" />
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 overflow-x-auto mt-6">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-gray-700">Extras (Lista Fija)</h4>
                </div>
                <table className="w-full text-sm text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="p-3 border">Nombre / Etiqueta</th>
                            <th className="p-3 border text-center">Precio ($)</th>
                            <th className="p-3 border text-center">Comisión ($)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {editExtras.map((ex, idx) => (
                            <tr key={idx}>
                                <td className="p-3 border font-bold text-gray-700 bg-gray-50">
                                    {ex.label}
                                </td>
                                <td className="p-2 border">
                                    <input type="number" value={ex.price} onChange={(e) => updateLocalExtra(idx, 'price', e.target.value)} className="border p-2 rounded w-full text-center text-green-700 font-bold" />
                                </td>
                                <td className="p-2 border">
                                    <input type="number" value={ex.commission} onChange={(e) => updateLocalExtra(idx, 'commission', e.target.value)} className="border p-2 rounded w-full text-center text-blue-600 font-bold" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const AdminBusinessExpenses = () => {
    const { businessExpenses, addBusinessExpense } = useContext(AppContext);
    const [desc, setDesc] = useState('');
    const [amt, setAmt] = useState('');

    const handleSubmit = () => {
        if (!desc || !amt) return;
        addBusinessExpense(desc, amt);
        setDesc('');
        setAmt('');
    }

    return (
        <div className="space-y-6">
            <div className="bg-purple-50 border-purple-200 border p-4 rounded-xl shadow-sm">
                <h3 className="font-bold text-purple-800 mb-2 flex items-center gap-2"><Briefcase size={20} /> Registrar Gasto Administrativo </h3>
                <p className="text-sm text-purple-600 mb-4 font-medium">Estos gastos son pagados externamente (SAM's, IMSS, etc) y NO afectan el corte de caja diario.</p>
                <div className="flex gap-2 flex-col md:flex-row">
                    <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descripción del gasto" className="border p-3 rounded-lg flex-1 shadow-sm" />
                    <input type="number" value={amt} onChange={e => setAmt(e.target.value)} placeholder="Monto ($)" className="border p-3 rounded-lg w-full md:w-40 shadow-sm" />
                    <Button onClick={handleSubmit} variant="primary" className="bg-purple-600 hover:bg-purple-700 shadow-md">Guardar</Button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                <h4 className="font-bold text-gray-700 mb-4">Historial de Gastos Administrativos</h4>
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 border-b">
                        <tr>
                            <th className="p-3">Fecha</th>
                            <th className="p-3">Descripción</th>
                            <th className="p-3 text-right">Monto</th>
                            <th className="p-3 text-right">Registrado Por</th>
                        </tr>
                    </thead>
                    <tbody>
                        {businessExpenses.length === 0 ? <tr><td colSpan="4" className="p-4 text-center text-gray-400">No hay gastos registrados.</td></tr> : businessExpenses.map(e => (
                            <tr key={e.id} className="border-b hover:bg-gray-50 last:border-b-0">
                                <td className="p-3 text-gray-600">
                                    <div>{e.timestamp.toLocaleDateString()}</div>
                                    <div className="text-xs">{e.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                </td>
                                <td className="p-3 font-medium text-gray-800">{e.description}</td>
                                <td className="p-3 text-right font-bold text-purple-700">{formatCurrency(e.amount)}</td>
                                <td className="p-3 text-right text-xs text-gray-400 uppercase">{e.createdBy}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

window.AdminPanel = () => {
    const { addCashIn } = useContext(AppContext);
    const [tab, setTab] = useState('CORTE');
    const [showAddCash, setShowAddCash] = useState(false);
    const [acMxn, setAcMxn] = useState('');
    const [acUsd, setAcUsd] = useState('');
    const [acReason, setAcReason] = useState('');

    const handleAddCash = () => {
        if (!acMxn && !acUsd) return;
        addCashIn(acMxn, acUsd, acReason);
        setAcMxn(''); setAcUsd(''); setAcReason('');
        setShowAddCash(false);
    };

    return (
        <div className="p-4 md:p-6 h-full overflow-y-auto">
            <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-1 items-center">
                {['CORTE', 'NOMINA', 'ASISTENCIA', 'GASTOS_ADM', 'CONFIG', 'PRECIOS'].map(t => <button key={t} onClick={() => setTab(t)} className={`px-5 py-2.5 rounded-xl font-bold whitespace-nowrap transition-colors ${tab === t ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border'}`}>{t === 'GASTOS_ADM' ? 'GASTOS NEGOCIO' : t}</button>)}
                <button onClick={() => setShowAddCash(true)} className="px-5 py-2.5 rounded-xl font-bold whitespace-nowrap transition-colors bg-green-600 text-white shadow-md flex items-center gap-2 hover:bg-green-700">
                    <PlusCircle size={18} /> AGREGAR EFECTIVO
                </button>
            </div>
            {tab === 'CORTE' && <AdminCorte />}
            {tab === 'NOMINA' && <AdminNomina />}
            {tab === 'ASISTENCIA' && <AdminAsistencia />}
            {tab === 'GASTOS_ADM' && <AdminBusinessExpenses />}
            {tab === 'CONFIG' && <AdminConfig />}
            {tab === 'PRECIOS' && <AdminPrecios />}

            {showAddCash && (
                <Modal title="Agregar Efectivo a Caja" icon={Banknote} onClose={() => setShowAddCash(false)} footer={
                    <div className="flex gap-3">
                        <Button onClick={() => setShowAddCash(false)} variant="secondary" className="flex-1">Cancelar</Button>
                        <Button onClick={handleAddCash} variant="success" className="flex-1">Agregar</Button>
                    </div>
                }>
                    <div className="space-y-4">
                        <div className="bg-green-50 p-3 rounded-lg text-sm text-green-800 border border-green-200">
                            Este monto se sumará al dinero esperado en caja (similar al fondo inicial). Úsalo cuando necesites meter cambio o aumentar el fondo.
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-600 mb-1">Monto (MXN)</label>
                            <input type="number" value={acMxn} onChange={e => setAcMxn(e.target.value)} className="w-full border p-3 rounded-lg font-bold text-lg" placeholder="0.00" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-600 mb-1">Monto (USD)</label>
                            <input type="number" value={acUsd} onChange={e => setAcUsd(e.target.value)} className="w-full border p-3 rounded-lg font-bold text-lg" placeholder="0.00" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-600 mb-1">Razón (Opcional)</label>
                            <input value={acReason} onChange={e => setAcReason(e.target.value)} className="w-full border p-3 rounded-lg" placeholder="Ej. Refill de cambio" />
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};