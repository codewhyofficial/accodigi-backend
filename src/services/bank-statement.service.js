import { PDFParse } from 'pdf-parse';
import prisma from '../prisma/index.js';
import * as llmService from './llm.service.js';
import * as ocrService from './ocr.service.js';
import AppError from '../utils/AppError.js';
import * as bankAccountService from './bank-account.service.js';


/**
 * Process a bank statement PDF.
 * Extracts text, structures it with AI, and records usage.
 */
export const processBankStatement = async (clientId, caId, fileBuffer, fileName, fileUrl, password = null) => {
    let pages = [];
    let pageCount = 0;
    
    // Get client details for nature of business context
    const client = await prisma.client.findUnique({
        where: { id: clientId }
    });

    try {
        // 1. Extract text page-by-page with pdf-parse
        const parser = new PDFParse({ data: fileBuffer, password, verbosity: 0 });
        const data = await parser.getText();
        pages = data.pages || []; // Array of { text, num }
        pageCount = data.total || 0;

        // Fallback for empty/scanned PDFs
        if (pages.length === 0 || pages.every(p => p.text.trim().length < 50)) {
            console.log('⚠️ PDF text extraction failed or returned minimal content. Falling back to OCR...');
            const ocrResult = await ocrService.detectText(fileBuffer);
            if (ocrResult?.textAnnotations?.[0]?.description) {
                pages = [{ text: ocrResult.textAnnotations[0].description, num: 1 }];
                pageCount = 1;
            }
        }
    } catch (err) {
        console.error('OCR/PDF Error:', err);
        const ocrResult = await ocrService.detectText(fileBuffer);
        if (ocrResult?.textAnnotations?.[0]?.description) {
            pages = [{ text: ocrResult.textAnnotations[0].description, num: 1 }];
            pageCount = 1;
        }
    }

    if (pages.length === 0) {
        throw new AppError('Could not extract any content from the file.', 400);
    }

    console.log(`📑 Processing ${pageCount} pages for ${fileName}...`);

    // 2. Parallel Processing Strategy
    // Chunk 0: Headers & Summary (First 2 pages + Last Page)
    const summaryPages = [
        ...pages.slice(0, 2),
        ...(pages.length > 2 ? [pages[pages.length - 1]] : [])
    ];
    const summaryText = summaryPages.map(p => p.text).join('\n---\n');

    // Chunks 1-N: Transactions (Chunks of 5 pages)
    const CHUNK_SIZE = 5;
    const transactionChunks = [];
    for (let i = 0; i < pages.length; i += CHUNK_SIZE) {
        transactionChunks.push(pages.slice(i, i + CHUNK_SIZE));
    }

    // 3. AI Prompts
    const metadataPrompt = `
Extract Statement Metadata from the following text (start and end of statement).
Return ONLY valid JSON.

JSON STRUCTURE:
{
  "currency": "string - detected currency code (e.g. GBP, INR)",
  "accountNumber": "string - official account number",
  "bankName": "string - bank name",
  "openingBalance": "number",
  "closingBalance": "number"
}

TEXT:
${summaryText}
`;

    const getTransactionPrompt = (chunkText) => `
Extract ALL transactions from the following bank statement fragment. 
Return ONLY valid JSON with a "transactions" array.

BUSINESS CONTEXT: ${client?.natureOfBusiness || 'General'}
COUNTRY: ${client?.country || 'UK'}

JSON STRUCTURE:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "string",
      "amount": "number (negative for debit, positive for credit)",
      "type": "DEBIT" or "CREDIT",
      "balance": "number or null",
      "supplierName": "Logical name e.g. Amazon",
      "category": "Accounting category",
      "aiCommentary": "Short insight"
    }
  ]
}

FRAGMENT TEXT:
${chunkText}
`;

    // 4. Parallel Execution
    const start = Date.now();
    const [metadata, ...chunkResults] = await Promise.all([
        llmService.extractStructuredData(metadataPrompt),
        ...transactionChunks.map(chunk => {
            const chunkText = chunk.map(p => p.text).join('\n---\n');
            return llmService.extractStructuredData(getTransactionPrompt(chunkText));
        })
    ]);

    console.log(`⚡ Parallel AI processing completed in ${Date.now() - start}ms`);

    // Merge Transactions
    const allTransactions = chunkResults.reduce((acc, result) => {
        if (result && Array.isArray(result.transactions)) {
            return acc.concat(result.transactions);
        }
        return acc;
    }, []);

    if (allTransactions.length === 0) {
        throw new AppError('No transactions could be extracted from this statement.', 400);
    }

    const currency = metadata?.currency || client?.currency || 'GBP';

    // 5. Save to DB
    const result = await prisma.$transaction(async (tx) => {
        let bankAccount = null;
        if (metadata?.accountNumber) {
            bankAccount = await tx.bankAccount.upsert({
                where: {
                    clientId_accountNumber: {
                        clientId,
                        accountNumber: metadata.accountNumber
                    }
                },
                update: {
                    balance: metadata.closingBalance || undefined,
                    bankName: metadata.bankName || undefined
                },
                create: {
                    clientId,
                    accountNumber: metadata.accountNumber,
                    bankName: metadata.bankName || 'Unknown Bank',
                    currency,
                    balance: metadata.closingBalance || 0
                }
            });
        }

        const statement = await tx.bankStatement.create({
            data: {
                clientId,
                bankAccountId: bankAccount?.id || null,
                fileUrl,
                fileName,
                pageCount,
                currency,
                openingBalance: metadata?.openingBalance || null,
                closingBalance: metadata?.closingBalance || null,
                status: 'PROCESSED',
            }
        });

        await tx.bankTransaction.createMany({
            data: allTransactions.map(t => ({
                bankStatementId: statement.id,
                date: new Date(t.date || Date.now()),
                description: t.description || 'Transaction',
                amount: parseFloat(t.amount) || 0,
                type: t.type === 'CREDIT' ? 'CREDIT' : 'DEBIT',
                balance: parseFloat(t.balance) || null,
                supplierName: t.supplierName || null,
                category: t.category || null,
                aiCommentary: t.aiCommentary || null
            }))
        });

        await tx.processedPage.create({
            data: {
                clientId,
                caId,
                type: 'BANK_STATEMENT',
                count: pageCount || 1
            }
        });

        return { statement, bankAccount };
    });

    // 6. Sync account balance properly (accounting for chronological order)
    if (result.bankAccount?.id) {
        await bankAccountService.syncAccountBalance(result.bankAccount.id);
    }

    return result;
};




/**
 * Fetch transactions for a client with optional filters
 */
export const getTransactions = async (clientId, { startDate, endDate, type, bankStatementIds, bankAccountId }) => {
    const where = {
        bankStatement: { clientId }
    };

    if (bankAccountId) {
        where.bankStatement.bankAccountId = bankAccountId;
    }

    if (bankStatementIds && Array.isArray(bankStatementIds) && bankStatementIds.length > 0) {
        where.bankStatementId = { in: bankStatementIds };
    }


    if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate);
        if (endDate) where.date.lte = new Date(endDate);
    }

    if (type) {
        where.type = type;
    }

    return prisma.bankTransaction.findMany({
        where,
        orderBy: { date: 'desc' },
        include: { bankStatement: true }
    });
};

/**
 * List all bank statements for a client with optional date filter
 */
export const listStatements = async (clientId, { startDate, endDate } = {}) => {
    const where = { clientId };

    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
    }

    return prisma.bankStatement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
            _count: {
                select: { transactions: true }
            }
        }
    });
};

/**
 * Delete a bank statement and its file
 */
export const deleteStatement = async (statementId, clientId) => {
    const statement = await prisma.bankStatement.findFirst({
        where: { id: statementId, clientId }
    });

    const bankAccountId = statement.bankAccountId;

    // Delete record from DB (transactions will cascade delete automatically)
    await prisma.bankStatement.delete({
        where: { id: statementId }
    });

    // Sync account balance after deletion
    if (bankAccountId) {
        await bankAccountService.syncAccountBalance(bankAccountId);
    }

    return true;
};

