import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import prisma from '../prisma/index.js';
import AppError from '../utils/AppError.js';
import config from '../config/env.js';

const signToken = (id) => {
    return jwt.sign({ id }, config.jwt.secret, {
        expiresIn: config.jwt.accessExpiry,
    });
};

const signRefreshToken = (id) => {
    return jwt.sign({ id }, config.jwt.secret, {
        expiresIn: config.jwt.refreshExpiry,
    });
};

export const register = async (data) => {
    const { name, email, password } = data;

    const existingCA = await prisma.cA.findUnique({ where: { email } });
    if (existingCA) {
        throw new AppError('Email already in use', 400);
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

export const login = async (email, password) => {
    if (!email || !password) {
        throw new AppError('Please provide both email and password.', 400);
    }

    const ca = await prisma.cA.findUnique({ where: { email } });

    if (!ca) {
        throw new AppError('Account not found. Please sign up to create an account.', 404);
    }

    const isPasswordCorrect = await bcrypt.compare(password, ca.password);
    if (!isPasswordCorrect) {
        throw new AppError('Incorrect password. Please try again.', 401);
    }

    const token = signToken(ca.id);
    const refreshToken = signRefreshToken(ca.id);

    // Store refresh token asynchronously
    prisma.refreshToken.create({
        data: {
            token: refreshToken,
            caId: ca.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
    }).catch(err => console.error('Failed to store refresh token:', err));

    ca.password = undefined;
    return { ca, token, refreshToken };
};

export const refreshToken = async (token) => {
    const decoded = await promisify(jwt.verify)(token, config.jwt.secret);

    const existingToken = await prisma.refreshToken.findUnique({
        where: { token },
    });

    if (!existingToken || existingToken.revoked || new Date() > existingToken.expiresAt) {
        throw new AppError('Invalid or expired refresh token', 401);
    }

    const ca = await prisma.cA.findUnique({ where: { id: decoded.id } });
    if (!ca) {
        throw new AppError('User not found', 401);
    }

    const newAccessToken = signToken(ca.id);
    return { token: newAccessToken };
};
