import prisma from '../prisma/index.js';
import * as llmService from './llm.service.js';
import * as ocrService from './ocr.service.js';
import AppError from '../utils/AppError.js';
import * as bankAccountService from './bank-account.service.js';
import * as creditService from './credit.service.js';

// Dynamic import for pdf-parse to handle cases where PDF is scanned/image-based
let pdfParse = null;
const getPdfParse = async () => {
    if (!pdfParse) {
        const { PDFParse } = await import('pdf-parse');
        pdfParse = PDFParse;
    }
    return pdfParse;
};

// Dynamic import for pdf2pic (PDF page → image for scanned PDFs)
let fromBuffer = null;
const getFromBuffer = async () => {
    if (!fromBuffer) {
        const mod = await import('pdf2pic');
        fromBuffer = mod.fromBuffer;
    }
    return fromBuffer;
};

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/bmp']);
const TEXT_THRESHOLD = 50; // chars per page below which we consider text extraction failed

/**
 * Detect if a file buffer is an image (not PDF).
 */
const isImageBuffer = (mimeType) => IMAGE_MIME_TYPES.has(mimeType);

/**
 * Extract text from a single image buffer using fallback chain:
 * 1. Google Cloud Vision OCR  
 * 2. Gemini Vision (if Cloud Vision fails)
 */
const extractTextFromImageBuffer = async (imageBuffer, caId, clientId, mimeType = 'image/jpeg') => {
    try {
        const result = await ocrService.detectText(imageBuffer);

        // Log OCR Usage
        await prisma.apiUsage.create({
            data: {
                caId,
                clientId,
                provider: 'GOOGLE_VISION',
                type: 'OCR',
                imageCount: 1
            }
        });

        const text = result?.textAnnotations?.[0]?.description || '';
        if (text.trim().length > 10) return text;
        throw new Error('Cloud Vision returned empty text');
    } catch (visionErr) {
        console.warn('⚠️ Cloud Vision OCR failed, falling back to Gemini Vision:', visionErr.message);
        const { text, usage } = await llmService.extractTextFromImage(imageBuffer, mimeType);

        // Log Gemini Vision Fallback Usage
        await prisma.apiUsage.create({
            data: {
                caId,
                clientId,
                provider: 'GEMINI',
                model: 'gemini-3.1-flash-lite-preview',
                type: 'VISION_EXTRACTION',
                imageCount: 1,
                inputTokens: usage.promptTokens,
                outputTokens: usage.completionTokens
            }
        });

        return text;
    }
};

/**
 * Extract text pages from a PDF.
 * Returns { pages: [{text, num}], pageCount, isScanned }
 * If PDF is scanned (image-based), falls back to per-page image OCR via pdf2pic.
 */
const extractTextFromPdf = async (fileBuffer, caId, clientId, password = null) => {
    const PDFParse = await getPdfParse();

    let rawData = null;
    let instance = null;
    try {
        instance = new PDFParse({
            data: fileBuffer,
            password: password || undefined
        });
        rawData = await instance.getText();
    } catch (err) {
        if (err.message?.toLowerCase().includes('password')) {
            throw new AppError('This PDF is password-protected. Please provide the correct password.', 422);
        }
        throw new AppError(`PDF parsing error: ${err.message}`, 400);
    }

    // ── Sanity Check: Binary Page Counting ──
    // Some PDFs have broken trailers or linearized streams that confuse PDF.js.
    // We search for physical Page objects in the buffer as a fallback.
    const binaryContent = fileBuffer.toString('binary');
    const regexPageCount = (binaryContent.match(/\/Type\s*\/Page\b/g) || []).length;
    const libraryPageCount = rawData.total || 0;

    let pageCount = libraryPageCount;
    let needsFallbackOcr = false;

    if (regexPageCount > libraryPageCount) {
        console.warn(`⚠️ PDF.js reported ${libraryPageCount} pages, but regex found ${regexPageCount}. Using physical count.`);
        pageCount = regexPageCount;
        needsFallbackOcr = true; // If the library missed pages, we must use Image OCR to see them
    }

    const rawText = rawData.text || '';
    const hasUsableText = rawText.trim().length >= TEXT_THRESHOLD;

    if (instance) {
        await instance.destroy().catch(() => { });
    }

    // ── Logic: If count matches AND we have text, use extraction ──
    if (hasUsableText && !needsFallbackOcr) {
        const pages = rawData.pages.map(p => ({
            text: p.text || '',
            num: p.num
        }));

        // FINAL CHECK: If the library returned fewer page objects than the total count, fallback
        if (pages.length < pageCount) {
            console.warn(`⚠️ Library returned ${pages.length} pages but says total is ${pageCount}. Falling back to Image OCR.`);
        } else {
            return { pages, pageCount, isScanned: false };
        }
    }

    // ── Scanned / Inaccessible PDF: convert pages to images and OCR ──
    console.log(`📸 PDF pages inaccessible or missing (${pageCount} pages). Running full Image OCR fallback...`);
    return await extractPdfViaImageOcr(fileBuffer, pageCount, caId, clientId);
};

/**
 * Convert each PDF page to an image and OCR it.
 * Uses pdf2pic for rendering and fallback OCR chain.
 */
const extractPdfViaImageOcr = async (fileBuffer, pageCount, caId, clientId) => {
    const fromBuf = await getFromBuffer();

    // pdf2pic options — render at 200 DPI for reasonable quality/speed balance
    const converter = fromBuf(fileBuffer, {
        density: 200,
        saveFilename: 'page',
        savePath: '/tmp',
        format: 'png',
        width: 1700,
        height: 2200
    });

    const totalPages = Math.max(pageCount, 1);
    const pages = [];

    // Process pages in batches of 3 to avoid OOM on large PDFs
    const BATCH_SIZE = 3;
    for (let batch = 0; batch < Math.ceil(totalPages / BATCH_SIZE); batch++) {
        const start = batch * BATCH_SIZE + 1;
        const end = Math.min((batch + 1) * BATCH_SIZE, totalPages);

        const batchPromises = [];
        for (let pageNum = start; pageNum <= end; pageNum++) {
            batchPromises.push(
                converter(pageNum, { responseType: 'buffer' })
                    .then(async (result) => {
                        const imgBuffer = result.buffer;
                        if (!imgBuffer) return null;

                        const text = await extractTextFromImageBuffer(imgBuffer, caId, clientId, 'image/png');
                        return { text: text || '', num: pageNum };
                    })
                    .catch(err => {
                        console.error(`❌ OCR failed for page ${pageNum}:`, err.message);
                        return { text: '', num: pageNum };
                    })
            );
        }

        const batchResults = await Promise.all(batchPromises);
        pages.push(...batchResults.filter(Boolean));
    }

    // Sort pages by page number
    pages.sort((a, b) => a.num - b.num);

    if (pages.every(p => !p.text.trim())) {
        throw new AppError('Could not extract any text from this PDF. The file may be corrupted.', 400);
    }

    return { pages, pageCount: totalPages, isScanned: true };
};

/**
 * Process a single image file (JPEG, PNG, etc.) as a bank statement.
 * Runs OCR → LLM extraction flow.
 */
const processImageFile = async (fileBuffer, caId, clientId, mimeType) => {
    const text = await extractTextFromImageBuffer(fileBuffer, caId, clientId, mimeType);
    if (!text.trim()) {
        throw new AppError('Could not extract any text from this image.', 400);
    }
    return { pages: [{ text, num: 1 }], pageCount: 1, isScanned: true };
};

/**
 * Main entry point: Process a bank statement (PDF or image).
 * Extracts text, structures it with AI, and records usage.
 */
export const processBankStatement = async (clientId, caId, fileBuffer, fileName, fileUrl, password = null, mimeType = 'application/pdf') => {
    // Get client details for business context
    const client = await prisma.client.findUnique({ where: { id: clientId } });

    // ── Step 1: Text Extraction ──────────────────────────────────
    let pages = [];
    let pageCount = 0;

    if (isImageBuffer(mimeType)) {
        const result = await processImageFile(fileBuffer, caId, clientId, mimeType);
        pages = result.pages;
        pageCount = result.pageCount;
    } else {
        // PDF path
        const result = await extractTextFromPdf(fileBuffer, caId, clientId, password);
        pages = result.pages;
        pageCount = result.pageCount;
    }

    if (pages.length === 0 || pages.every(p => !p.text?.trim())) {
        throw new AppError('Could not extract any content from the file.', 400);
    }

    // ── Step 1.5: Credit Check ──────────────────────────────────
    const isScanned = !isImageBuffer(mimeType) ? (pages.isScanned ?? false) : true;
    const cost = creditService.calculateCost(pageCount, isScanned);

    const currentCA = await prisma.cA.findUnique({
        where: { id: caId },
        select: { totalCredits: true, usedCredits: true }
    });

    if (currentCA) {
        const available = currentCA.totalCredits - currentCA.usedCredits;
        if (available < cost) {
            throw new AppError(`Insufficient credits. Required: ${cost}, Available: ${available}. Please refill to continue.`, 402);
        }
    }

    console.log(`📑 Processing ${pageCount} pages for file: ${fileName} (Cost: ${cost} credits)`);

    // ── Step 2: Build AI Prompts ─────────────────────────────────
    const summaryPages = [
        ...pages.slice(0, 2),
        ...(pages.length > 2 ? [pages[pages.length - 1]] : [])
    ];
    const summaryText = summaryPages.map(p => p.text).join('\n---\n');

    const CHUNK_SIZE = 5;
    const transactionChunks = [];
    for (let i = 0; i < pages.length; i += CHUNK_SIZE) {
        transactionChunks.push(pages.slice(i, i + CHUNK_SIZE));
    }

    const metadataPrompt = `
Extract Statement Metadata from the following bank statement text.
Return ONLY valid JSON — no markdown, no explanation.

JSON STRUCTURE:
{
  "currency": "string - detected currency code e.g. GBP, INR, USD",
  "accountNumber": "string - official account/sort code",
  "bankName": "string - bank or financial institution name",
  "openingBalance": "number or null",
  "closingBalance": "number or null"
}

TEXT:
${summaryText}
`;

    const getTransactionPrompt = (chunkText) => `
Extract ALL transactions from this bank statement fragment.
Return ONLY valid JSON — no markdown, no commentary.

BUSINESS CONTEXT: ${client?.natureOfBusiness || 'General'}
COUNTRY: ${client?.country || 'UK'}

JSON STRUCTURE:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "string - raw transaction description",
      "amount": "number (negative = debit, positive = credit)",
      "type": "DEBIT or CREDIT",
      "balance": "number or null - running balance after this transaction",
      "supplierName": "string - inferred payee/supplier name e.g. Amazon, HMRC",
      "category": "string - accounting category e.g. Utilities, Payroll, Revenue",
      "aiCommentary": "string - one short insight or null"
    }
  ]
}

Rules:
- If a line has no amount, skip it.
- Dates must be valid ISO 8601 (YYYY-MM-DD). If date is ambiguous (e.g. "02 Mar"), assume current year.
- Do NOT include duplicate transactions.
- Amount sign must match type: DEBIT = negative, CREDIT = positive.

FRAGMENT TEXT:
${chunkText}
`;

    // ── Step 3: Parallel AI Processing ──────────────────────────
    const start = Date.now();
    const [metadataRes, ...chunkRes] = await Promise.all([
        llmService.extractStructuredData(metadataPrompt),
        ...transactionChunks.map(chunk => {
            const chunkText = chunk.map(p => p.text).join('\n---\n');
            return llmService.extractStructuredData(getTransactionPrompt(chunkText));
        })
    ]);
    console.log(`⚡ AI processing completed in ${Date.now() - start}ms`);

    const metadata = metadataRes.data;
    const chunkResults = chunkRes.map(r => r.data);
    const allUsages = [metadataRes.usage, ...chunkRes.map(r => r.usage)];

    // ── Step 4: Merge & Validate Transactions ────────────────────
    const allTransactions = chunkResults.reduce((acc, result) => {
        if (result && Array.isArray(result.transactions)) {
            return acc.concat(result.transactions);
        }
        return acc;
    }, []);

    if (allTransactions.length === 0) {
        throw new AppError('No transactions could be extracted from this statement.', 400);
    }

    // Deduplicate transactions by date+description+amount fingerprint
    const seen = new Set();
    const uniqueTransactions = allTransactions.filter(t => {
        const key = `${t.date}|${t.description}|${t.amount}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const currency = metadata?.currency || client?.currency || 'GBP';

    // ── Step 5: Save Bank Account (Outside Transaction) ────────────────
    // We do this outside to prevent row-level deadlocks during concurrent uploads
    let bankAccount = null;
    if (metadata?.accountNumber) {
        bankAccount = await prisma.bankAccount.upsert({
            where: {
                clientId_accountNumber: {
                    clientId,
                    accountNumber: metadata.accountNumber
                }
            },
            update: {
                balance: metadata.closingBalance ?? undefined,
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

    // ── Step 6: Persist Statement & Transactions (Sequential for pool efficiency) ──
    let statement = null;
    try {
        statement = await prisma.bankStatement.create({
            data: {
                clientId,
                bankAccountId: bankAccount?.id || null,
                fileUrl,
                fileName,
                pageCount,
                currency,
                openingBalance: metadata?.openingBalance ?? null,
                closingBalance: metadata?.closingBalance ?? null,
                status: 'PENDING',
            }
        });

        await prisma.bankTransaction.createMany({
            data: uniqueTransactions.map(t => ({
                bankStatementId: statement.id,
                date: (() => {
                    const d = new Date(t.date);
                    return isNaN(d.getTime()) ? new Date() : d;
                })(),
                description: (t.description || 'Transaction').substring(0, 500),
                amount: parseFloat(t.amount) || 0,
                type: t.type === 'CREDIT' ? 'CREDIT' : 'DEBIT',
                balance: t.balance !== null && t.balance !== undefined ? parseFloat(t.balance) : null,
                supplierName: t.supplierName?.substring(0, 200) || null,
                category: t.category?.substring(0, 100) || null,
                aiCommentary: t.aiCommentary?.substring(0, 300) || null
            }))
        });

        await prisma.processedPage.create({
            data: {
                clientId,
                caId,
                type: 'BANK_STATEMENT',
                count: pageCount || 1
            }
        });

        // Mark as fully processed
        await prisma.bankStatement.update({
            where: { id: statement.id },
            data: { status: 'PROCESSED' }
        });

    } catch (err) {
        console.error('❌ Data persistence error:', err.message);
        if (statement) {
            await prisma.bankStatement.update({
                where: { id: statement.id },
                data: { status: 'FAILED' }
            }).catch(() => { });
        }
        throw err;
    }

    const result = { statement, bankAccount };

    // ── Step 7: Deduct Credits (Offline/Async-safe) ────────────────────
    await creditService.deductCredits(
        caId,
        cost,
        `Processed ${pageCount} pages for ${fileName} (${isScanned ? 'OCR' : 'Digital'})`
    ).catch(err => console.error('Failed to deduct credits:', err.message));

    // ── Step 8: Log AI Usage (Outside Transaction) ─────────────────────
    for (const usage of allUsages) {
        await prisma.apiUsage.create({
            data: {
                caId,
                clientId,
                bankStatementId: result.statement.id,
                provider: 'GEMINI',
                model: 'gemini-3.1-flash-lite-preview',
                type: 'TEXT_EXTRACTION',
                inputTokens: usage.promptTokens,
                outputTokens: usage.completionTokens
            }
        }).catch(err => console.error('Failed to log API usage:', err.message));
    }

    // ── Step 7: Sync Account Balance ────────────────────────────
    if (result.bankAccount?.id) {
        await bankAccountService.syncAccountBalance(result.bankAccount.id);
    }

    return result;
};

/**
 * Fetch transactions for a client with optional filters.
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
        orderBy: { date: 'asc' },      // chronological for balance continuity
        include: { bankStatement: true }
    });
};

/**
 * List all bank statements for a client with optional date filter.
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
 * Delete a bank statement and trigger account balance sync.
 */
export const deleteStatement = async (statementId, clientId) => {
    const statement = await prisma.bankStatement.findFirst({
        where: { id: statementId, clientId }
    });

    if (!statement) throw new AppError('Statement not found', 404);

    const bankAccountId = statement.bankAccountId;

    await prisma.bankStatement.delete({
        where: { id: statementId }
    });

    if (bankAccountId) {
        await bankAccountService.syncAccountBalance(bankAccountId);
    }

    return true;
};
