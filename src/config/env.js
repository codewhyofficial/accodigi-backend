import 'dotenv/config';

const config = {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    jwt: {
        secret: process.env.JWT_SECRET,
        accessExpiry: process.env.JWT_ACCESS_EXPIRY || '2h',
        refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    },
    whatsapp: {
        apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0',
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
        appSecret: process.env.WHATSAPP_APP_SECRET,
    },
    google: {
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    },
    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
    },
    sarvam: {
        apiKey: process.env.SARVAM_API_KEY,
    },
    ocr: {
        primaryEngine: process.env.PRIMARY_OCR_ENGINE || 'VISION', // 'SARVAM' or 'VISION'
    }
};

export default config;
