import express from 'express';
import * as clientController from '../controllers/client.controller.js';
import * as bankStatementController from '../controllers/bank-statement.controller.js';
import * as bankAccountController from '../controllers/bank-account.controller.js';

import { protect } from '../middlewares/auth.middleware.js';
import upload from '../middlewares/upload.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import Joi from 'joi';

const router = express.Router();

router.use(protect);

const createClientSchema = Joi.object({
    name: Joi.string().required(),
    phoneNumber: Joi.string().pattern(/^[0-9]+$/).min(10).max(15).required(),
    gstin: Joi.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/).required(),
    filingMonth: Joi.number().integer().min(1).max(12).optional(),
    filingYear: Joi.number().integer().min(2000).max(2100).optional(),
    usageType: Joi.string().valid('Personal', 'Client Use').optional(),
    businessStructure: Joi.string().optional(),
    country: Joi.string().default('UK').optional(),
    natureOfBusiness: Joi.string().optional(),
    primaryGoal: Joi.string().valid('Tax Preparation', 'OCR Only').optional()
});

router.route('/')
    .get(clientController.getAllClients)
    .post(validate(createClientSchema), clientController.createClient);


router.route('/:id')
    .get(clientController.getClient);

router.get('/:id/events', clientController.subscribeToEvents);

router.post('/:id/transfer-request', clientController.requestTransfer);
router.post('/:id/approve-transfer', clientController.approveTransfer);

// GST Exports
router.get('/:id/export/gstr1', clientController.getGSTR1Export);
router.get('/:id/export/gstr3b', clientController.getGSTR3BExport);

// Bank Statements
router.get('/:id/statements', bankStatementController.listStatements);
router.delete('/:id/statements/:statementId', bankStatementController.deleteStatement);
router.post('/:id/bank-statements', upload.array('statements', 10), bankStatementController.uploadBankStatement);
router.get('/:id/bank-statements', bankStatementController.getTransactions);
router.get('/:id/bank-statements/export/excel', bankStatementController.exportTransactions);
router.get('/:id/bank-statements/export/csv', bankStatementController.exportTransactionsCSV);

// Bank Accounts
router.get('/:id/bank-accounts', bankAccountController.listAccounts);
router.get('/:id/bank-accounts/:accountId', bankAccountController.getAccountDetails);
router.delete('/:id/bank-accounts/:accountId', bankAccountController.deleteAccount);
router.patch('/:id/statements/:statementId/assign', bankAccountController.assignStatement);



export default router;
