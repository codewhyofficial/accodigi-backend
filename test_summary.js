import prisma from './src/prisma/index.js';

async function check() {
    // Check client invoices
    const cid = '94fc291f-c6c1-4bf6-81b6-7c7c914';
    const startDate = new Date(Date.UTC(2019, 10, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(2019, 11, 0, 23, 59, 59, 999));

    console.log("Start:", startDate.toISOString());
    console.log("End:", endDate.toISOString());

    const invoices = await prisma.invoice.findMany({
        where: {
            clientId: cid,
            OR: [
                {
                    invoiceDate: {
                        gte: startDate,
                        lte: endDate
                    }
                },
                {
                    invoiceDate: null,
                    createdAt: {
                        gte: startDate,
                        lte: endDate
                    }
                }
            ]
        }
    });

    console.log("Invoices Found:", invoices.length);
    if (invoices.length > 0) {
        console.log("ID:", invoices[0].id, "Date:", invoices[0].invoiceDate);
    }
}

check().catch(console.error).finally(() => prisma.$disconnect());
