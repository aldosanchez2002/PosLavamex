import React, { useState, useContext } from 'react';
import { AppContext } from '../../context/AppContext';
import { PdfService } from '../../services/PdfService';
import { Calendar } from 'lucide-react';
import Button from '../common/Button';
import { getDocs, query, where, collection } from 'firebase/firestore';

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
export default AdminAsistencia;
