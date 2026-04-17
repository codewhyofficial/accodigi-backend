import { PDFParse } from 'pdf-parse';

console.log('PDFParse is a:', typeof PDFParse);

const options = { data: Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<</Title (Test)>>\nendobj\ntrailer\n<</Root 1 0 R>>\n%%EOF'), verbosity: 0 };
try {
    const parser = new PDFParse(options);
    console.log('Parser instantiated');
} catch (e) {
    console.log('Failed:', e.message);
}
