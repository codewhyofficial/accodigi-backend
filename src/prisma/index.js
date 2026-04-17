import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    // Neon free-tier cold start handling
    datasourceUrl: process.env.DATABASE_URL,
});

// Retry wrapper for Neon cold starts
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const originalConnect = prisma.$connect.bind(prisma);
prisma.$connectWithRetry = async () => {
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            await originalConnect();
            console.log('✅ Database connected');
            return;
        } catch (err) {
            console.warn(`⚠️ DB connection attempt ${i + 1}/${MAX_RETRIES} failed. Retrying in ${RETRY_DELAY_MS}ms...`);
            if (i === MAX_RETRIES - 1) throw err;
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
    }
};

export default prisma;
