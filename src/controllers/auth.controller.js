import * as authService from '../services/auth.service.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';

export const register = catchAsync(async (req, res, next) => {
    const ca = await authService.register(req.body);
    res.status(201).json({
        status: 'success',
        data: { ca },
    });
});

export const login = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;
    const { ca, token, refreshToken } = await authService.login(email, password);

    // Send refresh token in HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.status(200).json({
        status: 'success',
        token,
        data: { ca },
    });
});

export const refreshTokenHandler = catchAsync(async (req, res, next) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return next(new AppError('No refresh token provided', 400));

    const { token } = await authService.refreshToken(refreshToken);

    res.status(200).json({
        status: 'success',
        token
    });
});

export const logout = catchAsync(async (req, res, next) => {
    res.clearCookie('refreshToken');
    res.status(200).json({ status: 'success' });
});
