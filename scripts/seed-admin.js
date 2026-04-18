import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the root directory
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@truelog.com';
    const password = 'admin123';
    const name = 'System Admin';

    console.log('🚀 Starting admin seed...');

    try {
        // Check if admin already exists
        const existingAdmin = await prisma.admin.findUnique({
            where: { email }
        });

        if (existingAdmin) {
            console.log('⚠️ Admin already exists. Skipping...');
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const admin = await prisma.admin.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: 'OWNER'
            }
        });

        console.log('✅ Admin created successfully:');
        console.log(`   Email: ${admin.email}`);
        console.log(`   Name: ${admin.name}`);
        console.log(`   Role: ${admin.role}`);
        console.log('\n🔐 You can now login with:');
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${password}`);

    } catch (error) {
        console.error('❌ Error seeding admin:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
