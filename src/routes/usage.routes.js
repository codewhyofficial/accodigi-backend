import express from 'express';
import * as usageController from '../controllers/usage.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/totals', usageController.getProcessedPageTotals);
router.get('/history', usageController.getUsageHistory);

export default router;
