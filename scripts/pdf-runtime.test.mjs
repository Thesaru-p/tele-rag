import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// A real, selectable-text PDF with a valid cross-reference table.
function samplePdf() {
  const text = 'BT /F1 16 Tf 50 150 Td (Beginner pottery class costs 35 dollars.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf).toString('base64');
}

test('cold PDF extraction works when PDF.js cannot dynamically require canvas', () => {
  const script = `
    const builtin = process.getBuiltinModule.bind(process);
    process.getBuiltinModule = name => {
      const value = builtin(name);
      if (name !== 'module') return value;
      return {...value, createRequire(url) {
        const require = value.createRequire(url);
        return id => {
          if (id === '@napi-rs/canvas') throw new Error('Canvas not found through dynamic require');
          return require(id);
        };
      }};
    };
    const {extractText} = await import('./scripts/api.mjs');
    const text = await extractText({buffer: Buffer.from(process.argv[1], 'base64')}, 'pdf');
    if (!text.includes('Beginner pottery class costs 35 dollars.')) throw new Error('PDF text was not extracted');
    console.log('PDF_TEXT_OK');
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, samplePdf()], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 30000,
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  assert.match(child.stdout, /PDF_TEXT_OK/);
});
