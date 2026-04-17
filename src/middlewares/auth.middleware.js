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

    // 3) GRANT ACCESS TO PROTECTED ROUTE (Bypass redundant DB lookup for speed)
    req.user = { id: decoded.id };
    next();
});
