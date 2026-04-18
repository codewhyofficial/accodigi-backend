import prisma from '../prisma/index.js';

/**
 * Get aggregated counts of processed pages for a CA, grouped by type.
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
                select: { name: true }
            }
        }
    });
};

/**
 * Get per-client summary of pages processed for a CA.
 * Groups by clientId and sums all page counts.
 */
export const getPerClientSummary = async (caId) => {
    // Aggregate page counts by client
    const grouped = await prisma.processedPage.groupBy({
        by: ['clientId'],
        where: { caId },
        _sum: { count: true },
        _max: { createdAt: true } // latest upload date per client
    });

    if (grouped.length === 0) return [];

    const clientIds = grouped.map(g => g.clientId);

    // Fetch client names in one query
    const clients = await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, name: true }
    });

    const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]));

    // Merge and sort by total pages descending
    return grouped
        .map(g => ({
            clientId: g.clientId,
            clientName: clientMap[g.clientId] || 'Unknown Client',
            totalPages: g._sum.count || 0,
            lastUploadAt: g._max.createdAt
        }))
        .sort((a, b) => b.totalPages - a.totalPages);
};
