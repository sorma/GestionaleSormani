// PDF testuale minimale, senza dipendenze esterne: i contenuti sono solo dati destinati al cliente.
export function simplePdf(lines: string[]): Buffer {
  const pageSize = 44;
  const pages: string[][] = [];
  const wrapped = lines.flatMap(wrapLine);
  for (let i = 0; i < wrapped.length; i += pageSize) pages.push(wrapped.slice(i, i + pageSize));
  if (pages.length === 0) pages.push([]);

  const objects: string[] = [];
  const add = (value: string) => { objects.push(value); return objects.length; };
  const catalogId = add("");
  const pagesId = add("");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];

  for (const [index, page] of pages.entries()) {
    const content = [
      "BT /F1 11 Tf 48 790 Td 15 TL",
      ...page.map((line, lineIndex) => `${lineIndex ? "T* " : ""}(${escapeText(line)}) Tj`),
      `T* (Pagina ${index + 1} di ${pages.length}) Tj`,
      "ET"
    ].join("\n");
    const bytes = Buffer.byteLength(content, "latin1");
    const streamId = add(`<< /Length ${bytes} >>\nstream\n${content}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`));
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

function wrapLine(line: string): string[] {
  const result: string[] = [];
  let rest = line;
  while (rest.length > 86) {
    const breakAt = rest.lastIndexOf(" ", 86);
    const width = breakAt > 20 ? breakAt : 86;
    result.push(rest.slice(0, width));
    rest = rest.slice(width).trimStart();
  }
  result.push(rest);
  return result;
}

function escapeText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?")
    .replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
