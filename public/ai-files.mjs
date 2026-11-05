const encoder = new TextEncoder();

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pdfSafeText(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

function wrapPdfLines(text) {
  const lines = [];
  for (const rawLine of pdfSafeText(text).split(/\r?\n/)) {
    let remaining = rawLine;
    while (remaining.length > 94) {
      let end = remaining.lastIndexOf(' ', 94);
      if (end < 30) end = 94;
      lines.push(remaining.slice(0, end));
      remaining = remaining.slice(end).trimStart();
    }
    lines.push(remaining);
  }
  return lines;
}

export function createPdfBytes(text, sources = []) {
  const sourceText = sources.length
    ? `\n\nSources\n${sources.map((source, index) => `[${index + 1}] ${source.title}: ${source.url}`).join('\n')}`
    : '';
  const lines = wrapPdfLines(`${text}${sourceText}`);
  const pages = [];
  while (lines.length) pages.push(lines.splice(0, 50));
  if (!pages.length) pages.push(['']);

  const objects = [];
  const pageIds = pages.map((_page, index) => 4 + index * 2);
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  pages.forEach((pageLines, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const commands = [
      'BT',
      '/F1 10 Tf',
      '54 750 Td',
      '14 TL',
      ...pageLines.map((line) => `(${line.replace(/[\\()]/g, '\\$&')}) Tj T*`),
      'ET'
    ].join('\n');
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId - 1] = `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`;
  });

  let document = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(document.length);
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = document.length;
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) document += `${String(offset).padStart(10, '0')} 00000 n \n`;
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(document);
}

const crcTable = Uint32Array.from({ length: 256 }, (_unused, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipHeader(signature, size) {
  const bytes = new Uint8Array(size);
  new DataView(bytes.buffer).setUint32(0, signature, true);
  return bytes;
}

function concatenate(chunks) {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function createZipBytes(entries) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name.replace(/[\\/:*?"<>|]/g, '_'));
    const data = entry.data instanceof Uint8Array ? entry.data : encoder.encode(String(entry.data));
    const checksum = crc32(data);
    const local = zipHeader(0x04034b50, 30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0x21, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localRecords.push(local, data);

    const central = zipHeader(0x02014b50, 46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0x21, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralRecords.push(central);
    localOffset += local.length + data.length;
  }

  const centralDirectory = concatenate(centralRecords);
  const end = zipHeader(0x06054b50, 22);
  const endView = new DataView(end.buffer);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, localOffset, true);
  return concatenate([...localRecords, centralDirectory, end]);
}

export function downloadText(text) {
  saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'anti-null-response.txt');
}

export function downloadPdf(text, sources) {
  saveBlob(new Blob([createPdfBytes(text, sources)], { type: 'application/pdf' }), 'anti-null-response.pdf');
}

export function downloadZip(text, sources = [], image = '') {
  const entries = [{ name: 'response.txt', data: text }];
  if (image) {
    const encodedImage = image.split(',')[1];
    if (encodedImage) {
      const binary = atob(encodedImage);
      entries.push({ name: 'generated-image.png', data: Uint8Array.from(binary, (character) => character.charCodeAt(0)) });
    }
  }
  const codeBlocks = [...text.matchAll(/```([a-zA-Z0-9_+-]*)\s*\n([\s\S]*?)```/g)];
  const extensions = new Map([
    ['javascript', 'js'], ['typescript', 'ts'], ['python', 'py'], ['html', 'html'],
    ['css', 'css'], ['json', 'json'], ['java', 'java'], ['rust', 'rs'],
    ['csharp', 'cs'], ['cpp', 'cpp'], ['sql', 'sql'], ['bash', 'sh'],
    ['shell', 'sh'], ['yaml', 'yml'], ['xml', 'xml']
  ]);
  codeBlocks.forEach((match, index) => {
    const extension = extensions.get(match[1].toLowerCase()) || 'txt';
    entries.push({ name: `code-${String(index + 1).padStart(2, '0')}.${extension}`, data: match[2] });
  });
  if (sources.length) {
    entries.push({
      name: 'sources.txt',
      data: sources.map((source, index) => `[${index + 1}] ${source.title}\n${source.url}`).join('\n\n')
    });
  }
  saveBlob(new Blob([createZipBytes(entries)], { type: 'application/zip' }), 'anti-null-response.zip');
}
