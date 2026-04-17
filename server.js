import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import authRoutes from './src/routes/auth.routes.js';
import caRoutes from './src/routes/ca.routes.js';
import clientRoutes from './src/routes/client.routes.js';
import adminRoutes from './src/routes/admin.routes.js';
import usageRoutes from './src/routes/usage.routes.js';
import globalErrorHandler from './src/middlewares/error.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configs
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://accodigi.com',
    'https://www.accodigi.com',
    'https://truelog.in',
    'https://www.truelog.in'
];

app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
}));
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(morgan('dev'));

// Serve uploaded media files
app.use('/media', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/auth', authRoutes);
app.use('/ca', caRoutes);
app.use('/clients', clientRoutes);
app.use('/admin', adminRoutes);
app.use('/usage', usageRoutes);

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', timestamp: new Date() });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Global Error Handler
app.use(globalErrorHandler);

// Connect to DB (with Neon cold-start retry), then start server
import prisma from './src/prisma/index.js';

const startServer = async () => {
    try {
        await prisma.$connectWithRetry();
    } catch (err) {
        console.error('❌ Failed to connect to database after retries:', err.message);
        console.log('⚠️  Server starting anyway — Neon may wake up on first request.');
    }

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT} (bound to all interfaces)`);
    });
};

startServer();
