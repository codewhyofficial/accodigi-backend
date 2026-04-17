import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

try {
    // Fix orphaned messages: link messages from 917982978119 to client with phone 7982978119
    const result = await prisma.message.updateMany({
        where: {
            sender: '917982978119',
            clientId: null,
        },
        data: {
            clientId: '1bcfeb72-761a-4d80-986f-90a33fc6e4f0',
        },
    });
    console.log(`✅ Fixed ${result.count} orphaned message(s)`);

    // Verify
    const messages = await prisma.message.findMany({
        where: { clientId: '1bcfeb72-761a-4d80-986f-90a33fc6e4f0' },
    });
    console.log(`📨 Client now has ${messages.length} message(s)`);
} catch (e) {
    console.log('❌ Error:', e.message);
} finally {
    await prisma.$disconnect();
}
