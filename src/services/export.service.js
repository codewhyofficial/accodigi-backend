import prisma from '../prisma/index.js';
import ExcelJS from 'exceljs';
import { create } from 'xmlbuilder2';

export const generateExcelBuffer = async (clientId, filters = {}) => {
    // Build query
    const where = { clientId };
    if (filters.status) where.status = filters.status;
    if (filters.startDate || filters.endDate) {
        where.invoiceDate = {};
        if (filters.startDate) where.invoiceDate.gte = new Date(filters.startDate);
        if (filters.endDate) where.invoiceDate.lte = new Date(filters.endDate);
    }

    const invoices = await prisma.invoice.findMany({
        where,
        orderBy: { invoiceDate: 'asc' }
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Accodigi Admin';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Invoices');

    sheet.columns = [
        { header: 'Internal ID', key: 'id', width: 36 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Type', key: 'invoiceType', width: 12 },
        { header: 'Direction', key: 'direction', width: 12 },
        { header: 'Invoice Number', key: 'invoiceNumber', width: 20 },
        { header: 'Invoice Date', key: 'invoiceDate', width: 15 },
        { header: 'Vendor Name', key: 'vendorName', width: 35 },
        { header: 'Supplier GSTIN', key: 'supplierGstin', width: 20 },
        { header: 'Recipient GSTIN', key: 'recipientGstin', width: 20 },
        { header: 'Place of Supply', key: 'placeOfSupply', width: 15 },
        { header: 'Taxable Amount', key: 'taxableAmount', width: 15 },
        { header: 'CGST', key: 'cgst', width: 12 },
        { header: 'SGST', key: 'sgst', width: 12 },
        { header: 'IGST', key: 'igst', width: 12 },
        { header: 'Total Amount', key: 'totalAmount', width: 15 },
        { header: 'Line Items (Aggregated)', key: 'lineItemsStr', width: 50 },
        { header: 'Description', key: 'description', width: 40 },
    ];

    // Style the header
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };

    invoices.forEach(inv => {
        let lineItemsStr = '';
        if (inv.lineItems && Array.isArray(inv.lineItems)) {
            lineItemsStr = inv.lineItems.map(li => `${li.description || 'Item'} (Qty: ${li.quantity || 1})`).join('; ');
        }

        sheet.addRow({
            id: inv.id,
            status: inv.status || 'UNKNOWN',
            invoiceType: inv.invoiceType || 'B2B',
            direction: inv.direction || 'OUTWARD',
            invoiceNumber: inv.invoiceNumber || '',
            invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '',
            vendorName: inv.vendorName || '',
            supplierGstin: inv.supplierGstin || '',
            recipientGstin: inv.recipientGstin || '',
            placeOfSupply: inv.placeOfSupply || '',
            taxableAmount: inv.taxableAmount || 0,
            cgst: inv.cgst || 0,
            sgst: inv.sgst || 0,
            igst: inv.igst || 0,
            totalAmount: inv.totalAmount || 0,
            lineItemsStr,
            description: inv.description || ''
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
};

export const generateTallyXML = async (clientId, filters = {}) => {
    // Build query
    const where = { clientId };
    // Usually Tally imports only verified or processed invoices
    if (filters.status) where.status = filters.status;
    if (filters.startDate || filters.endDate) {
        where.invoiceDate = {};
        if (filters.startDate) where.invoiceDate.gte = new Date(filters.startDate);
        if (filters.endDate) where.invoiceDate.lte = new Date(filters.endDate);
    }

    const invoices = await prisma.invoice.findMany({
        where,
        include: { client: true },
        orderBy: { invoiceDate: 'asc' }
    });

    if (!invoices.length) {
        throw new Error("No invoices found to export for Tally.");
    }

    const companyName = invoices[0].client?.name || 'My Company';

    // Tally XML structure typically wraps around ENVELOPE > HEADER/BODY > IMPORTDATA > REQUESTDATA > TALLYMESSAGE > VOUCHER
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('ENVELOPE')
        .ele('HEADER')
        .ele('TALLYREQUEST').txt('Import Data').up()
        .up()
        .ele('BODY')
        .ele('IMPORTDATA')
        .ele('REQUESTDESC')
        .ele('REPORTNAME').txt('Vouchers').up()
        .ele('STATICVARIABLES')
        .ele('SVCURRENTCOMPANY').txt(companyName).up()
        .up()
        .up()
        .ele('REQUESTDATA');

    invoices.forEach(inv => {
        // Prepare Tally specific values
        const voucherType = inv.direction === 'INWARD' ? 'Purchase' : 'Sales';
        const dateStr = inv.invoiceDate
            ? new Date(inv.invoiceDate).toISOString().split('T')[0].replace(/-/g, '') // YYYYMMDD
            : new Date().toISOString().split('T')[0].replace(/-/g, '');

        const partyLedgerName = inv.vendorName || 'Cash';
        const isSales = voucherType === 'Sales';

        const tallyMessage = doc.ele('TALLYMESSAGE', { 'xmlns:UDF': 'TallyUDF' })
            .ele('VOUCHER', { 'VCHTYPE': voucherType, 'ACTION': 'Create', 'OBJVIEW': 'Accounting Voucher View' })
            .ele('DATE').txt(dateStr).up()
            .ele('VOUCHERTYPENAME').txt(voucherType).up()
            .ele('VOUCHERNUMBER').txt(inv.invoiceNumber || '').up()
            .ele('PARTYLEDGERNAME').txt(partyLedgerName).up()
            .ele('PERSISTEDVIEW').txt('Accounting Voucher View').up();

        // Tally requires ALLLEDGERENTRIES.LIs for debit/credits
        // For Sales: Party Ledger is DEBIT (-), Sales Ledger is CREDIT (+)
        // For Purchase: Party Ledger is CREDIT (+), Purchase Ledger is DEBIT (-)

        // 1. Party Ledger Entry
        tallyMessage.ele('ALLLEDGERENTRIES.LIST')
            .ele('LEDGERNAME').txt(partyLedgerName).up()
            .ele('ISDEEMEDPOSITIVE').txt(isSales ? 'Yes' : 'No').up()
            .ele('AMOUNT').txt(isSales ? `-${inv.totalAmount || 0}` : `${inv.totalAmount || 0}`).up()
            .up();

        // 2. Main Sales/Purchase Ledger
        tallyMessage.ele('ALLLEDGERENTRIES.LIST')
            .ele('LEDGERNAME').txt(voucherType).up()
            .ele('ISDEEMEDPOSITIVE').txt(isSales ? 'No' : 'Yes').up()
            .ele('AMOUNT').txt(isSales ? `${inv.taxableAmount || 0}` : `-${inv.taxableAmount || 0}`).up()
            .up();

        // 3. Tax Ledgers (CGST/SGST/IGST)
        if (inv.cgst && inv.cgst > 0) {
            tallyMessage.ele('ALLLEDGERENTRIES.LIST')
                .ele('LEDGERNAME').txt('CGST').up()
                .ele('ISDEEMEDPOSITIVE').txt(isSales ? 'No' : 'Yes').up()
                .ele('AMOUNT').txt(isSales ? `${inv.cgst}` : `-${inv.cgst}`).up()
                .up();
        }
        if (inv.sgst && inv.sgst > 0) {
            tallyMessage.ele('ALLLEDGERENTRIES.LIST')
                .ele('LEDGERNAME').txt('SGST').up()
                .ele('ISDEEMEDPOSITIVE').txt(isSales ? 'No' : 'Yes').up()
                .ele('AMOUNT').txt(isSales ? `${inv.sgst}` : `-${inv.sgst}`).up()
                .up();
        }
        if (inv.igst && inv.igst > 0) {
            tallyMessage.ele('ALLLEDGERENTRIES.LIST')
                .ele('LEDGERNAME').txt('IGST').up()
                .ele('ISDEEMEDPOSITIVE').txt(isSales ? 'No' : 'Yes').up()
                .ele('AMOUNT').txt(isSales ? `${inv.igst}` : `-${inv.igst}`).up()
                .up();
        }

        tallyMessage.up(); // End VOUCHER
        tallyMessage.up(); // End TALLYMESSAGE
    });

    doc.up().up().up().up(); // Close remaining REQUESTDATA, IMPORTDATA, BODY, ENVELOPE

    const xmlString = doc.end({ prettyPrint: true });
    return xmlString;
};

export const generateBankStatementExcel = async (clientId, filters = {}) => {
    const where = {
        bankStatement: { clientId }
    };

    if (filters.bankAccountId) {
        where.bankStatement.bankAccountId = filters.bankAccountId;
    }


    if (filters.bankStatementIds) {
        const ids = Array.isArray(filters.bankStatementIds) ? filters.bankStatementIds : [filters.bankStatementIds];
        if (ids.length > 0) {
            where.bankStatementId = { in: ids };
        }
    }

    if (filters.startDate || filters.endDate) {
        where.date = {};
        if (filters.startDate) where.date.gte = new Date(filters.startDate);
        if (filters.endDate) where.date.lte = new Date(filters.endDate);
    }

    const transactions = await prisma.bankTransaction.findMany({
        where,
        orderBy: { date: 'asc' },
        include: {
            bankStatement: {
                include: { bankAccount: true }
            }
        }
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Bank Transactions');

    // Define all possible columns
    const allCols = {
        date: { header: 'Date', key: 'date', width: 12 },
        bankName: { header: 'Bank Name', key: 'bankName', width: 25 },
        accountNumber: { header: 'Account Number', key: 'accountNumber', width: 20 },
        supplierName: { header: 'Supplier Name (AI)', key: 'supplierName', width: 25 },
        description: { header: 'Description', key: 'description', width: 45 },
        category: { header: 'Category (AI)', key: 'category', width: 20 },
        aiCommentary: { header: 'AI Commentary', key: 'aiCommentary', width: 35 },
        amount: { header: 'Amount', key: 'amount', width: 15 },
        debit: { header: 'Debit', key: 'debit', width: 15 },
        credit: { header: 'Credit', key: 'credit', width: 15 },
        balance: { header: 'Running Balance', key: 'balance', width: 15 },
    };

    // Use requested columns or default set
    const selectedKeys = filters.columns && filters.columns.length > 0
        ? filters.columns
        : ['date', 'bankName', 'accountNumber', 'supplierName', 'description', 'category', 'aiCommentary', 'amount', 'balance'];

    sheet.columns = selectedKeys.map(k => allCols[k]).filter(Boolean);

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };

    transactions.forEach(tx => {
        const rowData = {};
        selectedKeys.forEach(k => {
            if (k === 'date') rowData.date = tx.date ? new Date(tx.date).toLocaleDateString('en-GB') : '';
            if (k === 'bankName') rowData.bankName = tx.bankStatement?.bankAccount?.bankName || 'Unknown';
            if (k === 'accountNumber') rowData.accountNumber = tx.bankStatement?.bankAccount?.accountNumber || 'Unknown';
            if (k === 'supplierName') rowData.supplierName = tx.supplierName || '—';
            if (k === 'description') rowData.description = tx.description;
            if (k === 'category') rowData.category = tx.category || 'General';
            if (k === 'aiCommentary') rowData.aiCommentary = tx.aiCommentary || '—';
            if (k === 'amount') rowData.amount = tx.type === 'DEBIT' ? -Math.abs(tx.amount) : Math.abs(tx.amount);
            if (k === 'debit') rowData.debit = tx.type === 'DEBIT' ? Math.abs(tx.amount) : '';
            if (k === 'credit') rowData.credit = tx.type === 'CREDIT' ? Math.abs(tx.amount) : '';
            if (k === 'balance') rowData.balance = tx.balance || '—';
        });
        sheet.addRow(rowData);
    });

    return workbook.xlsx.writeBuffer();
};


export const generateBankStatementCSV = async (clientId, filters = {}) => {
    const where = {
        bankStatement: { clientId }
    };

    if (filters.bankAccountId) {
        where.bankStatement.bankAccountId = filters.bankAccountId;
    }


    if (filters.bankStatementIds) {
        const ids = Array.isArray(filters.bankStatementIds) ? filters.bankStatementIds : [filters.bankStatementIds];
        if (ids.length > 0) {
            where.bankStatementId = { in: ids };
        }
    }

    if (filters.startDate || filters.endDate) {
        where.date = {};
        if (filters.startDate) where.date.gte = new Date(filters.startDate);
        if (filters.endDate) where.date.lte = new Date(filters.endDate);
    }

    const transactions = await prisma.bankTransaction.findMany({
        where,
        orderBy: { date: 'asc' },
        include: {
            bankStatement: {
                include: { bankAccount: true }
            }
        }
    });

    let header = '';
    let selectedKeys = [];

    if (filters.format === 'QBO') {
        header = 'Date,description,Debit,Credit\n';
        selectedKeys = ['date', 'description', 'debit', 'credit'];
    } else if (filters.format === 'Xero') {
        header = 'Date,Description,Amount\n';
        selectedKeys = ['date', 'description', 'amount'];
    } else {
        // Custom format
        selectedKeys = filters.columns && filters.columns.length > 0
            ? filters.columns
            : ['date', 'description', 'amount'];

        const keyToLabel = {
            date: 'Date',
            bankName: 'Bank Name',
            accountNumber: 'Account Number',
            supplierName: 'Supplier Name (AI)',
            description: 'Description',
            category: 'Category (AI)',
            aiCommentary: 'AI Commentary',
            amount: 'Amount',
            debit: 'Debit',
            credit: 'Credit',
            balance: 'Running Balance'
        };
        header = selectedKeys.map(k => keyToLabel[k]).join(',') + '\n';
    }

    const rows = transactions.map(tx => {
        return selectedKeys.map(k => {
            if (k === 'date') return tx.date ? new Date(tx.date).toLocaleDateString('en-GB') : '';
            if (k === 'bankName') return `"${(tx.bankStatement?.bankAccount?.bankName || 'Unknown').replace(/"/g, '""')}"`;
            if (k === 'accountNumber') return tx.bankStatement?.bankAccount?.accountNumber || 'Unknown';
            if (k === 'supplierName') return `"${(tx.supplierName || '—').replace(/"/g, '""')}"`;
            if (k === 'description') return `"${(tx.description || '').replace(/"/g, '""')}"`;
            if (k === 'category') return `"${(tx.category || 'General').replace(/"/g, '""')}"`;
            if (k === 'aiCommentary') return `"${(tx.aiCommentary || '—').replace(/"/g, '""')}"`;
            if (k === 'amount') return tx.type === 'DEBIT' ? -Math.abs(tx.amount) : Math.abs(tx.amount);
            if (k === 'debit') return tx.type === 'DEBIT' ? Math.abs(tx.amount) : '';
            if (k === 'credit') return tx.type === 'CREDIT' ? Math.abs(tx.amount) : '';
            if (k === 'balance') return tx.balance || '—';
            return '';
        }).join(',');
    }).join('\n');

    return Buffer.from(header + rows);
};


