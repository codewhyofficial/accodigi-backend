import * as bankStatementService from '../services/bank-statement.service.js';
import catchAsync from '../utils/catchAsync.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import * as exportService from '../services/export.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_BS_DIR = path.resolve(__dirname, '../../uploads/bank-statements');

/**
 * Handle Bank Statement PDF Upload and Processing (Bulk Support)
 */
export const uploadBankStatement = catchAsync(async (req, res) => {
    if (!req.files || req.files.length === 0) {
        throw new Error('No PDF files provided. Please upload under the "statements" field.');
    }

    const clientId = req.params.id;
    const caId = req.user.id;
    const { password } = req.body; // User provided password for PDFs
    const results = [];


    const BATCH_SIZE = 1; // Reverted to 1 for maximum stability while under load
    for (let i = 0; i < req.files.length; i += BATCH_SIZE) {
        const batch = req.files.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (file) => {
            const filePath = file.path;
            const originalName = file.originalname;
            const mimeType = file.mimetype;

            try {
                const fileBuffer = await fs.readFile(filePath);

                // Ensure permanent directory exists
                await fs.mkdir(UPLOADS_BS_DIR, { recursive: true }).catch(() => { });
                const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
                const fileName = `${Date.now()}_${safeName}`;
                const finalPath = path.join(UPLOADS_BS_DIR, fileName);

                // Save to permanent location
                await fs.writeFile(finalPath, fileBuffer);
                const fileUrl = `/media/bank-statements/${fileName}`;

                // Process with AI — pass mimeType so service can route image vs PDF
                const statement = await bankStatementService.processBankStatement(
                    clientId, caId, fileBuffer, originalName, fileUrl, password, mimeType
                );
                results.push(statement);

            } catch (err) {
                console.error(`Error processing file ${originalName}:`, err.message);
                results.push({ filename: originalName, status: 'error', error: err.message });
            } finally {
                // Clean up temporary Multer file
                await fs.unlink(filePath).catch(() => { });
            }
        }));
    }

    res.status(200).json({
        status: 'success',
        data: {
            statements: results,
            message: `${results.filter(r => !r.error).length} statements processed successfully`
        }
    });
});

/**
 * List all bank statements for a client
 */
export const listStatements = catchAsync(async (req, res) => {
    const clientId = req.params.id;
    const { startDate, endDate } = req.query;
    const statements = await bankStatementService.listStatements(clientId, { startDate, endDate });

    res.status(200).json({
        status: 'success',
        data: { statements }
    });
});

/**
 * Delete a bank statement
 */
export const deleteStatement = catchAsync(async (req, res) => {
    const { id, statementId } = req.params;
    await bankStatementService.deleteStatement(statementId, id);

    res.status(200).json({
        status: 'success',
        message: 'Bank statement and its transactions deleted'
    });
});

/**
 * Get all transactions for a client
 */
export const getTransactions = catchAsync(async (req, res) => {
    const clientId = req.params.id;
    let { startDate, endDate, type, bankStatementIds, bankAccountId } = req.query;

    if (bankStatementIds && typeof bankStatementIds === 'string') {
        bankStatementIds = [bankStatementIds];
    }

    const transactions = await bankStatementService.getTransactions(clientId, {
        startDate,
        endDate,
        type,
        bankStatementIds,
        bankAccountId
    });


    res.status(200).json({
        status: 'success',
        results: transactions.length,
        data: { transactions }
    });
});

/**
 * Export Transactions to Excel
 */
export const exportTransactions = catchAsync(async (req, res) => {
    const clientId = req.params.id;
    let { startDate, endDate, type, bankStatementIds, bankAccountId } = req.query;

    if (bankStatementIds && typeof bankStatementIds === 'string') {
        bankStatementIds = [bankStatementIds];
    }

    const buffer = await exportService.generateBankStatementExcel(clientId, {
        startDate,
        endDate,
        type,
        bankStatementIds,
        bankAccountId,
        columns: req.query.columns ? (Array.isArray(req.query.columns) ? req.query.columns : req.query.columns.split(',')) : null
    });



    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="transactions_${clientId}.xlsx"`);
    res.send(buffer);
});

/**
 * Export Transactions to CSV
 */
export const exportTransactionsCSV = catchAsync(async (req, res) => {
    const clientId = req.params.id;
    let { startDate, endDate, type, bankStatementIds, bankAccountId } = req.query;

    if (bankStatementIds && typeof bankStatementIds === 'string') {
        bankStatementIds = [bankStatementIds];
    }

    const buffer = await exportService.generateBankStatementCSV(clientId, {
        startDate,
        endDate,
        type,
        bankStatementIds,
        bankAccountId,
        format: req.query.format || 'Custom',
        columns: req.query.columns ? (Array.isArray(req.query.columns) ? req.query.columns : req.query.columns.split(',')) : null
    });



    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transactions_${clientId}.csv"`);
    res.send(buffer);
});

