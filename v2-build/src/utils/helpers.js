import { SIZES, SERVICES, DEFAULTS } from '../config/constants';
export { SIZES, SERVICES, DEFAULTS };

export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN'
    }).format(amount);
};

export const getLocalDateStr = (d = new Date()) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const getMonthStr = (d = new Date()) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
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

export const calculateTicketTotals = (serviceId, sizeId, extraList, prices, commissions, snackCount = 0, currentSnackPrice = 30) => {
    const basePrice = (serviceId && sizeId && prices[serviceId]?.[sizeId]) || 0;
    const baseComm = (serviceId && sizeId && commissions[serviceId]?.[sizeId]) || 0;
    const extrasPrice = extraList.reduce((a, b) => a + b.price, 0);
    const extrasComm = extraList.reduce((a, b) => a + b.commission, 0);
    const snackCost = snackCount * currentSnackPrice;

    return {
        basePrice,
        totalPrice: basePrice + extrasPrice + snackCost,
        totalCommission: baseComm + extrasComm
    };
};

export const calculatePayroll = (employees, history, deductions, currentCommissions, currentExtras) => {
    const payroll = {};
    const initPayrollItem = () => {
        const item = { count: 0, total: 0, serviceGrid: {}, extrasData: {}, deductionTotal: 0, deductionDetails: [], netPay: 0, debugDetails: [] };
        SERVICES.forEach(svc => {
            item.serviceGrid[svc.id] = {};
            SIZES.forEach(sz => item.serviceGrid[svc.id][sz.id] = 0);
        });
        return item;
    };

    employees.forEach(emp => {
        payroll[emp.name] = initPayrollItem();
    });

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
                    if (item.service && item.size && currentCommissions && currentCommissions[item.service.id]) {
                        base = currentCommissions[item.service.id][item.size.id] || 0;
                    }
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

                if (item.service && item.size) {
                    if (p.serviceGrid[item.service.id] && p.serviceGrid[item.service.id][item.size.id] !== undefined) {
                        p.serviceGrid[item.service.id][item.size.id] += 1;
                    }
                }

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
            const newTotal = baseSalary + salesComm;

            payroll[emp.name].total = newTotal;
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
