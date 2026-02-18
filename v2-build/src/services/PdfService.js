import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, SIZES, SERVICES } from '../utils/helpers';

export const PdfService = {
    generateNomina: (payroll, startDate, endDate, history = []) => {
        const doc = new jsPDF();
        const formatDate = (s) => s ? s.split('-').reverse().join('-') : '';

        Object.keys(payroll).forEach((name, index) => {
            const p = payroll[name];
            if (p.count === 0 && p.deductionTotal === 0 && p.total === 0) return;
            if (index > 0) doc.addPage();

            doc.setFontSize(14);
            doc.text(`${name}`, 14, 25);
            doc.setFontSize(10);
            doc.text(`Periodo: ${formatDate(startDate)} al ${formatDate(endDate)}`, 14, 30);

            // --- SUMMARY VERTICAL ---
            doc.setFontSize(9);
            doc.setTextColor(60, 60, 60);
            doc.text(`${formatCurrency(p.total)} Subtotal Ingresos`, 14, 36);
            doc.text(`-${formatCurrency(p.deductionTotal)} Deducciones`, 14, 40);
            doc.setFont(undefined, 'bold');
            doc.text(`${formatCurrency(p.netPay)} Total`, 14, 44);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(0);
            // --------------------

            doc.setDrawColor(0);
            doc.setFillColor(255, 255, 255);
            doc.rect(140, 20, 50, 20);
            doc.setFontSize(12);
            doc.text("TOTAL A PAGAR", 165, 26, { align: 'center' });
            doc.setFontSize(16);
            doc.setTextColor(0, 0, 0);
            doc.text(formatCurrency(p.netPay), 165, 35, { align: 'center' });
            doc.setTextColor(0);

            const head = [['Servicio', ...SIZES.map(s => s.label)]];
            const body = [];
            SERVICES.forEach(svc => {
                const rowCounts = SIZES.map(sz => p.serviceGrid[svc.id][sz.id] || 0);
                if (rowCounts.some(c => c > 0)) {
                    body.push([svc.label, ...rowCounts.map(c => c || '-')]);
                }
            });

            const tableStyles = {
                theme: 'grid',
                headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1, lineColor: [0, 0, 0] },
                bodyStyles: { textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [0, 0, 0] },
                styles: { fontSize: 8, cellPadding: 1, lineColor: [0, 0, 0] }
            };

            autoTable(doc, {
                startY: 50,
                head: head,
                body: body,
                ...tableStyles
            });

            let currentY = doc.lastAutoTable.finalY + 10;

            const extraKeys = Object.keys(p.extrasData).sort();
            if (extraKeys.length > 0) {
                const extrasBody = extraKeys.map(k => [k, p.extrasData[k].count, formatCurrency(p.extrasData[k].total)]);
                autoTable(doc, {
                    startY: currentY,
                    head: [['Concepto', 'Cant', 'Total']],
                    body: extrasBody,
                    ...tableStyles,
                    margin: { right: 100 }
                });
                currentY = doc.lastAutoTable.finalY + 10;
            }

            if (p.deductionDetails && p.deductionDetails.length > 0) {
                const dedBody = p.deductionDetails.map(d => [
                    d.desc || 'Varios',
                    formatCurrency(d.amount)
                ]);
                dedBody.push(['TOTAL DEDUCCIONES', formatCurrency(p.deductionTotal)]);

                autoTable(doc, {
                    startY: currentY,
                    head: [['Concepto', 'Monto']],
                    body: dedBody,
                    ...tableStyles,
                    margin: { right: 100 },
                    didParseCell: function (data) {
                        if (data.row.index === dedBody.length - 1) {
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                });
                currentY = doc.lastAutoTable.finalY + 10;
            } else if (p.deductionTotal > 0) {
                doc.setTextColor(0, 0, 0);
                doc.text(`Deducciones: -${formatCurrency(p.deductionTotal)}`, 14, currentY);
                doc.setTextColor(0);
                currentY += 10;
            }

            doc.setFontSize(8);
            const legalText = "Recibí la cantidad descrita a mi entera satisfacción. Recibi el importe indicado a el periodo señalado por jornada  diurna. No reservándome acción ni derecho alguno que ejercitar por ninguna vía laboral o civil";
            const splitText = doc.splitTextToSize(legalText, 180);
            doc.text(splitText, 14, currentY + 10);

            doc.line(70, currentY + 40, 140, currentY + 40);
            doc.text(name, 105, currentY + 45, { align: 'center' });
            doc.text("Firma de Conformidad", 105, currentY + 50, { align: 'center' });
        });

        if (history && history.length > 0) {
            let boleadaCount = 0;
            history.forEach(t => {
                if (t.extras && Array.isArray(t.extras)) {
                    t.extras.forEach(e => {
                        if (['BOLEADA', 'QA_BOLEADA'].includes(e.id)) {
                            boleadaCount++;
                        }
                    });
                }
            });

            if (boleadaCount > 0) {
                doc.addPage();
                const boleroRate = 30;
                const boleroTotal = boleadaCount * boleroRate;

                doc.setFontSize(14);
                doc.text("Bolero - Raul Barron Reza", 14, 25);
                doc.setFontSize(10);
                doc.text(`Periodo: ${formatDate(startDate)} al ${formatDate(endDate)}`, 14, 30);

                doc.setDrawColor(0);
                doc.setFillColor(255, 255, 255);
                doc.rect(140, 20, 50, 20);
                doc.setFontSize(12);
                doc.text("TOTAL A PAGAR", 165, 26, { align: 'center' });
                doc.setFontSize(16);
                doc.setTextColor(0, 0, 0);
                doc.text(formatCurrency(boleroTotal), 165, 35, { align: 'center' });
                doc.setTextColor(0);

                autoTable(doc, {
                    startY: 45,
                    head: [['Concepto', 'Cantidad', 'Tarifa', 'Total']],
                    body: [
                        ['Boleadas', boleadaCount, formatCurrency(boleroRate), formatCurrency(boleroTotal)]
                    ],
                    theme: 'grid',
                    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1, lineColor: [0, 0, 0] },
                    bodyStyles: { textColor: [0, 0, 0], lineWidth: 0.1, lineColor: [0, 0, 0] },
                    styles: { fontSize: 10, cellPadding: 1, lineColor: [0, 0, 0] }
                });

                let currentY = doc.lastAutoTable.finalY + 20;
                doc.setFontSize(8);
                const legalText = "Recibí de LAVAMEX la cantidad descrita a mi entera satisfacción por concepto de pago por servicios de boleado realizados. No reservándome acción ni derecho alguno que ejercitar por ninguna vía laboral, civil o mercantil.";
                const splitText = doc.splitTextToSize(legalText, 180);
                doc.text(splitText, 14, currentY);

                doc.line(70, currentY + 30, 140, currentY + 30);
                doc.text("Bolero - Raul Barron Reza", 105, currentY + 35, { align: 'center' });
                doc.text("Firma de Conformidad", 105, currentY + 40, { align: 'center' });
            }
        }

        doc.save(`Nomina_${startDate}_${endDate}.pdf`);
    },

    generateCorte: (data) => {
        const doc = new jsPDF();
        const { totals, itemStats, expenses, arqueos } = data;
        const pageWidth = doc.internal.pageSize.width;
        const lightGrey = [240, 240, 240];
        const black = [0, 0, 0];

        const centerText = (text, y, size = 12) => {
            doc.setFontSize(size);
            doc.text(text, pageWidth / 2, y, { align: 'center' });
        };

        centerText(`CORTE ${data.type.toUpperCase()}`, 15, 18);
        centerText(`Fecha: ${data.dateLabel}`, 22, 10);

        const balanceBody = [
            ['FONDO INICIAL (SISTEMA)', formatCurrency(totals.initialMxn), `$${totals.initialUsd.toFixed(2)}`],
            ['+ VENTAS (EFECTIVO)', formatCurrency(totals.cashMxn), `$${totals.cashUsd.toFixed(2)}`],
            ['+ INGRESOS EXTRA', formatCurrency(totals.cashInsMxn), `$${totals.cashInsUsd.toFixed(2)}`],
            ['- GASTOS', `(${formatCurrency(totals.expenses)})`, `$0.00`],
            ['- ENVÍOS (RETIROS)', `(${formatCurrency(totals.dropsMxn)})`, `($${totals.dropsUsd.toFixed(2)})`],
            ['= TOTAL EN CAJA (DEBE HABER)', formatCurrency(totals.cashNetMxn), `$${totals.cashNetUsd.toFixed(2)}`]
        ];

        autoTable(doc, {
            startY: 28,
            head: [['CONCEPTO', 'MXN', 'USD']],
            body: balanceBody,
            theme: 'grid',
            headStyles: { fillColor: lightGrey, textColor: black, halign: 'center', fontSize: 9, lineWidth: 0.1, lineColor: [200, 200, 200] },
            columnStyles: {
                0: { cellWidth: 80 },
                1: { halign: 'right', cellWidth: 50 },
                2: { halign: 'right', cellWidth: 50 }
            },
            styles: { fontSize: 8, cellPadding: 1.5, textColor: black },
            didParseCell: (data) => {
                if (data.row.index === balanceBody.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [250, 250, 250];
                }
            }
        });

        let currentY = doc.lastAutoTable.finalY + 6;
        doc.setFontSize(11);
        doc.text("Resumen Operativo", 14, currentY);

        const statsBody = [
            ['Tickets Pagados', data.tickets.length, formatCurrency(totals.total)],
            ['Venta Tarjeta', '-', formatCurrency(totals.card)],
            ['Pinos', itemStats.pinos.count, formatCurrency(itemStats.pinos.money)],
            ['Boleadas', itemStats.boleadas.count, formatCurrency(itemStats.boleadas.money)],
            ['Snacks (Clientes)', itemStats.snacks.customerCount, formatCurrency(itemStats.snacks.moneyCustomer)],
            ['Snacks (Interno)', itemStats.snacks.internalCount, formatCurrency(itemStats.snacks.moneyInternal)],
        ];

        autoTable(doc, {
            startY: currentY + 2,
            head: [['CONCEPTO', 'CANTIDAD', 'TOTAL (MXN)']],
            body: statsBody,
            theme: 'striped',
            headStyles: { fillColor: lightGrey, textColor: black, fontSize: 9, lineWidth: 0.1, lineColor: [200, 200, 200] },
            columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
            styles: { fontSize: 8, cellPadding: 1.5, textColor: black }
        });

        currentY = doc.lastAutoTable.finalY + 6;
        if (expenses.length > 0) {
            doc.setFontSize(11);
            doc.text("Desglose de Gastos", 14, currentY);
            const expenseBody = expenses.map(e => [e.description, e.status, formatCurrency(e.amount)]);
            expenseBody.push(['TOTAL GASTOS', '', formatCurrency(totals.expenses)]);

            autoTable(doc, {
                startY: currentY + 2,
                head: [['DESCRIPCIÓN', 'ESTADO', 'MONTO']],
                body: expenseBody,
                theme: 'striped',
                headStyles: { fillColor: lightGrey, textColor: black, fontSize: 9, lineWidth: 0.1, lineColor: [200, 200, 200] },
                columnStyles: { 2: { halign: 'right' } },
                styles: { fontSize: 8, cellPadding: 1.5, textColor: black },
                didParseCell: (data) => {
                    if (data.row.index === expenseBody.length - 1) data.cell.styles.fontStyle = 'bold';
                }
            });
        }

        currentY = doc.lastAutoTable.finalY + 10;

        if (arqueos && arqueos.first && arqueos.last) {
            doc.setFontSize(11);
            doc.text("Corte de Caja", 14, currentY);

            const first = arqueos.first;
            const last = arqueos.last;
            
            const physDeltaMxn = last.declaredMxn - first.declaredMxn;
            const physDeltaUsd = last.declaredUsd - first.declaredUsd;
            const sysDeltaMxn = totals.cashNetMxn - totals.initialMxn;
            const sysDeltaUsd = totals.cashNetUsd - totals.initialUsd;
            const diffMxn = physDeltaMxn - sysDeltaMxn;
            const diffUsd = physDeltaUsd - sysDeltaUsd;
            const finalRate = last.exchangeRate || totals.exchangeRate || 18.0;
            const totalDiffMxn = diffMxn + (diffUsd * finalRate);

            const formatTime = (ts) => ts && ts.toDate ? ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (ts instanceof Date ? ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

            const arqueoBody = [
                [`Arqueo Inicial (${formatTime(first.timestamp)})`, formatCurrency(first.declaredMxn), `$${first.declaredUsd.toFixed(2)}`],
                [`Arqueo Final (${formatTime(last.timestamp)})`, formatCurrency(last.declaredMxn), `$${last.declaredUsd.toFixed(2)}`],
                ['', '', ''],
                ['Diferencia de Arqueos', formatCurrency(physDeltaMxn), `$${physDeltaUsd.toFixed(2)}`],
                ['Diferencia debe ser', formatCurrency(sysDeltaMxn), `$${sysDeltaUsd.toFixed(2)}`],
                ['', '', ''],
                ['DIFERENCIA OPERATIVA', formatCurrency(diffMxn), `$${diffUsd.toFixed(2)}`]
            ];

            autoTable(doc, {
                startY: currentY + 3,
                head: [['CONCEPTO', 'MXN', 'USD']],
                body: arqueoBody,
                theme: 'grid',
                headStyles: { fillColor: lightGrey, textColor: black, fontSize: 9, lineWidth: 0.1, lineColor: [200, 200, 200] },
                columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
                styles: { fontSize: 8, cellPadding: 1.5, textColor: black },
                didParseCell: (data) => {
                    if (data.row.index === arqueoBody.length - 1) {
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            });

            const boxY = doc.lastAutoTable.finalY + 6;
            doc.setDrawColor(0);
            doc.setFillColor(252, 252, 252);
            doc.roundedRect(pageWidth - 90, boxY, 80, 20, 3, 3, 'S');
            doc.setFontSize(9);
            doc.setTextColor(50);
            doc.text("DIFERENCIA TOTAL (MXN)", pageWidth - 50, boxY + 6, { align: 'center' });
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');

            let diffColor = [0, 0, 0];
            let diffPrefix = "";
            if (totalDiffMxn > 1) { diffColor = [0, 150, 0]; diffPrefix = "+"; }
            else if (totalDiffMxn < -1) { diffColor = [200, 0, 0]; }

            doc.setTextColor(...diffColor);
            doc.text(`${diffPrefix}${formatCurrency(totalDiffMxn)}`, pageWidth - 50, boxY + 14, { align: 'center' });
            doc.setTextColor(0);
            doc.setFont(undefined, 'normal');

            doc.roundedRect(14, boxY, 80, 20, 3, 3, 'S');
            doc.setFontSize(9);
            doc.setTextColor(50);
            doc.text("TOTAL VENTAS (MXN)", 54, boxY + 6, { align: 'center' });
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(0);
            doc.text(formatCurrency(totals.total), 54, boxY + 14, { align: 'center' });
            doc.setFont(undefined, 'normal');
        } else {
            doc.setFontSize(9);
            doc.setTextColor(150);
            doc.text("No hay suficientes registros de arqueo para calcular el flujo comparativo.", 14, currentY + 6);
        }

        doc.save(`Corte_${data.dateLabel}.pdf`);
    },

    generateAttendance: (monthLabel, employees, attendanceData, daysInMonth) => {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(18);
        doc.text(`REPORTE DE ASISTENCIA: ${monthLabel}`, 14, 20);
        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
        const head = [['Empleado', ...days.map(d => String(d))]];
        const body = employees.map(emp => {
            const row = [emp.name];
            days.forEach(day => {
                const dateStr = `${monthLabel}-${String(day).padStart(2, '0')}`;
                const isPresent = attendanceData[dateStr]?.[emp.name];
                row.push(isPresent ? 'X' : '');
            });
            return row;
        });

        autoTable(doc, {
            startY: 30,
            head: head,
            body: body,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1, halign: 'center' },
            columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 40 } },
            headStyles: { fillColor: [44, 62, 80] }
        });
        doc.save(`Asistencia_${monthLabel}.pdf`);
    }
};
