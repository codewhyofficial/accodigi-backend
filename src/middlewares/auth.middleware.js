import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import prisma from '../prisma/index.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import config from '../config/env.js';

export const protect = catchAsync(async (req, res, next) => {
    // 1) Getting token and check of it's there
    let token;
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.query.token) {
        // Support token via query param for SSE (EventSource doesn't support headers)
        token = req.query.token;
    }

    if (!token) {
        return next(
            new AppError('You are not logged in! Please log in to get access.', 401)
        );
    }

    // 2) Verification token
    const decoded = await promisify(jwt.verify)(token, config.jwt.secret);

    // 3) Check if user still exists
    const currentUser = await prisma.cA.findUnique({
        where: { id: decoded.id },
        select: { id: true, name: true, email: true, role: true, totalCredits: true, usedCredits: true }
    });

    if (!currentUser) {
        return next(
            new AppError('The user belonging to this token no longer exists.', 401)
        );
    }

    // 4) GRANT ACCESS TO PROTECTED ROUTE
    req.user = currentUser;
    next();
});
