import React, { useState, useEffect, useContext } from 'react';
import { PlusCircle, Activity, Pencil, Car, User, FileText, Trash2, Save, Printer, Loader2, Clock } from 'lucide-react';

const { AppContext, Button } = window;
const { SIZES, SERVICES, toggleSelection, PrintService, formatCurrency } = window.AppCore;

window.GreeterView = () => {
    const { employees, saveTicket, editingTicket, cancelEdit, prices, extrasList, isSubmitting, tickets, deleteTicket, startEdit, role } = useContext(AppContext);
    const [subTab, setSubTab] = useState('FORM');
    const [size, setSize] = useState(null);
    const [service, setService] = useState(null);
    const [washers, setWashers] = useState([]);
    const [extras, setExtras] = useState([]);
    const [desc, setDesc] = useState('');
    const [vDesc, setVDesc] = useState('');
    const [vPrice, setVPrice] = useState('');

    const isDesktop = role === 'CASHIER' || role === 'ADMIN';

    useEffect(() => {
        if (editingTicket) {
            setSubTab('FORM');
            setSize(editingTicket.size || null);
            setService(editingTicket.service || null);
            setWashers(editingTicket.washers || []);
            setExtras(editingTicket.extras || []);
            setDesc(editingTicket.vehicleDesc || '');
        } else {
            setSize(null); setService(null); setWashers([]); setExtras([]); setDesc('');
        }
    }, [editingTicket]);

    const toggle = (item) => setWashers(prev => toggleSelection(prev, item, 3));
    const toggleExtra = (item) => setExtras(prev => toggleSelection(prev, item));
    const addExtra = (item) => setExtras(prev => [...prev, item]);
    const removeExtra = (item) => setExtras(prev => { const idx = prev.findIndex(x => x.id === item.id); if (idx === -1) return prev; const newArr = [...prev]; newArr.splice(idx, 1); return newArr; });
    const addVarios = () => { const price = parseFloat(vPrice); if (!vDesc || !price || price <= 0) return alert("Error."); setExtras(prev => [...prev, { id: `VARIOS-${Date.now()}`, label: vDesc, price, commission: 0 }]); setVDesc(''); setVPrice(''); };
    const canSubmit = ((size && service) || extras.length > 0);
    const handleSubmit = () => { if (!canSubmit) return; saveTicket({ size, service, washers, extras, vehicleDesc: desc }); if (!editingTicket) { setSize(null); setService(null); setWashers([]); setExtras([]); setDesc(''); } };
    const handleReprint = (ticket) => {
        const html = PrintService.getJobTicketHtml({ ...ticket, timestamp: ticket.timestamp || new Date() }, ticket.id.slice(-4).toUpperCase());
        PrintService.print(html, role);
    };

    const renderSizes = () => (
        <div className="bg-white p-4 rounded-xl shadow border h-fit">
            <h3 className="font-bold mb-3 text-gray-700 flex items-center"><Car className="w-5 h-5 mr-2" /> 1. Tamaño</h3>
            <div className={`grid ${isDesktop ? 'grid-cols-1 gap-2' : 'grid-cols-1 space-y-2'}`}>
                {SIZES.map(s => (
                    <button key={s.id} onClick={() => setSize(s)}
                        className={`w-full ${isDesktop ? 'p-2' : 'p-4'} text-left rounded-lg border-2 transition-all ${size?.id === s.id ? 'border-blue-600 bg-blue-50 font-bold text-blue-800 shadow-sm' : 'border-gray-200 hover:bg-gray-50'}`}>
                        {s.label}
                    </button>
                ))}
            </div>
        </div>
    );

    const renderWashers = () => (
        <div className="bg-white p-4 rounded-xl shadow border h-fit">
            <h3 className="font-bold mb-3 text-gray-700 flex items-center"><User className="w-5 h-5 mr-2" /> 2. Lavadores ({washers.length}/3)</h3>
            <div className={`grid ${isDesktop ? 'grid-cols-2 gap-2' : 'grid-cols-2 gap-3'} mb-4`}>
                {employees.filter(e => e.active).map(e => (
                    <button key={e.name} onClick={() => toggle(e.name)}
                        className={`${isDesktop ? 'p-2 text-sm' : 'p-4'} rounded-lg border-2 text-center font-medium transition-all ${washers.includes(e.name) ? 'bg-green-100 border-green-600 text-green-800 shadow-inner' : 'border-gray-200 hover:bg-gray-50'}`}>
                        {e.name}
                    </button>
                ))}
            </div>
        </div>
    );

    const renderServices = () => (
        <div className="bg-white p-4 rounded-xl shadow border h-fit">
            <h3 className="font-bold mb-3 text-gray-700 flex items-center"><FileText className="w-5 h-5 mr-2" /> 3. Servicio</h3>
            <div className={`space-y-2 mb-4 ${isDesktop ? 'text-sm' : ''}`}>
                {SERVICES.map(s => {
                    const price = size && prices[s.id] ? prices[s.id][size.id] : null;
                    return <button key={s.id} disabled={!size} onClick={() => setService(s)} className={`w-full ${isDesktop ? 'p-2' : 'p-3'} text-left rounded-lg border-2 flex justify-between items-center transition-all ${service?.id === s.id ? 'border-blue-600 bg-blue-50 font-bold text-blue-800 shadow-sm' : 'border-gray-200 opacity-90 hover:bg-gray-50'}`}><span>{s.label}</span>{price !== null && <span className="bg-white px-2 py-1 rounded text-sm shadow-sm border">${price}</span>}</button>;
                })}
            </div>
            <div className="mt-4 border-t pt-2">
                <h3 className="font-bold mb-2 text-gray-700 text-sm">Extras</h3>
                <div className={`grid ${isDesktop ? 'grid-cols-2 gap-2' : 'grid-cols-1 gap-2'}`}>
                    {extrasList.map(e => {
                        const count = extras.filter(x => x.id === e.id).length;
                        if (e.id === 'BOLEADA') {
                            return (
                                <div key={e.id} className={`w-full p-2 rounded-lg border text-sm flex justify-between items-center transition-all ${count > 0 ? 'bg-indigo-50 border-indigo-600 font-bold text-indigo-800' : 'border-gray-200 hover:bg-gray-50'} ${isDesktop ? 'col-span-2' : ''}`}>
                                    <span className="flex-1">{e.label} (+${e.price})</span>
                                    <div className="flex items-center gap-2"><button onClick={() => removeExtra(e)} disabled={count === 0} className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded-full font-bold">-</button><span className="w-6 text-center font-bold">{count}</span><button onClick={() => addExtra(e)} className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded-full font-bold">+</button></div>
                                </div>
                            );
                        }
                        return <button key={e.id} onClick={() => toggleExtra(e)} className={`w-full p-2 rounded-lg border text-sm flex justify-between items-center transition-all ${extras.some(x => x.id === e.id) ? 'bg-indigo-50 border-indigo-600 font-bold text-indigo-800' : 'border-gray-200 hover:bg-gray-50'}`}><span>{e.label}</span><span>+${e.price}</span></button>;
                    })}
                </div>
            </div>
            <div className="mt-4 border-t pt-2">
                <h3 className="font-bold mb-2 text-gray-700 text-sm">Varios (Costo Extra)</h3>
                <div className="flex gap-2 mb-2"><input value={vDesc} onChange={e => setVDesc(e.target.value)} placeholder="Motivo" className="w-full p-2 border rounded text-sm" /><input type="number" value={vPrice} onChange={e => setVPrice(e.target.value)} placeholder="$" className="w-20 p-2 border rounded text-sm" /><Button onClick={addVarios} className="py-2 px-3"><PlusCircle size={16} /></Button></div>
                {extras.filter(e => e.id.startsWith('VARIOS')).map(e => (
                    <div key={e.id} className="flex justify-between items-center text-sm p-2 bg-gray-50 border rounded mb-1"><span>{e.label}</span><div className="flex items-center gap-2"><span className="font-bold">${e.price}</span><button onClick={() => setExtras(prev => prev.filter(x => x.id !== e.id))} className="text-red-500"><Trash2 size={14} /></button></div></div>
                ))}
            </div>
        </div>
    );

    const renderActions = () => (
        <div className="bg-white p-4 rounded-xl shadow border h-fit">
            <input
                value={desc}
                onChange={e => setDesc(e.target.value)}
                placeholder="DESCRIPCIÓN VISUAL"
                className="w-full p-4 border-4 border-blue-600 rounded-xl mb-4 text-xl font-bold bg-blue-50 text-blue-900 placeholder-blue-400 focus:bg-white transition-colors text-center uppercase"
            />
            <div className="space-y-2">
                {isDesktop && (
                    <div className="bg-gray-50 p-3 rounded-lg border text-sm mb-4">
                        <div className="flex justify-between mb-1"><span>Base:</span> <span>${(size && service && prices[service.id]?.[size.id]) || 0}</span></div>
                        <div className="flex justify-between mb-1"><span>Extras:</span> <span>${extras.reduce((a, b) => a + b.price, 0)}</span></div>
                        <div className="flex justify-between font-bold text-lg border-t pt-1 mt-1 text-green-700"><span>Total:</span> <span>${((size && service && prices[service.id]?.[size.id]) || 0) + extras.reduce((a, b) => a + b.price, 0)}</span></div>
                    </div>
                )}
                <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting} className={`w-full py-5 text-xl shadow-lg ${!canSubmit ? 'bg-gray-300' : ''}`}>
                    {isSubmitting ? <Loader2 className="animate-spin" /> : (editingTicket ? <><Save className="w-6 h-6" /> GUARDAR</> : <><Printer className="w-6 h-6" /> CREAR TICKET</>)}
                </Button>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-100">
            <div className="flex bg-white shadow-sm border-b shrink-0">
                <button onClick={() => setSubTab('FORM')} className={`flex-1 py-4 text-center font-bold flex items-center justify-center gap-2 transition-colors ${subTab === 'FORM' ? 'text-blue-600 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-50'}`}>
                    <PlusCircle size={20} /> Nueva Orden
                </button>
                {role !== 'CASHIER' && (
                    <button onClick={() => setSubTab('LIST')} className={`flex-1 py-4 text-center font-bold flex items-center justify-center gap-2 transition-colors ${subTab === 'LIST' ? 'text-blue-600 border-b-4 border-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <Activity size={20} /> En Proceso ({tickets.length})
                    </button>
                )}
            </div>

            {editingTicket && subTab === 'FORM' && (
                <div className="bg-yellow-200 p-3 text-center font-bold text-yellow-900 flex justify-between items-center px-4 shadow-sm z-10 shrink-0">
                    <span className="flex items-center gap-2 text-sm"><Pencil className="w-4 h-4" /> EDITANDO #{editingTicket.id.slice(-4).toUpperCase()}</span>
                    <Button onClick={cancelEdit} variant="secondary" className="text-xs py-1 h-8">Cancelar</Button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
                {subTab === 'FORM' ? (
                    isDesktop ? (
                        <div className="grid grid-cols-3 gap-4 h-full content-start">
                            <div className="flex flex-col gap-4">
                                {renderSizes()}
                                {renderWashers()}
                            </div>
                            <div className="flex flex-col gap-4 h-full overflow-y-auto">
                                {renderServices()}
                            </div>
                            <div className="flex flex-col gap-4">
                                {renderActions()}
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full content-start">
                            {renderSizes()}
                            {renderWashers()}
                            {renderServices()}
                            <div className="md:col-span-2 mt-auto">
                                {renderActions()}
                            </div>
                        </div>
                    )
                ) : (
                    <div className="max-w-3xl mx-auto space-y-4">
                        {tickets.length === 0 && <div className="text-center text-gray-400 py-10">No hay vehículos en proceso.</div>}
                        {tickets.map(t => (
                            <div key={t.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-3 border-b pb-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold text-xl text-gray-800 bg-gray-100 px-2 py-1 rounded">#{t.id.slice(-4).toUpperCase()}</span>
                                            <span className="text-xs font-bold text-gray-500 flex items-center bg-gray-50 px-2 py-1 rounded border"><Clock size={12} className="mr-1" /> {t.timestamp instanceof Date ? t.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-2xl font-bold text-green-600">{formatCurrency(t.price)}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <div className="text-xl font-bold text-gray-800 mb-1">{t.vehicleDesc || 'Sin descripción'}</div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="font-bold text-blue-700 text-lg">{t.service?.label || 'Extras Solo'}</span>
                                            {t.size && <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">{t.size.label}</span>}
                                        </div>
                                        {t.extras && t.extras.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {t.extras.map((e, idx) => (
                                                    <span key={`${e.id}-${idx}`} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-1 rounded font-medium">+ {e.label}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                        <div className="text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">Lavadores Asignados</div>
                                        <div className="flex flex-wrap gap-2">
                                            {t.washers?.map(w => <span key={w} className="bg-white text-gray-700 border border-gray-200 px-3 py-1 rounded-lg text-sm font-bold shadow-sm">{w}</span>)}
                                        </div>
                                    </div>
                                </div>

                                {role !== 'CASHIER' && (
                                    <div className="flex gap-3 pt-2">
                                        <Button onClick={() => startEdit(t)} variant="warning" className="flex-1 py-2 text-sm"><Pencil size={16} /> Editar</Button>
                                        <Button onClick={() => handleReprint(t)} variant="secondary" className="flex-1 py-2 text-sm"><Printer size={16} /> Imprimir</Button>
                                        <Button onClick={() => deleteTicket(t.id)} variant="danger" className="flex-1 py-2 text-sm"><Trash2 size={16} /> Borrar</Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};