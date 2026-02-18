import React, { useState, useContext } from 'react';
import { AppContext } from '../../context/AppContext';
import { PlusCircle, Banknote } from 'lucide-react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import AdminCorte from './AdminCorte';
import AdminNomina from './AdminNomina';
import AdminAsistencia from './AdminAsistencia';
import AdminBusinessExpenses from './AdminBusinessExpenses';
import AdminConfig from './AdminConfig';
import AdminPrecios from './AdminPrecios';

const AdminPanel = () => {
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
                        <div><label className="block text-sm font-bold text-gray-600 mb-1">Monto (MXN)</label><input type="number" value={acMxn} onChange={e => setAcMxn(e.target.value)} className="w-full border p-3 rounded-lg font-bold text-lg" placeholder="0.00" /></div>
                        <div><label className="block text-sm font-bold text-gray-600 mb-1">Monto (USD)</label><input type="number" value={acUsd} onChange={e => setAcUsd(e.target.value)} className="w-full border p-3 rounded-lg font-bold text-lg" placeholder="0.00" /></div>
                        <div><label className="block text-sm font-bold text-gray-600 mb-1">Razón (Opcional)</label><input value={acReason} onChange={e => setAcReason(e.target.value)} className="w-full border p-3 rounded-lg" placeholder="Ej. Refill de cambio" /></div>
                    </div>
                </Modal>
            )}
        </div>
    );
};
export default AdminPanel;
