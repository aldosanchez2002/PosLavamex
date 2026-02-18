import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const firebaseConfig = {
    apiKey: "AIzaSyByIvJpBZv32Zd22fxlYWL9etzBa66Q2rE",
    authDomain: "poslavamex.firebaseapp.com",
    projectId: "poslavamex",
    storageBucket: "poslavamex.firebasestorage.app",
    messagingSenderId: "883264129",
    appId: "1:883264129:web:39a352e2ade3888b4f1b80"
};

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

export const SIZES = [
    { id: 'AUTO', label: 'Auto' },
    { id: 'SUV_CHICA', label: 'SUV Chica' },
    { id: 'PICKUP', label: 'Pick-Up / SUV MD' },
    { id: 'SUV_GDE', label: 'SUV Gde' }
];

export const SERVICES = [
    { id: 'GENERAL', label: 'Lavado General' },
    { id: 'WAX', label: 'Lavado + Cera' },
    { id: 'COMPLETE', label: 'Paquete Completo' },
    { id: 'PREMIUM', label: 'Paquete Premium' },
    { id: 'PRESIDENTIAL', label: 'Paquete Presidencial' }
];

export const DEFAULTS = {
    PINS: { GREETER: ['bWVsdnkxMDYx', 'NXJpdG83'], CASHIER: 'c2VyZ2lvOTE5MQ==', ADMIN: 'Y292aW5ndG9uNTIx' },
    EXCHANGE_RATE: 18.10,
    SNACK_PRICE: 30,
    INITIAL_EMPLOYEES: [
        { name: 'Aldo', active: true, role: 'WASHER' },
        { name: 'Sergio', active: true, role: 'WASHER' },
        { name: 'Juan', active: true, role: 'WASHER' },
        { name: 'Rodrigo', active: true, role: 'WASHER' }
    ],
    PRICES: {
        GENERAL: { AUTO: 200, SUV_CHICA: 240, PICKUP: 360, SUV_GDE: 360 },
        WAX: { AUTO: 540, SUV_CHICA: 640, PICKUP: 820, SUV_GDE: 820 },
        COMPLETE: { AUTO: 840, SUV_CHICA: 1040, PICKUP: 1160, SUV_GDE: 1640 },
        PREMIUM: { AUTO: 1180, SUV_CHICA: 1440, PICKUP: 1620, SUV_GDE: 2100 },
        PRESIDENTIAL: { AUTO: 1540, SUV_CHICA: 1940, PICKUP: 2320, SUV_GDE: 2320 },
    },
    COMMISSIONS: {
        GENERAL: { AUTO: 70, SUV_CHICA: 84, PICKUP: 126, SUV_GDE: 126 },
        WAX: { AUTO: 189, SUV_CHICA: 224, PICKUP: 287, SUV_GDE: 287 },
        COMPLETE: { AUTO: 294, SUV_CHICA: 364, PICKUP: 406, SUV_GDE: 574 },
        PREMIUM: { AUTO: 413, SUV_CHICA: 504, PICKUP: 567, SUV_GDE: 735 },
        PRESIDENTIAL: { AUTO: 539, SUV_CHICA: 679, PICKUP: 812, SUV_GDE: 812 },
    },
    EXTRAS: [
        { id: 'MOTOR', label: 'Lavado Motor', price: 400, commission: 140 },
        { id: 'CHASIS', label: 'Chasis', price: 400, commission: 140 },
        { id: 'AROMA', label: 'Aroma', price: 30, commission: 10.50 },
        { id: 'ARMORALL', label: 'Armor-All', price: 40, commission: 14 },
        { id: 'LIMP_ZONA', label: 'Limpieza por Zona', price: 200, commission: 70 },
        { id: 'LIMP_FOCOS', label: 'Limpieza de Focos', price: 340, commission: 120 },
        { id: 'ASPIRADO_CAJUELA', label: 'Aspirado de Cajuela', price: 40, commission: 14 },
    ]
};

export const handleDbAction = async (actionFn) => { try { await actionFn(); } catch (e) { alert("Error: " + e.message); console.error(e); } };
export const formatCurrency = (amount) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
export const getLocalDateStr = (d = new Date()) => { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; };
export const getMonthStr = (d = new Date()) => { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); return `${y}-${m}`; };

export const calculateTicketTotals = (serviceId, sizeId, extraList, prices, commissions, snackCount = 0, currentSnackPrice = 30) => {
    const basePrice = (serviceId && sizeId && prices[serviceId]?.[sizeId]) || 0;
    const baseComm = (serviceId && sizeId && commissions[serviceId]?.[sizeId]) || 0;
    const extrasPrice = extraList.reduce((a, b) => a + b.price, 0);
    const extrasComm = extraList.reduce((a, b) => a + b.commission, 0);
    const snackCost = snackCount * currentSnackPrice;
    return { basePrice, totalPrice: basePrice + extrasPrice + snackCost, totalCommission: baseComm + extrasComm };
};

export const calculatePayroll = (employees, history, deductions, currentCommissions, currentExtras) => {
    const payroll = {};
    const initPayrollItem = () => {
        const item = { count: 0, total: 0, serviceGrid: {}, extrasData: {}, deductionTotal: 0, deductionDetails: [], netPay: 0, debugDetails: [] };
        SERVICES.forEach(svc => { item.serviceGrid[svc.id] = {}; SIZES.forEach(sz => item.serviceGrid[svc.id][sz.id] = 0); });
        return item;
    };

    employees.forEach(emp => { payroll[emp.name] = initPayrollItem(); });
    const totalGrossSales = history.reduce((acc, t) => acc + (t.price || 0), 0);

    employees.forEach(emp => {
        const empName = emp.name;
        const p = payroll[empName];

        history.forEach(item => {
            const washersList = item.washers || (item.washer ? [item.washer] : []);
            if (washersList.includes(empName)) {
                const washerCount = washersList.length;
                if (washerCount === 0) return;

                let totalTicketCommission = item.commission || 0;
                if (!totalTicketCommission || totalTicketCommission === 0) {
                    let base = 0;
                    if (item.service && item.size && currentCommissions && currentCommissions[item.service.id]) { base = currentCommissions[item.service.id][item.size.id] || 0; }
                    const extrasTotal = (item.extras || []).reduce((acc, e) => {
                        const dbExtra = currentExtras ? currentExtras.find(dbEx => dbEx.id === e.id) : null;
                        const val = dbExtra ? (dbExtra.commission || 0) : (e.commission || 0);
                        return acc + val;
                    }, 0);
                    totalTicketCommission = base + extrasTotal;
                }

                const sharePerWasher = totalTicketCommission / washerCount;
                p.total += sharePerWasher;
                p.count += 1;

                if (item.service && item.size) { if (p.serviceGrid[item.service.id] && p.serviceGrid[item.service.id][item.size.id] !== undefined) { p.serviceGrid[item.service.id][item.size.id] += 1; } }

                if (item.extras && item.extras.length > 0) {
                    item.extras.forEach(ex => {
                        const dbExtra = currentExtras ? currentExtras.find(dbEx => dbEx.id === ex.id) : null;
                        const commissionValue = dbExtra ? (dbExtra.commission || 0) : (ex.commission || 0);
                        const share = commissionValue / washerCount;
                        if (!p.extrasData[ex.label]) p.extrasData[ex.label] = { count: 0, total: 0 };
                        p.extrasData[ex.label].count += 1;
                        p.extrasData[ex.label].total += share;
                    });
                }
            }
        });
    });

    employees.forEach(emp => {
        if (emp.role === 'SUPERVISOR' && payroll[emp.name]) {
            const baseSalary = parseFloat(emp.baseSalary) || 0;
            const commPct = parseFloat(emp.commissionPct) || 0;
            const salesComm = totalGrossSales * (commPct / 100);
            payroll[emp.name].total = baseSalary + salesComm;
            payroll[emp.name].extrasData = {};
            if (baseSalary > 0) payroll[emp.name].extrasData['SUELDO BASE'] = { count: 1, total: baseSalary };
            if (salesComm > 0) payroll[emp.name].extrasData['COMISIÓN VENTAS'] = { count: 1, total: salesComm };
        }
    });

    deductions.forEach(d => {
        if (!payroll[d.employee]) payroll[d.employee] = initPayrollItem();
        payroll[d.employee].deductionTotal += d.amount;
        payroll[d.employee].deductionDetails.push({ date: d.timestamp, desc: d.description, amount: d.amount });
    });

    Object.keys(payroll).forEach(key => { payroll[key].netPay = payroll[key].total - payroll[key].deductionTotal; });
    return payroll;
};

export const validatePin = (input) => {
    try {
        const encoded = btoa(input.toLowerCase().trim());
        if (DEFAULTS.PINS.GREETER.includes(encoded)) return 'GREETER';
        if (encoded === DEFAULTS.PINS.CASHIER) return 'CASHIER';
        if (encoded === DEFAULTS.PINS.ADMIN) return 'ADMIN';
    } catch (e) { return null; }
    return null;
};

export const toggleSelection = (list, item, limit = null) => {
    const isObj = typeof item !== 'string';
    const exists = isObj ? list.some(x => x.id === item.id) : list.includes(item);
    if (!exists && limit && list.length >= limit) return list;
    return exists ? list.filter(x => isObj ? x.id !== item.id : x !== item) : [...list, item];
};

export const PrintService = {
    normalizeText: (str) => { if (!str) return ''; return str.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); },
    print: async (content, role) => {
        if (role === 'CASHIER' || role === 'ADMIN') {
            const printWindow = window.open('', '_blank', 'width=400,height=600');
            if (printWindow) {
                printWindow.document.write(`<html><head><style>@page { margin: 0; } body { font-family: monospace; white-space: pre; margin: 10px; padding: 0; font-size: 12px; }</style></head><body>${content}<script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); }<\/script></body></html>`);
                printWindow.document.close();
            } else { alert("Permite ventanas emergentes para imprimir el ticket."); }
        } else {
            if (navigator.share) { try { await navigator.share({ text: "<HTML>" + content }); } catch (err) { console.error(err); } }
            else { alert("Copia el texto manualmente."); console.log("<HTML>" + content); }
        }
    },
    getJobTicketHtml: (ticket, shortId) => {
        const cleanWashers = (ticket.washers || [ticket.washer]).map(w => PrintService.normalizeText(w)).join(', ');
        return `<div style="white-space: pre; font-family: monospace;">\n--------------------------------\nTICKET: #${shortId}\n${ticket.vehicleDesc ? ticket.vehicleDesc.toUpperCase() : ''}\n--------------------------------\n${cleanWashers}\n${ticket.size ? ticket.size.label : ''}\n${ticket.service ? ticket.service.label : 'Extras Only'}\n${ticket.extras && ticket.extras.length > 0 ? ticket.extras.map(e => `+ ${e.label}`).join('\n') : ''}\n--------------------------------</div>`;
    },
    getReceiptHtml: (ticket, payment, shortId, currentSnackPrice) => {
        const changeStr = payment.isOnlyUsd ? `Cambio: $${(payment.changeUsd || 0).toFixed(2)} USD` : `Cambio: $${(payment.changeMxn || 0).toFixed(2)} MXN`;
        const receivedStr = [payment.usd > 0 ? `$${payment.usd.toFixed(2)} USD` : null, payment.mxn > 0 ? `$${payment.mxn.toFixed(2)} MXN` : null].filter(Boolean).join(' / ');
        return `<div style="white-space: pre; font-family: monospace;">\nCARWASH LAVAMEX\nWATERFILL 216\n--------------------------------\nTicket: #${shortId}\n${ticket.vehicleDesc ? ticket.vehicleDesc.toUpperCase() : ''}\nFecha: ${new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}\nMetodo: ${payment.method === 'CARD' ? 'TARJETA' : 'EFECTIVO'}\n--------------------------------\n${ticket.service ? ticket.service.label : 'General'} $${ticket.basePrice || 0}\n${ticket.extras && ticket.extras.length > 0 ? ticket.extras.map(e => `+ ${e.label} $${e.price}`).join('\n') : ''}\n${ticket.snackCount > 0 ? `+ Snacks (${ticket.snackCount}) $${ticket.snackCount * (currentSnackPrice || 30)}` : ''}\n--------------------------------\nTOTAL: $${ticket.price}\n${payment.method === 'CASH' ? `Recibido: ${receivedStr}\n${changeStr}` : ''}\nGracias por su preferencia\n</div>`;
    },
    getCashDropTicketHtml: (dropData) => {
        return `<div style="white-space: pre; font-family: monospace;">\nRETIRO DE EFECTIVO\n--------------------------------\nCODIGO: ${dropData.code}\nFECHA: ${dropData.timestamp.toLocaleDateString()}\nHORA: ${dropData.timestamp.toLocaleTimeString()}\nUSUARIO: ${dropData.user}\n--------------------------------\nMXN: ${formatCurrency(dropData.amountMxn)}\nUSD: $${dropData.amountUsd.toFixed(2)}\n--------------------------------\nFirma: __________________\n</div>`;
    }
};

window.AppCore = { db, SIZES, SERVICES, DEFAULTS, handleDbAction, formatCurrency, getLocalDateStr, getMonthStr, calculateTicketTotals, calculatePayroll, validatePin, toggleSelection, PrintService };