import express from 'express';
import * as clientController from '../controllers/client.controller.js';
import * as bankStatementController from '../controllers/bank-statement.controller.js';
import * as bankAccountController from '../controllers/bank-account.controller.js';

import { protect } from '../middlewares/auth.middleware.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import validate from '../middlewares/validate.middleware.js';
import Joi from 'joi';

const router = express.Router();

router.use(protect);

// ─── Validation ──────────────────────────────────────────
const createClientSchema = Joi.object({
    name: Joi.string().required(),
    usageType: Joi.string().valid('Personal', 'Client Use').optional(),
    businessStructure: Joi.string().optional(),
    natureOfBusiness: Joi.string().optional(),
    // Legacy optional fields (still accepted if sent, but not required)
    phoneNumber: Joi.string().pattern(/^[0-9]+$/).min(10).max(15).optional().allow('', null),
    gstin: Joi.string().optional().allow('', null),
    filingMonth: Joi.number().integer().min(1).max(12).optional(),
    filingYear: Joi.number().integer().min(2000).max(2100).optional(),
    country: Joi.string().default('UK').optional(),
    primaryGoal: Joi.string().valid('Tax Preparation', 'OCR Only').optional()
});

// ─── Bank Statement Upload Multer (100MB total, images + PDFs) ──
const bsUploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(bsUploadDir)) {
    fs.mkdirSync(bsUploadDir, { recursive: true });
}

const bankStatementStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, bsUploadDir),
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `bs-${Date.now()}-${safeName}`);
    }
});

const bankStatementFileFilter = (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/bmp'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF and image files (JPEG, PNG, WEBP, TIFF, BMP) are allowed.'), false);
    }
};

const bankStatementUpload = multer({
    storage: bankStatementStorage,
    fileFilter: bankStatementFileFilter,
    limits: {
        // 100MB per file, max 20 files per request
        fileSize: 100 * 1024 * 1024,
        files: 20
    }
});

// ─── Client Routes ───────────────────────────────────────
router.route('/')
    .get(clientController.getAllClients)
    .post(validate(createClientSchema), clientController.createClient);

router.route('/:id')
    .get(clientController.getClient);

router.get('/:id/events', clientController.subscribeToEvents);

router.post('/:id/transfer-request', clientController.requestTransfer);
router.post('/:id/approve-transfer', clientController.approveTransfer);

// GST Exports (legacy)
router.get('/:id/export/gstr1', clientController.getGSTR1Export);
router.get('/:id/export/gstr3b', clientController.getGSTR3BExport);

// Bank Statements
router.get('/:id/statements', bankStatementController.listStatements);
router.delete('/:id/statements/:statementId', bankStatementController.deleteStatement);
router.post(
    '/:id/bank-statements',
    bankStatementUpload.array('statements', 20),
    bankStatementController.uploadBankStatement
);
router.get('/:id/bank-statements', bankStatementController.getTransactions);
router.get('/:id/bank-statements/export/excel', bankStatementController.exportTransactions);
router.get('/:id/bank-statements/export/csv', bankStatementController.exportTransactionsCSV);

// Bank Accounts
router.get('/:id/bank-accounts', bankAccountController.listAccounts);
router.get('/:id/bank-accounts/:accountId', bankAccountController.getAccountDetails);
router.delete('/:id/bank-accounts/:accountId', bankAccountController.deleteAccount);
router.patch('/:id/statements/:statementId/assign', bankAccountController.assignStatement);

export default router;
