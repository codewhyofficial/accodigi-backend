import prisma from '../prisma/index.js';
import AppError from '../utils/AppError.js';

export const createClient = async (caId, data) => {
    const existingClient = await prisma.client.findFirst({
        where: {
            OR: [
                { phoneNumber: data.phoneNumber },
                { gstin: data.gstin }
            ]
        }
    });

    if (existingClient) {
        if (existingClient.caId !== caId) {
            throw new AppError('Client already exists with another CA. Please request transfer.', 409);
        }
        throw new AppError('Client already exists.', 400);
    }

    const client = await prisma.client.create({
        data: {
            ...data,
            caId,
            status: 'PENDING'
        }
    });

    return client;
};

export const getClients = async (caId) => {
    return prisma.client.findMany({
        where: { caId }
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


