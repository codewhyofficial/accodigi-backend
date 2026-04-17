import AppError from '../utils/AppError.js';

/**
 * Validates extracted invoice data against business/GST rules.
 * 
 * @param {Object} invoiceData The structured data from LLM extraction 
 * @param {Object} client The client record to determine INWARD/OUTWARD
 * @returns {Array<string>} List of validation error messages. Empty array if valid.
 */
export const validateInvoice = (invoiceData, client) => {
    const errors = [];

    // 1. Mandatory Fields Check
    if (!invoiceData.totalAmount) errors.push('Total Amount is missing.');
    if (!invoiceData.taxableAmount) errors.push('Taxable Amount is missing.');

    // 2. GSTIN Format Check (if provided)
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[A-Z0-9]{1}[0-9A-Z]{1}$/;

    if (invoiceData.supplierGstin) {
        invoiceData.supplierGstin = invoiceData.supplierGstin.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
        if (!gstinRegex.test(invoiceData.supplierGstin)) {
            errors.push(`Invalid Supplier GSTIN format: ${invoiceData.supplierGstin}`);
        }
    }
    if (invoiceData.recipientGstin) {
        invoiceData.recipientGstin = invoiceData.recipientGstin.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
        if (!gstinRegex.test(invoiceData.recipientGstin)) {
            errors.push(`Invalid Recipient GSTIN format: ${invoiceData.recipientGstin}`);
        }
    }

    // 3. Tax Math Check
    const taxable = invoiceData.taxableAmount || 0;
    const cgst = invoiceData.cgst || 0;
    const sgst = invoiceData.sgst || 0;
    const igst = invoiceData.igst || 0;
    const total = invoiceData.totalAmount || 0;

    const calculatedTotal = taxable + cgst + sgst + igst;

    // Allow small rounding differences (e.g. 1 rupee)
    if (Math.abs(calculatedTotal - total) > 1.5) {
        errors.push(`Tax math mismatch: Taxable(${taxable}) + CGST(${cgst}) + SGST(${sgst}) + IGST(${igst}) = ${calculatedTotal}, but Total is ${total}`);
    }

    // 4. POS vs State Code logic
    // First two digits of GSTIN represent the state code
    if (invoiceData.supplierGstin && invoiceData.placeOfSupply) {
        const supplierStateCode = invoiceData.supplierGstin.substring(0, 2);
        const posMatch = invoiceData.placeOfSupply.match(/^(\d{2})/);
        const posStateCode = posMatch ? posMatch[1] : null;

        if (supplierStateCode && posStateCode) {
            const isIntraState = supplierStateCode === posStateCode;

            if (isIntraState && igst > 0) {
                errors.push('Intra-state supply (Supplier State = POS State) should not have IGST.');
            }
            if (!isIntraState && (cgst > 0 || sgst > 0)) {
                errors.push('Inter-state supply (Supplier State != POS State) should not have CGST/SGST.');
            }
        }
    }

    // 5. B2B invoices MUST have both GSTINs
    if (invoiceData.invoiceType === 'B2B') {
        if (!invoiceData.supplierGstin) errors.push('B2B Invoice is missing Supplier GSTIN.');
        if (!invoiceData.recipientGstin) errors.push('B2B Invoice is missing Recipient GSTIN.');
    }

    return errors;
};

/**
 * Auto-classifies the invoice type and direction based on the extracted data and the client's own GSTIN.
 * 
 * @param {Object} invoiceData 
 * @param {string} clientGstin 
 * @returns {Object} { invoiceType, direction }
 */
export const classifyInvoice = (invoiceData, clientGstin) => {
    let direction = null;
    let invoiceType = null;

    // Determine Direction (Inward/Purchase vs Outward/Sales)
    if (clientGstin) {
        if (invoiceData.supplierGstin === clientGstin) {
            direction = 'OUTWARD'; // Client is selling
        } else if (invoiceData.recipientGstin === clientGstin) {
            direction = 'INWARD'; // Client is buying
        }
    }

    // Determine Invoice Type
    const total = invoiceData.totalAmount || 0;

    if (invoiceData.supplierGstin && invoiceData.recipientGstin) {
        // Technically, if they both have GSTIN, it's B2B
        invoiceType = 'B2B';
    } else if (invoiceData.recipientGstin === null && invoiceData.supplierGstin) {
        // Recipient is unregistered (B2C)
        // GST rules: Inter-state > 2.5L is B2CL, otherwise B2CS. 
        // For simplicity, we just use 250000 threshold regardless of state for MVP unless strict rules apply.

        // Check if Inter-state
        let isInterState = false;
        if (invoiceData.supplierGstin && invoiceData.placeOfSupply) {
            const supplierStateCode = invoiceData.supplierGstin.substring(0, 2);
            const posMatch = invoiceData.placeOfSupply.match(/^(\d{2})/);
            const posStateCode = posMatch ? posMatch[1] : null;
            if (posStateCode && supplierStateCode !== posStateCode) {
                isInterState = true;
            }
        }

        if (isInterState && total > 250000) {
            invoiceType = 'B2CL';
        } else {
            invoiceType = 'B2CS';
        }
    }

    // Reverse charge flag override
    if (invoiceData.reverseChargeFlag) {
        invoiceType = 'RCM';
    }

    return { direction, invoiceType };
};
