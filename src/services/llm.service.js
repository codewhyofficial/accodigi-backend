import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import fs from 'fs';
import config from '../config/env.js';

let ai = null;
const MODEL_NAME = 'gemini-3.1-flash-lite-preview';

const getAI = () => {
    if (!ai) {
        if (!config.gemini.apiKey) {
            throw new Error('GEMINI_API_KEY is not configured');
        }
        ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    }
    return ai;
};

const THINKING_CONFIG = {
    thinkingConfig: {
        thinkingLevel: ThinkingLevel.MINIMAL,
    },
};

/**
 * Extract raw text from an image using Gemini Vision (alternative to Google Cloud Vision OCR).
 * Useful as a fallback when Cloud Vision billing is not enabled.
 * 
 * @param {Buffer} imageBuffer - The raw image buffer
 * @returns {string} The extracted text
 */
export const extractTextFromImage = async (imageBuffer) => {
    const genai = getAI();

    const base64Image = Buffer.from(imageBuffer).toString('base64');

    try {
        const response = await genai.models.generateContent({
            model: MODEL_NAME,
            config: THINKING_CONFIG,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: 'Extract ALL text visible in this image. Return the raw text exactly as it appears, preserving the layout as much as possible. Do not add any commentary.' },
                        {
                            inlineData: {
                                mimeType: 'image/jpeg',
                                data: base64Image,
                            },
                        },
                    ],
                },
            ],
        });

        const usage = response.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0 };
        return {
            text: response.text.trim(),
            usage: {
                promptTokens: usage.promptTokenCount,
                completionTokens: usage.candidatesTokenCount,
                totalTokens: (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0)
            }
        };
    } catch (err) {
        console.error('❌ Gemini text extraction failed:', err.message);
        throw new Error(`Text extraction failed: ${err.message}`);
    }
};

/**
 * Generic JSON extraction from text using Gemini.
 * 
 * @param {string} prompt - The prompt containing the text and extraction instructions
 * @returns {Object} Parsed JSON data
 */
export const extractStructuredData = async (prompt) => {
    const genai = getAI();

    try {
        const response = await genai.models.generateContent({
            model: MODEL_NAME,
            config: THINKING_CONFIG,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        const responseText = response.text.trim();
        const jsonStr = responseText.startsWith('```') ? responseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '') : responseText;
        const usage = response.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0 };

        return {
            data: JSON.parse(jsonStr),
            usage: {
                promptTokens: usage.promptTokenCount,
                completionTokens: usage.candidatesTokenCount,
                totalTokens: (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0)
            }
        };
    } catch (err) {
        console.error('❌ Gemini JSON extraction failed:', err.message);
        throw new Error(`AI Extraction failed: ${err.message}`);
    }
};
