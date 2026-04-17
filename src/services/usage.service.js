import prisma from '../prisma/index.js';

/**
 * Get aggregated counts of processed pages for a CA.
 */
export const getProcessedPageTotals = async (caId) => {
    const totals = await prisma.processedPage.groupBy({
        by: ['type'],
        where: { caId },
        _sum: {
            count: true
        }
    });

    const result = {
        BANK_STATEMENT: 0,
        TOTAL: 0
    };

    totals.forEach(t => {
        if (t.type === 'BANK_STATEMENT') {
            result.BANK_STATEMENT = t._sum.count || 0;
            result.TOTAL += t._sum.count || 0;
        }
    });

    return result;
};

/**
 * Get detailed history of processed pages for a CA.
 */
export const getUsageHistory = async (caId) => {
    return prisma.processedPage.findMany({
        where: { caId },
        orderBy: { createdAt: 'desc' },
        include: {
            client: {
                select: { name: true, gstin: true }
            }
        }
    });
};
