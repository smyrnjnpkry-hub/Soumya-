/** Saves text as a file via a temporary object URL (works offline; nothing is uploaded). */
export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV with a UTF-8 byte-order mark so Excel shows ₹ and non-English notes correctly. */
export const downloadCSV = (filename: string, csv: string) => downloadFile(filename, `﻿${csv}`, 'text/csv;charset=utf-8');
