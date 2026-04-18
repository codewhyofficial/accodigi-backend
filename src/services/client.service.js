import prisma from '../prisma/index.js';
import AppError from '../utils/AppError.js';

export const createClient = async (caId, data) => {
    // Only check uniqueness for fields actually provided
    const orConditions = [];

    if (data.phoneNumber && data.phoneNumber.trim()) {
        orConditions.push({ phoneNumber: data.phoneNumber.trim() });
    }
    if (data.gstin && data.gstin.trim()) {
        orConditions.push({ gstin: data.gstin.trim() });
    }

    if (orConditions.length > 0) {
        const existingClient = await prisma.client.findFirst({
            where: { OR: orConditions }
        });

        if (existingClient) {
            if (existingClient.caId !== caId) {
                throw new AppError('A client with these details already exists with another account. Please request transfer.', 409);
            }
            throw new AppError('A client with these details already exists.', 400);
        }
    }

    // Clean up empty optional fields so they're stored as null
    const cleanData = {
        ...data,
        phoneNumber: data.phoneNumber?.trim() || null,
        gstin: data.gstin?.trim() || null,
        country: data.country || 'UK',
    };

    const client = await prisma.client.create({
        data: {
            ...cleanData,
            caId,
            status: 'ACTIVE'
        }
    });

    return client;
};

export const getClients = async (caId) => {
    return prisma.client.findMany({
        where: { caId },
        orderBy: { createdAt: 'desc' }
    });
};

export const getClient = async (caId, clientId) => {
    const client = await prisma.client.findFirst({
        where: { id: clientId, caId }
    });
    if (!client) throw new AppError('Client not found', 404);
    return client;
};

export const requestTransfer = async (targetCaId, clientId) => {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new AppError('Client not found', 404);

    if (client.caId === targetCaId) throw new AppError('Client already belongs to you', 400);

    return prisma.transferRequest.create({
        data: {
            clientId,
            targetCaId,
            status: 'PENDING'
        }
    });
};
