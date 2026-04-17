import * as bankAccountService from '../services/bank-account.service.js';
import catchAsync from '../utils/catchAsync.js';

export const listAccounts = catchAsync(async (req, res) => {
    const clientId = req.params.id;
    const accounts = await bankAccountService.listByClient(clientId);
    res.status(200).json({
        status: 'success',
        results: accounts.length,
        data: { accounts }
    });
});

export const getAccountDetails = catchAsync(async (req, res) => {
    const { accountId } = req.params;
    const details = await bankAccountService.getAccountDetails(accountId);
    
    if (!details) {
        throw new Error('Account not found');
    }

    res.status(200).json({
        status: 'success',
        data: { account: details }
    });
});

export const assignStatement = catchAsync(async (req, res) => {
    const { statementId } = req.params;
    const { bankAccountId } = req.body;
    
    const statement = await bankAccountService.manuallyAssignStatement(statementId, bankAccountId);
    
    res.status(200).json({
        status: 'success',
        data: { statement }
    });
});

export const deleteAccount = catchAsync(async (req, res) => {
    const clientId = req.params.id;
    const { accountId } = req.params;
    
    await bankAccountService.deleteAccount(accountId, clientId);
    
    res.status(204).json({
        status: 'success',
        data: null
    });
});

