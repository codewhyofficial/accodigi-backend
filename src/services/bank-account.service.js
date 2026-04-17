import prisma from '../prisma/index.js';

/**
 * Enhanced continuity calculation for a bank account
 * Sorts statements chronologically and checks for balance mismatches and time gaps.
 */
export const calculateContinuity = async (accountId) => {
    // 1. Fetch statements with basic info
    const statements = await prisma.bankStatement.findMany({
        where: { bankAccountId: accountId },
        select: {
            id: true,
            fileName: true,
            openingBalance: true,
            closingBalance: true,
            createdAt: true
        }
    });

    if (statements.length === 0) return { status: 'SUCCESS', discrepancies: [] };

    // 2. Fetch date ranges for each statement to allow chronological sorting
    const dateRanges = await prisma.bankTransaction.groupBy({
        by: ['bankStatementId'],
        where: { bankStatement: { bankAccountId: accountId } },
        _min: { date: true },
        _max: { date: true }
    });

    const dateMap = {};
    dateRanges.forEach(dr => {
        dateMap[dr.bankStatementId] = {
            min: dr._min.date,
            max: dr._max.date
        };
    });

    // 3. Attach dates and sort
    const sortedStatements = statements.map(s => {
        const firstDate = dateMap[s.id]?.min;
        const lastDate = dateMap[s.id]?.max;
        return {
            ...s,
            firstDate: firstDate || new Date(0),
            lastDate: lastDate || new Date(0),
            periodStr: firstDate ? `${firstDate.toLocaleDateString()} to ${lastDate.toLocaleDateString()}` : 'No Transactions'
        };
    }).sort((a, b) => {
        const dateDiff = a.firstDate - b.firstDate;
        return dateDiff !== 0 ? dateDiff : a.createdAt - b.createdAt;
    });

    // 4. Analyze
    const discrepancies = [];
    let status = 'SUCCESS';

    for (let i = 0; i < sortedStatements.length - 1; i++) {
        const current = sortedStatements[i];
        const next = sortedStatements[i + 1];

        // Balance Check
        if (current.closingBalance !== null && next.openingBalance !== null) {
            if (Math.abs(current.closingBalance - next.openingBalance) > 0.01) {
                status = 'DISCREPANCY';
                discrepancies.push({
                    type: 'BALANCE_MISMATCH',
                    message: `Balance Mismatch: "${current.fileName}" (${current.periodStr}) ends with ${current.closingBalance}, but "${next.fileName}" (${next.periodStr}) starts with ${next.openingBalance}`,
                    statements: [current.id, next.id]
                });
            }
        }

        // Gap Check (e.g. > 10 days)
        if (current.lastDate.getTime() > 0 && next.firstDate.getTime() > 0) {
            const gapDays = (next.firstDate - current.lastDate) / (1000 * 60 * 60 * 24);
            if (gapDays > 10) {
                if (status === 'SUCCESS') status = 'GAP';
                discrepancies.push({
                    type: 'GAP_DETECTED',
                    message: `Data Gap: There are ${Math.round(gapDays)} missing days between "${current.fileName}" (ends ${current.lastDate.toLocaleDateString()}) and "${next.fileName}" (starts ${next.firstDate.toLocaleDateString()})`,
                    statements: [current.id, next.id]
                });
            }
        }
    }


    return { status, discrepancies };
};

/**
 * List all bank accounts for a client with live continuity status
 */
export const listByClient = async (clientId) => {
    const accounts = await prisma.bankAccount.findMany({
        where: { clientId },
        include: {
            _count: {
                select: { statements: true }
            }
        }
    });

    // Add continuity status to each account
    const enrichedAccounts = await Promise.all(accounts.map(async (acc) => {
        const continuity = await calculateContinuity(acc.id);
        return { ...acc, continuity };
    }));

    return enrichedAccounts;
};

/**
 * Get account details including statements and full gap analysis
 */
export const getAccountDetails = async (accountId) => {
    const account = await prisma.bankAccount.findUnique({
        where: { id: accountId },
        include: {
            statements: {
                orderBy: { createdAt: 'desc' },
                include: {
                    _count: {
                        select: { transactions: true }
                    }
                }
            }
        }
    });

    if (!account) return null;

    const continuity = await calculateContinuity(accountId);
    return { ...account, continuity };
};

/**
 * Synchronize the current balance of a bank account based on the latest chronological statement
 */
export const syncAccountBalance = async (accountId) => {
    if (!accountId) return;

    // 1. Get all statements for this account
    const statements = await prisma.bankStatement.findMany({
        where: { bankAccountId: accountId },
        select: { id: true, closingBalance: true }
    });

    if (statements.length === 0) {
        await prisma.bankAccount.update({
            where: { id: accountId },
            data: { balance: 0 }
        });
        return;
    }

    // 2. Find the one with the latest transaction date
    // We group by and find max date to identify the latest statement
    const latestTx = await prisma.bankTransaction.findFirst({
        where: { bankStatement: { bankAccountId: accountId } },
        orderBy: { date: 'desc' },
        select: { bankStatementId: true }
    });

    let targetStatementId = null;

    if (latestTx) {
        targetStatementId = latestTx.bankStatementId;
    } else {
        // Fallback to highest createdAt if no transactions exist
        const fallback = await prisma.bankStatement.findFirst({
            where: { bankAccountId: accountId },
            orderBy: { createdAt: 'desc' },
            select: { id: true }
        });
        targetStatementId = fallback?.id;
    }

    if (targetStatementId) {
        const latestStatement = await prisma.bankStatement.findUnique({
            where: { id: targetStatementId },
            select: { closingBalance: true }
        });

        await prisma.bankAccount.update({
            where: { id: accountId },
            data: { balance: latestStatement?.closingBalance || 0 }
        });
    }
};

/**
 * Manual mapping of a statement to an account
 */
export const manuallyAssignStatement = async (statementId, bankAccountId) => {
    const result = await prisma.bankStatement.update({
        where: { id: statementId },
        data: { bankAccountId }
    });

    // Sync balance for the new account
    if (bankAccountId) {
        await syncAccountBalance(bankAccountId);
    }
    
    return result;
};
/**
 * Delete a bank account and all its statements/transactions (via cascade)
 */
export const deleteAccount = async (accountId, clientId) => {
    // 1. Verify existence and ownership
    const account = await prisma.bankAccount.findFirst({
        where: { id: accountId, clientId }
    });

    if (!account) throw new Error('Bank account not found');

    // 2. Delete the account (BankStatement and BankTransaction will cascade)
    return prisma.bankAccount.delete({
        where: { id: accountId }
    });
};

