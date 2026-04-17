import vision from '@google-cloud/vision';
import config from '../config/env.js';
import AppError from '../utils/AppError.js';

// Initialize client
const client = new vision.ImageAnnotatorClient();

export const detectText = async (imageBuffer) => {
    try {
        const [result] = await client.textDetection(imageBuffer);
        return result;
    } catch (error) {
        console.error('OCR Error:', error);
        throw new AppError(`Failed to process image with OCR: ${error.details || error.message}`, 500);
    }
};


