import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

console.log('PDFParse type:', typeof pdf.PDFParse);
try {
    const parser = new pdf.PDFParse();
    console.log('Instance methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(parser)));
} catch (e) {
    console.log('Failed to instantiate:', e.message);
}
