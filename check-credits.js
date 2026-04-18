import prisma from './src/prisma/index.js';

async function checkCreditTransactions() {
    const transactions = await prisma.creditTransaction.findMany({
        orderBy: { createdAt: 'desc' }
    });

    console.log('--- Credit Transactions ---');
    transactions.forEach(t => {
        console.log(`Date: ${t.createdAt.toISOString()} | CA: ${t.caId} | Amount: ${t.amount} | Type: ${t.type} | Msg: ${t.description}`);
    });

    const cas = await prisma.cA.findMany({
        select: { id: true, email: true, totalCredits: true, usedCredits: true }
    });
    console.log('\n--- CA Balances ---');
    cas.forEach(ca => {
        console.log(`CA: ${ca.email} | ID: ${ca.id} | Total: ${ca.totalCredits} | Used: ${ca.usedCredits}`);
    });
    process.exit(0);
}

checkCreditTransactions();
