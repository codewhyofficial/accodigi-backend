import * as usageService from '../services/usage.service.js';
import catchAsync from '../utils/catchAsync.js';

export const getProcessedPageTotals = catchAsync(async (req, res) => {
    const caId = req.user.id;
    const totals = await usageService.getProcessedPageTotals(caId);

    res.status(200).json({
        status: 'success',
        data: { totals }
    });
});

export const getUsageHistory = catchAsync(async (req, res) => {
    const caId = req.user.id;
    const history = await usageService.getUsageHistory(caId);

    res.status(200).json({
        status: 'success',
        data: { history }
    });
});
