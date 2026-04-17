import { SarvamAIClient } from 'sarvamai';
import AdmZip from 'adm-zip';
import fs from 'fs/promises';
import path from 'path';
import config from '../config/env.js';

let client = null;

const getClient = () => {
    if (!client) {
        if (!config.sarvam.apiKey) {
            throw new Error('SARVAM_API_KEY is not configured');
        }
        client = new SarvamAIClient({
            apiSubscriptionKey: config.sarvam.apiKey
        });
    }
    return client;
};

/**
 * Process a document using Sarvam Document Intelligence API.
 * Uploads the image, waits for processing, downloads the result,
 * and extracts the Markdown (.md) representation of the document.
 * 
 * @param {string} filePath - Path to the local file to process
 * @returns {Promise<string>} - The extracted Markdown text
 */
export const processDocument = async (filePath) => {
    const sarvamClient = getClient();

    // Create a temporary zip file paths
    const zipPath = `${filePath}.output.zip`;
    const inputZipPath = `${filePath}.input.zip`;

    try {
        console.log(`🚀 Starting Sarvam Document Intelligence job for ${filePath}...`);

        // Check file extension. If it's not a PDF, we need to ZIP it.
        const ext = path.extname(filePath).toLowerCase();
        let fileToUpload = filePath;

        if (ext !== '.pdf' && ext !== '.zip') {
            console.log(`📦 Zipping image file ${filePath} before upload...`);
            const inputZip = new AdmZip();
            // Just add the file directly to the root of the ZIP.
            inputZip.addLocalFile(filePath, "");
            inputZip.writeZip(inputZipPath);
            fileToUpload = inputZipPath;
        }

        // 1. Create a Document Intelligence job
        const job = await sarvamClient.documentIntelligence.createJob({
            language: "en-IN", // Process as English to optimize for English primary docs
            outputFormat: "md" // Get markdown response
        });

        // 2. Upload document
        console.log(`📤 Uploading document to Sarvam...`);
        await job.uploadFile(fileToUpload);

        // 3. Start processing
        console.log(`⚙️ Starting processing...`);
        await job.start();

        // 4. Wait for completion
        console.log(`⏳ Waiting for completion...`);
        const status = await job.waitUntilComplete();

        if (status.job_state !== "Completed") {
            console.error(`❌ Sarvam Job failed with status:`, status);
            throw new Error(`Document Intelligence Job failed with state: ${status.job_state}`);
        }

        // 5. Get metrics (optional, for logging)
        const metrics = job.getPageMetrics();
        console.log(`📊 Pages processed: ${metrics.pagesProcessed}`);

        // 6. Download the output ZIP
        console.log(`📥 Downloading output to ${zipPath}...`);
        await job.downloadOutput(zipPath);

        // 7. Extract Markdown content from the downloaded ZIP
        console.log(`📦 Extracting text from downloaded archive...`);
        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();

        let markdownContent = '';
        let mdFileFound = false;

        for (const entry of zipEntries) {
            if (entry.entryName.endsWith('.md')) {
                markdownContent = entry.getData().toString('utf8');
                mdFileFound = true;
                break;
            }
        }

        if (!mdFileFound) {
            throw new Error("No Markdown (.md) file could be found in the extracted output archive");
        }

        console.log(`✅ Extracted markdown text length: ${markdownContent.length} chars`);

        return markdownContent;

    } catch (err) {
        console.error('❌ Error processing document via Sarvam:', err.message);
        // Fall back gracefully rather than throwing
        return null;
    } finally {
        // Always try to cleanup the downloaded zip file and input zip file
        try {
            await fs.access(zipPath);
            await fs.unlink(zipPath);
            console.log(`🧹 Cleaned up temporary output zip file ${zipPath}`);
        } catch (e) {
            // File might not exist
        }

        try {
            await fs.access(inputZipPath);
            await fs.unlink(inputZipPath);
            console.log(`🧹 Cleaned up temporary input zip file ${inputZipPath}`);
        } catch (e) {
            // File might not exist
        }
    }
};
