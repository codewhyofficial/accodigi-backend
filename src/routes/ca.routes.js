import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import prisma from '../prisma/index.js';
import catchAsync from '../utils/catchAsync.js';
import * as gstService from '../services/gst.service.js';

const router = express.Router();

router.use(protect);

router.get('/me', (req, res) => {
    res.status(200).json({
        status: 'success',
        data: { ca: req.user }
    });
});

router.get('/dashboard-stats', catchAsync(async (req, res) => {
    const clientCount = await prisma.client.count({ where: { caId: req.user.id } });
    const aggregations = await gstService.getDashboardStats(req.user.id);

    res.status(200).json({
        status: 'success',
        data: {
            stats: {
                totalClients: clientCount,
                ...aggregations
            }
        }
    });
}));

export default router;
