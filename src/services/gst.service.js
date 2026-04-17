import prisma from '../prisma/index.js';

/**
 * Aggregates dashboard statistics for a CA across all their clients (or a specific client)
 * @param {string} caId 
 * @param {string|null} clientId 
 */
export const getDashboardStats = async (caId, clientId = null) => {

    // Base filter applies to all bank statements belonging to clients of this CA
    const baseWhere = clientId
        ? { clientId }
        : { client: { caId } };

    // 1. Total Bank Statements Count
    const totalStatements = await prisma.bankStatement.count({ where: baseWhere });

    // 2. Pending Review Count
    const pendingReviewCount = await prisma.bankStatement.count({
        where: { ...baseWhere, status: 'PENDING' }
    });

    // 3. Error Count
    const errorCount = await prisma.bankStatement.count({
        where: { ...baseWhere, status: 'FAILED' }
    });

    // 4. Financial stats (Output Tax, ITC)
    // Note: Since Invoices were removed, we set these to 0 until BankTransaction processing logic is implemented
    return {
        totalStatements,
        pendingReviewCount,
        errorCount,
        taxableValue: 0,
        outputTax: 0,
        itc: 0
    };
};

/**
 * Buckets invoices into GSTR-1 formats.
 */
export const getGSTR1Data = async (clientId, month, year) => {
    // Only fetch OUTWARD (Sales) for GSTR-1
    const invoices = await prisma.invoice.findMany({
        where: {
            clientId,
            direction: 'OUTWARD',
            status: 'PROCESSED' // Only process valid ones
            // NOTE: In production, filter by month/year using invoiceDate
        }
    });

    const b2b = invoices.filter(i => i.invoiceType === 'B2B');
    const b2cl = invoices.filter(i => i.invoiceType === 'B2CL');
    const b2cs = invoices.filter(i => i.invoiceType === 'B2CS');
    const cdn = invoices.filter(i => i.invoiceType === 'CDN');
    const exportInvs = invoices.filter(i => i.invoiceType === 'EXPORT');

    return {
        b2b,
        b2cl,
        b2cs,
        cdn,
        export: exportInvs
    };
};

/**
 * Buckets summaries for GSTR-3B formats.
 */
export const getGSTR3BData = async (clientId, month, year) => {
    const invoices = await prisma.invoice.findMany({
        where: {
            clientId,
            status: 'PROCESSED'
            // NOTE: Filter by date here as well
        }
    });

    let outwardTaxable = 0;
    let outwardTax = 0;

    let inwardTaxable = 0;
    let inwardTax = 0; // ITC

    let rcmLiability = 0;

    invoices.forEach(inv => {
        const tax = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);
        const taxable = inv.taxableAmount || 0;

        if (inv.direction === 'OUTWARD') {
            outwardTaxable += taxable;
            outwardTax += tax;
        } else if (inv.direction === 'INWARD') {
            inwardTaxable += taxable;
            inwardTax += tax;
        }

        if (inv.invoiceType === 'RCM' || inv.reverseChargeFlag) {
            rcmLiability += tax;
        }
    });

    return {
        outwardSupplies: {
            taxableValue: outwardTaxable,
            taxAmount: outwardTax
        },
        eligibleITC: {
            taxAmount: inwardTax
        },
        rcm: {
            liability: rcmLiability
        }
    };
};
