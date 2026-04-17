import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma/index.js';
import AppError from '../utils/AppError.js';
import config from '../config/env.js';

const signToken = (id, role) => {
    return jwt.sign({ id, role }, config.jwt.secret, {
        expiresIn: config.jwt.accessExpiry,
    });
};

export const createAdmin = async (data) => {
    const { name, email, password, role } = data;

    const existingAdmin = await prisma.admin.findUnique({ where: { email } });
    if (existingAdmin) {
        throw new AppError('Email already in use', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await prisma.admin.create({
        data: {
            name,
            email,
            password: hashedPassword,
            role: role || 'ADMIN', // Default to ADMIN if not specified
        },
    });

    newAdmin.password = undefined;
    return newAdmin;
};

export const loginAdmin = async (email, password) => {
    if (!email || !password) {
        throw new AppError('Please provide email and password', 400);
    }

    const admin = await prisma.admin.findUnique({ where: { email } });

    if (!admin || !(await bcrypt.compare(password, admin.password))) {
        throw new AppError('Incorrect email or password', 401);
    }

    const token = signToken(admin.id, admin.role);

    admin.password = undefined;
    return { admin, token };
};


export const getAllClients = async () => {
    return await prisma.client.findMany({
        select: {
            id: true,
            name: true,
            phoneNumber: true,
            gstin: true,
            status: true,
            createdAt: true,
            ca: {
                select: {
                    name: true,
                    email: true,
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
};

export const getAllCAs = async () => {
    return await prisma.cA.findMany({
        select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
            _count: {
                select: { clients: true }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
};

export const getAllAdmins = async () => {
    return await prisma.admin.findMany({
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
        },
    });
};

export const updateClientStatus = async (clientId, status) => {
    return await prisma.client.update({
        where: { id: clientId },
        data: { status }
    });
};

export const updateClient = async (clientId, data) => {
    // Check if client exists
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new AppError('Client not found', 404);

    // Check for duplicates if phone or gstin is being updated
    if (data.phoneNumber || data.gstin) {
        const query = [];
        if (data.phoneNumber) query.push({ phoneNumber: data.phoneNumber });
        if (data.gstin) query.push({ gstin: data.gstin });

        const existing = await prisma.client.findFirst({
            where: {
                OR: query,
                NOT: { id: clientId } // Exclude current client
            }
        });

        if (existing) throw new AppError('Another Client with this Phone or GSTIN already exists', 400);
    }

    return await prisma.client.update({
        where: { id: clientId },
        data
    });
};

export const createClientForCA = async (caId, clientData) => {
    // Check if CA exists
    const ca = await prisma.cA.findUnique({ where: { id: caId } });
    if (!ca) throw new AppError('CA not found', 404);

    // Check for duplicates (phone or GSTIN)
    const existing = await prisma.client.findFirst({
        where: {
            OR: [
                { phoneNumber: clientData.phoneNumber },
                { gstin: clientData.gstin }
            ]
        }
    });

    if (existing) throw new AppError('Client with this Phone or GSTIN already exists', 400);

    return await prisma.client.create({
        data: {
            ...clientData,
            caId
        }
    });
};

export const deleteClient = async (clientId) => {
    // Check if client exists
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new AppError('Client not found', 404);

    return await prisma.$transaction([
        prisma.message.deleteMany({ where: { clientId } }),
        prisma.transferRequest.deleteMany({ where: { clientId } }),
        prisma.client.delete({ where: { id: clientId } })
    ]);
};

export const createCA = async (data) => {
    const { email, password, name } = data;

    const existingCA = await prisma.cA.findUnique({ where: { email } });
    if (existingCA) {
        throw new AppError('Email already in use by another CA', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newCA = await prisma.cA.create({
        data: {
            name,
            email,
            password: hashedPassword,
        },
    });

    newCA.password = undefined;
    return newCA;
};

export const updateCA = async (caId, data) => {
    if (data.password) {
        data.password = await bcrypt.hash(data.password, 10);
    }
    return await prisma.cA.update({
        where: { id: caId },
        data
    });
};

export const deleteCA = async (caId) => {
    const clientCount = await prisma.client.count({ where: { caId } });
    if (clientCount > 0) {
        throw new AppError(`Cannot delete CA. They have ${clientCount} associated clients. Reassign or delete clients first.`, 400);
    }

    return await prisma.$transaction([
        prisma.refreshToken.deleteMany({ where: { caId } }),
        prisma.cA.delete({ where: { id: caId } })
    ]);
};


