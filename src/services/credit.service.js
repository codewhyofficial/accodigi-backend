import prisma from '../prisma/index.js';

/**
 * Deduct credits from a CA account
 * @param {string} caId - The CA ID
 * @param {number} amount - Number of credits to deduct (positive integer)
 * @param {string} description - Description of the deduction
 * @returns {Promise<Object>} The updated CA and transaction
 */
export const deductCredits = async (caId, amount, description) => {
    if (amount <= 0) return null;

    return await prisma.$transaction(async (tx) => {
        // 1. Get current CA to check balance
        const ca = await tx.cA.findUnique({
            where: { id: caId },
            select: { totalCredits: true, usedCredits: true }
        });

        if (!ca) throw new Error('CA not found');

        const available = ca.totalCredits - ca.usedCredits;
        if (available < amount) {
            const error = new Error(`Insufficient credits. Required: ${amount}, Available: ${available}. Please purchase more credits to continue.`);
            error.statusCode = 402; // Payment Required
            throw error;
        }

        // 2. Create transaction log
        const transaction = await tx.creditTransaction.create({
            data: {
                caId,
                amount: -amount,
                type: 'UPLOAD_DEDUCTION',
                description
            }
        });

        // 3. Update CA used credits
        const updatedCA = await tx.cA.update({
            where: { id: caId },
            data: {
                usedCredits: { increment: amount }
            }
        });

        return { updatedCA, transaction };
    });
};

/**
 * Adjust credits for a CA (Admin usage)
 * @param {string} caId - The CA ID
 * @param {number} amount - Positive to add, negative to subtract
 * @param {string} description - Reason for adjustment
 */
export const adjustCredits = async (caId, amount, description) => {
    return await prisma.$transaction(async (tx) => {
        // 1. Record transaction
        const transaction = await tx.creditTransaction.create({
            data: {
                caId,
                amount,
                type: 'ADMIN_ADJUSTMENT',
                description
            }
        });

        // 2. Update CA total credits if adding, or used credits if subtracting?
        // Let's keep it simple: Adjust totalCredits for additions, or usedCredits for subtractions?
        // Better: Always adjust totalCredits for balance changes.

        let updateData = {};
        if (amount > 0) {
            // Adding balance
            updateData = { totalCredits: { increment: amount } };
        } else {
            // Removing balance (subtraction)
            // We can either decrease total or increase used. Let's decrease total.
            updateData = { totalCredits: { increment: amount } }; // amount is negative
        }

        const updatedCA = await tx.cA.update({
            where: { id: caId },
            data: updateData
        });

        return { updatedCA, transaction };
    });
};

/**
 * Get credit transaction history for a CA
 */
export const getCAHistory = async (caId) => {
    return await prisma.creditTransaction.findMany({
        where: { caId },
        orderBy: { createdAt: 'desc' },
        take: 50
    });
};

/**
 * Calculate expected cost for a PDF
 * @param {number} pageCount 
 * @param {boolean} isScanned 
 */
export const calculateCost = (pageCount, isScanned) => {
    const rate = isScanned ? 2 : 1;
    return pageCount * rate;
};
