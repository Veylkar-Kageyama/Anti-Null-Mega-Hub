const assert = require('node:assert/strict');
const { test } = require('node:test');

test('AI PDF exports produce a valid multi-page PDF with source links', async () => {
  const { createPdfBytes } = await import('../public/ai-files.mjs');
  const bytes = createPdfBytes('A'.repeat(5000), [{ title: 'Source', url: 'https://example.com' }]);
  const pdf = Buffer.from(bytes).toString('ascii');
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.ok(pdf.includes('/Count 2'));
  assert.ok(pdf.includes('https://example.com'));
  assert.ok(pdf.endsWith('%%EOF\n'));
});

test('AI ZIP exports contain safe UTF-8 filenames and valid ZIP directory records', async () => {
  const { createZipBytes } = await import('../public/ai-files.mjs');
  const bytes = createZipBytes([
    { name: '../response.txt', data: 'AI response' },
    { name: 'code.js', data: 'console.log("hi");' }
  ]);
  const zip = Buffer.from(bytes);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from('.._response.txt')));
  assert.ok(zip.includes(Buffer.from('code.js')));
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 12), 2);
});
