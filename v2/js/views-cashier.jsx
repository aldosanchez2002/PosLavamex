import React, { useState, useEffect, useContext } from 'react';
import { Coffee, Briefcase, UserCheck, TrendingDown, ClipboardList, ShieldCheck, Printer, Trash2, Pencil, Loader2, CreditCard, LogOut, Upload } from 'lucide-react';

const { AppContext, Button, Modal } = window;
const { formatCurrency, getLocalDateStr } = window.AppCore;

window.CashierView = () => {
    const { tickets, history, activeId, setActiveId, payment, setPayment, processPayment, processCardPayment, deleteTicket, startEdit, updateSnacks, updateQuickItem, addDeduction, addExpense, employees, exRate, saveBatchAttendance, isSubmitting, role, snackPrice, expenses, addCashCount, addCashDrop, cashDrops, cashIns, getOpeningCash, extrasList } = useContext(AppContext);
    const t = tickets.find(x => x.id === activeId);
    const [showSnack, setShowSnack] = useState(false);
    const [showVarios, setShowVarios] = useState(false);
    const [showAttendance, setShowAttendance] = useState(false);
    const [showExpense, setShowExpense] = useState(false);
    const [showCorte, setShowCorte] = useState(false);
    const [corteTab, setCorteTab] = useState('ARQUEO');

    const [localAttendance, setLocalAttendance] = useState({});

    const [snackEmp, setSnackEmp] = useState('');
    const [variosEmp, setVariosEmp] = useState('');
    const [variosDesc, setVariosDesc] = useState('');
    const [variosAmt, setVariosAmt] = useState('');
    const [expDesc, setExpDesc] = useState('');
    const [expAmt, setExpAmt] = useState('');

    const [declaredMxn, setDeclaredMxn] = useState('');
    const [declaredUsd, setDeclaredUsd] = useState('');

    const [dropMxn, setDropMxn] = useState('');
    const [dropUsd, setDropUsd] = useState('');

    useEffect(() => {
        if (showAttendance) {
            const init = {};
            employees.forEach(e => {
                init[e.id] = { id: e.id, name: e.name, active: e.active };
            });
            setLocalAttendance(init);
        }
    }, [showAttendance, employees]);

    const handleLocalToggle = (id) => {
        setLocalAttendance(prev => ({
            ...prev,
            [id]: { ...prev[id], active: !prev[id].active }
        }));
    };

    const handleSaveAttendance = async () => {
        await saveBatchAttendance(localAttendance);
        alert("Asistencia guardada.");
        setShowAttendance(false);
    };

    const handleAddExpense = () => { if (!expDesc || !expAmt) return; addExpense(expDesc, expAmt); setExpDesc(''); setExpAmt(''); setShowExpense(false); };

    const handleAddSnack = () => {
        if (snackEmp) {
            addDeduction(snackEmp, snackPrice, 'Snack');
            setShowSnack(false);
            setSnackEmp('');
        }
    };

    const handleAddVarios = () => {
        if (variosEmp && variosDesc && variosAmt) {
            addDeduction(variosEmp, variosAmt, variosDesc);
            setShowVarios(false);
            setVariosEmp('');
            setVariosDesc('');
            setVariosAmt('');
        }
    };

    const handleCorte = async () => {
        const { expectedMxn, expectedUsd, totalCard } = calculateCurrentExpectedCash();

        const decMxnVal = parseFloat(declaredMxn) || 0;
        const decUsdVal = parseFloat(declaredUsd) || 0;

        const diffMxn = decMxnVal - expectedMxn;
        const diffUsd = decUsdVal - expectedUsd;

        const isMatch = Math.abs(diffMxn) < 1 && Math.abs(diffUsd) < 0.1;

        await addCashCount({
            declaredMxn: decMxnVal,
            declaredUsd: decUsdVal,
            expectedMxn,
            expectedUsd,
            diffMxn,
            diffUsd,
            card: totalCard,
            exchangeRate: exRate,
            user: role,
            timestamp: new Date()
        });

        const totalDiff = diffMxn + (diffUsd * exRate);
        if (role === 'ADMIN') {
            if (totalDiff < -1) {
                alert(`⚠️ DESCUADRE DETECTADO.\n\nDiferencia MXN: ${formatCurrency(diffMxn)}\nDiferencia USD: $${diffUsd.toFixed(2)}`);
            } else {
                alert("✅ CORTE CORRECTO. El dinero en caja coincide (o sobra).");
            }
        } else {
            alert("✅ Corte registrado.");
        }

        setShowCorte(false);
        setDeclaredMxn('');
        setDeclaredUsd('');
    };

    const calculateCurrentExpectedCash = () => {
        const todayStr = getLocalDateStr();
        const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));

        const allToday = history.concat(tickets).filter(t => t.status === 'PAID' && getLocalDateStr(t.paidAt || t.timestamp) === todayStr);

        const expensesToday = expenses.filter(e => e.status === 'APPROVED' && getLocalDateStr(e.timestamp) === todayStr)
            .reduce((a, b) => a + (b.amount || 0), 0);

        const dropsTodayMxn = cashDrops.filter(d => getLocalDateStr(d.timestamp) === todayStr).reduce((a, b) => a + (b.amountMxn || 0), 0);
        const dropsTodayUsd = cashDrops.filter(d => getLocalDateStr(d.timestamp) === todayStr).reduce((a, b) => a + (b.amountUsd || 0), 0);

        const cashInsTodayMxn = cashIns.filter(d => getLocalDateStr(d.timestamp) === todayStr).reduce((a, b) => a + (b.amountMxn || 0), 0);
        const cashInsTodayUsd = cashIns.filter(d => getLocalDateStr(d.timestamp) === todayStr).reduce((a, b) => a + (b.amountUsd || 0), 0);

        const openingCash = getOpeningCash(startOfToday);
        let expectedMxn = openingCash.mxn;
        let expectedUsd = openingCash.usd;
        let totalCard = 0;

        allToday.forEach(t => {
            const pay = t.paymentDetails || { mxn: 0, usd: 0, changeMxn: 0, changeUsd: 0, isOnlyUsd: false, method: 'CASH' };

            if (pay.method === 'CARD') {
                totalCard += t.price;
            } else {
                expectedMxn += (pay.mxn || 0);
                expectedUsd += (pay.usd || 0);

                if (pay.isOnlyUsd) {
                    expectedUsd -= (pay.changeUsd || 0);
                } else {
                    expectedMxn -= (pay.changeMxn || 0);
                }
            }
        });

        expectedMxn -= expensesToday;
        expectedMxn -= dropsTodayMxn;
        expectedUsd -= dropsTodayUsd;
        expectedMxn += cashInsTodayMxn;
        expectedUsd += cashInsTodayUsd;

        return { expectedMxn, expectedUsd, totalCard };
    };

    const handleCashDrop = async () => {
        if ((!dropMxn && !dropUsd) || (parseFloat(dropMxn) <= 0 && parseFloat(dropUsd) <= 0)) {
            return alert("Ingrese un monto válido.");
        }

        await addCashDrop(dropMxn, dropUsd);
        setDropMxn('');
        setDropUsd('');
        setShowCorte(false);
    };

    const mxnVal = parseFloat(payment.mxn) || 0;
    const usdVal = parseFloat(payment.usd) || 0;
    const totalGiven = mxnVal + (usdVal * exRate);
    const changeMxn = totalGiven - (t ? t.price : 0);
    const changeUsd = changeMxn / exRate;
    const isOnlyUsd = usdVal > 0 && mxnVal === 0;

    const pinoPrice = extrasList.find(e => e.id === 'PINO')?.price || 35;
    const boleadaPrice = extrasList.find(e => e.id === 'BOLEADA')?.price || 60;

    return (
        <div className="flex flex-col md:flex-row h-full gap-4 p-4 overflow-hidden">
            <div className="w-full md:w-1/3 bg-white rounded-xl shadow border overflow-hidden flex flex-col h-1/3 md:h-full shrink-0">
                <div className="p-3 bg-gray-50 font-bold border-b flex justify-between items-center shrink-0">
                    <span className="text-gray-700">Tickets ({tickets.length})</span>
                    <div className="flex gap-1">
                        <Button onClick={() => setShowCorte(true)} variant="primary" className="text-xs px-2 py-1 h-auto rounded-full bg-slate-700 border-slate-800 text-white">Corte</Button>
                        <Button onClick={() => setShowAttendance(true)} variant="blueLight" className="text-xs px-2 py-1 h-auto rounded-full">Asist</Button>
                        <Button onClick={() => setShowSnack(true)} variant="orangeLight" className="text-xs px-2 py-1 h-auto rounded-full">Snack</Button>
                        <Button onClick={() => setShowVarios(true)} variant="secondary" className="text-xs px-2 py-1 h-auto rounded-full text-purple-700 border-purple-200 bg-purple-50 hover:bg-purple-100">Varios</Button>
                        <Button onClick={() => setShowExpense(true)} variant="danger" className="text-xs px-2 py-1 h-auto rounded-full">Gasto</Button>
                    </div>
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-2">
                    {tickets.map(ticket => (
                        <div key={ticket.id} onClick={() => setActiveId(ticket.id)} className={`p-4 rounded-lg border cursor-pointer transition-all ${activeId === ticket.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50'}`}>
                            <div className="flex justify-between font-bold text-gray-800">
                                <span className="truncate pr-2">#{ticket.id.slice(-4).toUpperCase()}{ticket.vehicleDesc ? <span className="uppercase"> - {ticket.vehicleDesc}</span> : ''}</span>
                                <div className="text-right">
                                    <div className="whitespace-nowrap">{formatCurrency(ticket.price)} MXN</div>
                                    <div className="text-xs text-green-600 font-normal">${(Math.ceil((ticket.price / exRate) * 4) / 4).toFixed(2)} USD</div>
                                </div>
                            </div>
                            <div className="text-sm text-gray-600 mt-1">{ticket.service?.label || 'Extras'} <span className="bg-gray-200 px-1.5 rounded text-xs">{ticket.size?.label || '-'}</span></div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex-1 bg-white rounded-xl shadow border p-4 md:p-6 flex flex-col items-center h-2/3 md:h-full overflow-y-auto pb-20">
                {t ? (
                    <div className="w-full max-w-md my-auto">
                        <div className="text-center mb-2">
                            <h2 className="text-4xl font-bold text-gray-800">{formatCurrency(t.price)}</h2>
                            <div className="text-xl text-green-600 font-medium">${(Math.ceil((t.price / exRate) * 4) / 4).toFixed(2)} USD</div>
                        </div>
                        <p className="text-center text-gray-500 mb-6 font-medium">{t.vehicleDesc} • {t.washers?.join(', ')}</p>

                        <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                            <h4 className="font-bold text-gray-500 text-xs uppercase mb-3 text-center tracking-wider">Add-ons Rápidos (Comisión $0)</h4>
                            <div className="grid grid-cols-1 gap-3">
                                <div className="flex justify-between items-center bg-white p-2 rounded-lg border shadow-sm">
                                    <span className="font-bold text-gray-700 pl-2">Pinos (${pinoPrice})</span>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => updateQuickItem(t.id, 'PINO', -1)} className="w-8 h-8 bg-gray-100 rounded-full font-bold text-gray-600 hover:bg-gray-200">-</button>
                                        <span className="w-4 text-center font-bold">{(t.extras || []).filter(e => e.id === 'QA_PINO').length}</span>
                                        <button onClick={() => updateQuickItem(t.id, 'PINO', 1)} className="w-8 h-8 bg-blue-100 rounded-full font-bold text-blue-600 hover:bg-blue-200">+</button>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center bg-white p-2 rounded-lg border shadow-sm">
                                    <span className="font-bold text-gray-700 pl-2">Boleada (${boleadaPrice})</span>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => updateQuickItem(t.id, 'BOLEADA', -1)} className="w-8 h-8 bg-gray-100 rounded-full font-bold text-gray-600 hover:bg-gray-200">-</button>
                                        <span className="w-4 text-center font-bold">{(t.extras || []).filter(e => e.id === 'QA_BOLEADA').length}</span>
                                        <button onClick={() => updateQuickItem(t.id, 'BOLEADA', 1)} className="w-8 h-8 bg-blue-100 rounded-full font-bold text-blue-600 hover:bg-blue-200">+</button>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center bg-white p-2 rounded-lg border shadow-sm">
                                    <span className="font-bold text-gray-700 pl-2">Snacks (${snackPrice})</span>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => updateQuickItem(t.id, 'SNACKS', -1)} className="w-8 h-8 bg-gray-100 rounded-full font-bold text-gray-600 hover:bg-gray-200">-</button>
                                        <span className="w-4 text-center font-bold">{t.snackCount || 0}</span>
                                        <button onClick={() => updateQuickItem(t.id, 'SNACKS', 1)} className="w-8 h-8 bg-orange-100 rounded-full font-bold text-orange-600 hover:bg-orange-200">+</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div><label className="text-xs font-bold text-gray-500 mb-1 block">MXN</label><input type="number" inputMode="decimal" value={payment.mxn} onChange={e => setPayment({ ...payment, mxn: e.target.value })} placeholder="0.00" className="w-full p-3 border rounded-lg text-lg" /></div>
                            <div><label className="text-xs font-bold text-gray-500 mb-1 block">USD (Rate: {exRate})</label><input type="number" inputMode="decimal" value={payment.usd} onChange={e => setPayment({ ...payment, usd: e.target.value })} placeholder="0.00" className="w-full p-3 border rounded-lg text-lg" /></div>
                        </div>
                        <div className="text-center font-bold mb-6 text-xl bg-gray-50 p-3 rounded-lg border">
                            {isOnlyUsd ? (
                                <div>Cambio: <span className={changeUsd < 0 ? 'text-red-500' : 'text-green-600'}>${changeUsd.toFixed(2)} USD</span></div>
                            ) : (
                                <div>Cambio: <span className={changeMxn < 0 ? 'text-red-500' : 'text-green-600'}>{formatCurrency(changeMxn)} MXN</span></div>
                            )}
                            {!isOnlyUsd && usdVal > 0 && changeMxn > 0 && <div className="text-blue-600 text-lg mt-1">Cambio eqv. USD: ${changeUsd.toFixed(2)}</div>}
                        </div>
                        <div className="flex gap-3">
                            {role !== 'CASHIER' && <Button onClick={() => deleteTicket(t.id)} variant="danger" title="Borrar"><Trash2 className="w-6 h-6" /></Button>}
                            {role !== 'CASHIER' && <Button onClick={() => startEdit(t)} variant="warning" title="Editar"><Pencil className="w-6 h-6" /></Button>}
                            <Button onClick={processPayment} disabled={isSubmitting} variant="success" className="flex-1 shadow-lg">{isSubmitting ? <Loader2 className="animate-spin" /> : <><Printer className="w-6 h-6" /> COBRAR</>}</Button>
                            {role === 'CASHIER' && <Button onClick={processCardPayment} disabled={isSubmitting} title="Tarjeta"><CreditCard className="w-6 h-6" /></Button>}
                        </div>
                    </div>
                ) : <div className="text-gray-400 flex flex-col items-center my-auto"><LogOut className="w-16 h-16 opacity-20 mb-2" />Selecciona un ticket</div>}
            </div>

            {showSnack && <Modal title={`Snack Empleado ($${snackPrice})`} icon={Coffee} onClose={() => setShowSnack(false)} footer={<div className="flex gap-3"><Button onClick={() => setShowSnack(false)} variant="secondary" className="flex-1">Cancelar</Button><Button onClick={handleAddSnack} disabled={!snackEmp} variant="warning" className="flex-1">Confirmar</Button></div>}><select className="w-full border p-3 rounded-lg mb-6 text-lg bg-white" onChange={e => setSnackEmp(e.target.value)} value={snackEmp}><option value="">Seleccionar Empleado...</option>{employees.map(e => <option key={e.id || e.name} value={e.name}>{e.name}</option>)}</select></Modal>}

            {showVarios && (
                <Modal title="Varios / Deducción" icon={Briefcase} onClose={() => setShowVarios(false)} footer={<div className="flex gap-3"><Button onClick={() => setShowVarios(false)} variant="secondary" className="flex-1">Cancelar</Button><Button onClick={handleAddVarios} disabled={!variosEmp || !variosDesc || !variosAmt} variant="primary" className="flex-1 bg-purple-600 hover:bg-purple-700">Guardar</Button></div>}>
                    <div className="space-y-3">
                        <div><label className="block text-sm font-bold text-gray-600 mb-1">Empleado</label><select className="w-full border p-3 rounded-lg bg-white" onChange={e => setVariosEmp(e.target.value)} value={variosEmp}><option value="">Seleccionar...</option>{employees.map(e => <option key={e.id || e.name} value={e.name}>{e.name}</option>)}</select></div>
                        <div><label className="block text-sm font-bold text-gray-600 mb-1">Descripción</label><input value={variosDesc} onChange={e => setVariosDesc(e.target.value)} className="w-full border p-3 rounded-lg" placeholder="Ej. Toalla, Prestamo" /></div>
                        <div><label className="block text-sm font-bold text-gray-600 mb-1">Monto ($)</label><input type="number" value={variosAmt} onChange={e => setVariosAmt(e.target.value)} className="w-full border p-3 rounded-lg" placeholder="0.00" /></div>
                    </div>
                </Modal>
            )}

            {showAttendance && (
                <Modal title="Asistencia" icon={UserCheck} onClose={() => setShowAttendance(false)} footer={
                    <div className="flex gap-2">
                        <Button onClick={() => setShowAttendance(false)} variant="secondary" className="flex-1">Cerrar</Button>
                        <Button onClick={handleSaveAttendance} variant="success" className="flex-1"><Upload size={18} className="mr-2" /> Guardar</Button>
                    </div>
                }>
                    <div className="max-h-80 overflow-y-auto space-y-2">
                        {employees.map(e => {
                            const isActive = localAttendance[e.id] ? localAttendance[e.id].active : e.active;
                            return (
                                <div key={e.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                    <span className="font-medium text-lg">{e.name}</span>
                                    <button
                                        onClick={() => handleLocalToggle(e.id)}
                                        className={`px-4 py-2 rounded-lg font-bold ${isActive ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'}`}
                                    >
                                        {isActive ? 'PRESENTE' : 'AUSENTE'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </Modal>
            )}

            {showExpense && <Modal title="Registrar Gasto" icon={TrendingDown} onClose={() => setShowExpense(false)} footer={<div className="flex gap-3"><Button onClick={() => setShowExpense(false)} variant="secondary" className="flex-1">Cancelar</Button><Button onClick={handleAddExpense} variant="danger" className="flex-1">Registrar</Button></div>}><div className="space-y-3"><div><label className="block text-sm font-bold text-gray-600 mb-1">Concepto</label><input value={expDesc} onChange={e => setExpDesc(e.target.value)} className="w-full border p-3 rounded-lg" placeholder="Ej. Jabón" /></div><div><label className="block text-sm font-bold text-gray-600 mb-1">Monto ($)</label><input type="number" value={expAmt} onChange={e => setExpAmt(e.target.value)} className="w-full border p-3 rounded-lg" placeholder="0.00" /></div></div></Modal>}

            {showCorte && (
                <Modal
                    title={corteTab === 'ARQUEO' ? "Arqueo de Caja (Verificación)" : "Retiro de Efectivo (Resguardo)"}
                    icon={corteTab === 'ARQUEO' ? ClipboardList : ShieldCheck}
                    onClose={() => setShowCorte(false)}
                    footer={
                        <div className="flex gap-3">
                            <Button onClick={() => setShowCorte(false)} variant="secondary" className="flex-1">Cancelar</Button>
                            {corteTab === 'ARQUEO' ? (
                                <Button onClick={handleCorte} variant="primary" className="flex-1 bg-slate-800 hover:bg-slate-900">Verificar</Button>
                            ) : (
                                <Button onClick={handleCashDrop} variant="warning" className="flex-1">Confirmar Retiro</Button>
                            )}
                        </div>
                    }
                >
                    <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                        <button onClick={() => setCorteTab('ARQUEO')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${corteTab === 'ARQUEO' ? 'bg-white shadow text-slate-800' : 'text-gray-500'}`}>Verificar Caja</button>
                        <button onClick={() => setCorteTab('DROP')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${corteTab === 'DROP' ? 'bg-orange-100 text-orange-700 shadow border border-orange-200' : 'text-gray-500'}`}>Retiro de Efectivo</button>
                    </div>

                    {corteTab === 'ARQUEO' && (
                        <div className="space-y-4">
                            <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                                Ingresa el dinero físico que hay actualmente en la caja. El sistema lo comparará con lo esperado.
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-600 mb-1">Efectivo MXN</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-gray-400 font-bold">$</span>
                                    <input type="number" value={declaredMxn} onChange={e => setDeclaredMxn(e.target.value)} className="w-full border p-3 pl-8 rounded-lg text-lg font-bold" placeholder="0.00" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-600 mb-1">Efectivo USD</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-gray-400 font-bold">$</span>
                                    <input type="number" value={declaredUsd} onChange={e => setDeclaredUsd(e.target.value)} className="w-full border p-3 pl-8 rounded-lg text-lg font-bold" placeholder="0.00" />
                                </div>
                            </div>
                        </div>
                    )}

                    {corteTab === 'DROP' && (
                        <div className="space-y-4">
                            <div className="bg-orange-50 p-3 rounded-lg text-sm text-orange-800 border border-orange-200">
                                <ShieldCheck className="w-5 h-5 inline mr-1" />
                                Ingresa el monto que vas a retirar de la caja para mover a resguardo. Se imprimirá un ticket.
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-600 mb-1">Monto a Retirar (MXN)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-gray-400 font-bold">$</span>
                                    <input type="number" value={dropMxn} onChange={e => setDropMxn(e.target.value)} className="w-full border p-3 pl-8 rounded-lg text-lg font-bold text-orange-700" placeholder="0.00" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-600 mb-1">Monto a Retirar (USD)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-3 text-gray-400 font-bold">$</span>
                                    <input type="number" value={dropUsd} onChange={e => setDropUsd(e.target.value)} className="w-full border p-3 pl-8 rounded-lg text-lg font-bold text-green-700" placeholder="0.00" />
                                </div>
                            </div>
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
};