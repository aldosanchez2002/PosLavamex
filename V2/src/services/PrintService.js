import { formatCurrency } from '../utils/helpers';

export const PrintService = {
    normalizeText: (str) => {
        if (!str) return '';
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    },

    print: async (content, role) => {
        if (role === 'CASHIER' || role === 'ADMIN') {
            const printWindow = window.open('', '_blank', 'width=400,height=600');
            if (printWindow) {
                printWindow.document.write(`
                    <html>
                        <head>
                            <title>Imprimir Ticket</title>
                            <style>
                                @page { margin: 0; } 
                                body { 
                                    font-family: monospace; 
                                    white-space: pre; 
                                    margin: 10px; 
                                    padding: 0; 
                                    font-size: 12px; 
                                }
                            </style>
                        </head>
                        <body>
                            ${content}
                            <script>
                                window.onload = function() {
                                    window.print();
                                    setTimeout(function() { window.close(); }, 500);
                                }
                            <\/script>
                        </body>
                    </html>
                `);
                printWindow.document.close();
            } else {
                alert("Por favor permite ventanas emergentes para imprimir el ticket.");
            }
        }
        else {
            if (navigator.share) {
                try {
                    await navigator.share({
                        text: "<HTML>" + content
                    });
                } catch (err) {
                    console.error("Share failed:", err);
                }
            } else {
                alert("Tu navegador no soporta compartir. Copia el texto manualmente.");
                console.log("<HTML>" + content);
            }
        }
    },

    getJobTicketHtml: (ticket, shortId) => {
        const rawWashers = ticket.washers ? ticket.washers : (ticket.washer ? [ticket.washer] : []);
        const cleanWashers = rawWashers.map(w => PrintService.normalizeText(w)).join(', ');

        return `<div style="white-space: pre; font-family: monospace;">
--------------------------------
TICKET: #${shortId}
${ticket.vehicleDesc ? ticket.vehicleDesc.toUpperCase() : ''}
--------------------------------
${cleanWashers}
${ticket.size ? ticket.size.label : ''}
${ticket.service ? ticket.service.label : 'Extras Only'}
${ticket.extras && ticket.extras.length > 0 ? ticket.extras.map(e => `+ ${e.label}`).join('\n') : ''}
--------------------------------</div>`;
    },

    getReceiptHtml: (ticket, payment, shortId, currentSnackPrice) => {
        const isOnlyUsd = payment.isOnlyUsd;
        const changeStr = isOnlyUsd
            ? `Cambio: $${(payment.changeUsd || 0).toFixed(2)} USD`
            : `Cambio: $${(payment.changeMxn || 0).toFixed(2)} MXN`;

        const receivedStr = [
            payment.usd > 0 ? `$${payment.usd.toFixed(2)} USD` : null,
            payment.mxn > 0 ? `$${payment.mxn.toFixed(2)} MXN` : null
        ].filter(Boolean).join(' / ');

        return `<div style="white-space: pre; font-family: monospace;">
CARWASH LAVAMEX
WATERFILL 216 CP 32553
CD. JUAREZ CHIH.
RFC. CACN760904AN7
--------------------------------
Ticket: #${shortId}
${ticket.vehicleDesc ? ticket.vehicleDesc.toUpperCase() : ''}
Fecha: ${new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
Metodo: ${payment.method === 'CARD' ? 'TARJETA' : 'EFECTIVO'}
--------------------------------
${ticket.service ? ticket.service.label : 'General'} $${ticket.basePrice || 0}
${ticket.extras && ticket.extras.length > 0 ? ticket.extras.map(e => `+ ${e.label} $${e.price}`).join('\n') : ''}
${ticket.snackCount > 0 ? `+ Snacks (${ticket.snackCount}) $${ticket.snackCount * (currentSnackPrice || 30)}` : ''}
--------------------------------
TOTAL: $${ticket.price}
${payment.method === 'CASH' ? `Recibido: ${receivedStr}\n${changeStr}` : ''}
Gracias por su preferencia
      .--------.
 ____/_____|___ \___
O    _          - |    _,*
 '--(_)-------(_)--' </div>`;
    },

    getCashDropTicketHtml: (dropData) => {
        return `<div style="white-space: pre; font-family: monospace;">
RETIRO DE EFECTIVO
(Resguardo)
--------------------------------
CODIGO: ${dropData.code}
FECHA: ${dropData.timestamp.toLocaleDateString()}
HORA: ${dropData.timestamp.toLocaleTimeString()}
USUARIO: ${dropData.user}
--------------------------------
MXN: ${formatCurrency(dropData.amountMxn)}
USD: $${dropData.amountUsd.toFixed(2)}
--------------------------------
Firma: __________________
</div>`;
    }
};