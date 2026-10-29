import { StatementError } from './types';
import type { StatementPage } from './types';

export type PdfJs = typeof import('pdfjs-dist');

export const MAX_PDF_BYTES = 25 * 1024 * 1024;

/**
 * Loads pdf.js on demand (it's large, and only the import screen needs it). The legacy build is used for older phones —
 * the modern one needs Safari 17.4+.
 */
export async function loadPdfjs(): Promise<PdfJs> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/** Every page's text with its position. Runs entirely on the device — the file is never uploaded anywhere. */
export async function extractPages(pdfjs: PdfJs, data: Uint8Array, password?: string): Promise<StatementPage[]> {
  if (data.byteLength > MAX_PDF_BYTES)
    throw new StatementError('This file is over 25 MB — that is too big for a bank statement.', 'unreadable');
  // pdf.js takes ownership of the buffer it's given, so hand it a copy and keep ours for a retry with a password
  const task = pdfjs.getDocument({ data: data.slice(), password, verbosity: 0 });
  let doc;
  try {
    doc = await task.promise;
  } catch (error) {
    void task.destroy();
    const name = error instanceof Error ? error.name : '';
    if (name === 'PasswordException') {
      const wrong = (error as { code?: number }).code === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
      throw wrong
        ? new StatementError(
            'That password didn’t work. Banks often use part of your name and date of birth — check the email the statement came with.',
            'bad-password',
          )
        : new StatementError('This statement is password-protected.', 'password');
    }
    throw new StatementError('This file couldn’t be opened as a PDF. It may be damaged, or not a PDF at all.', 'unreadable');
  }
  try {
    const pages: StatementPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({
        items: content.items.flatMap((item) =>
          'str' in item && item.str ? [{ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width }] : [],
        ),
      });
      page.cleanup();
    }
    return pages;
  } finally {
    void task.destroy();
  }
}
