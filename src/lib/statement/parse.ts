import { round2 } from '../format';
import { StatementError } from './types';
import type { Direction, ParsedStatement, StatementPage, StatementRow, StatementSummary, TextItem } from './types';

/*
 * Reads the transaction table out of a bank statement's text layer.
 *
 * Statements are laid out in columns, so everything works from positions: find the header row, learn where each column
 * sits, then read every line by which column its pieces fall under. Narrations the bank wrapped over several lines are
 * joined back together, rows carry on across page breaks, and the result is checked against the bank's own summary.
 */

type Role = 'date' | 'valueDate' | 'narration' | 'ref' | 'withdrawal' | 'deposit' | 'amount' | 'drcr' | 'balance' | 'other';

interface Column {
  role: Role;
  left: number;
  right: number;
  center: number;
}

interface Line {
  page: number;
  y: number;
  items: TextItem[];
  text: string;
}

interface AmountCell {
  role: Role;
  value: number;
  dr: boolean | null;
}

interface Cells {
  date: string | null;
  dateRight: number;
  narration: TextItem[];
  ref: TextItem[];
  amounts: AmountCell[];
  marker: Direction | null;
}

interface NarrationLine {
  text: string;
  x: number;
  /** The line began with a space, i.e. the bank wrapped at a word break */
  lead: boolean;
}

interface Draft {
  date: string;
  lines: NarrationLine[];
  ref: string;
  amounts: AmountCell[];
  marker: Direction | null;
}

/** Pieces of text closer than this vertically (points) are on the same line. */
const SAME_LINE = 2;
/** How far a date may sit from its column heading and still count as the row's date. */
const DATE_SLACK = 25;

/** First match wins, so the specific headings come before the general ones. */
const HEADINGS: [Role, RegExp][] = [
  ['valueDate', /^value\s*(date|dt)\.?$/i],
  ['date', /^((txn|tran|trans|transaction|posting|post|book(ing)?)\.?\s*)?(date|dt)\.?$/i],
  ['narration', /narration|description|particulars|remarks|details/i],
  ['ref', /chq|cheque|ref|instrument/i],
  ['withdrawal', /withdrawal|debit|^dr\.?$|paid\s*out/i],
  ['deposit', /deposit|credit|^cr\.?$|paid\s*in/i],
  ['balance', /balance/i],
  ['drcr', /^(dr\s*\/\s*cr|cr\s*\/\s*dr|type)\.?$/i],
  ['amount', /^((txn|transaction)\.?\s*)?(amount|amt)\b/i],
];

const MONEY_ROLES = new Set<Role>(['withdrawal', 'deposit', 'amount', 'balance']);
const END_OF_TABLE = /statement\s+summary|end\s+of\s+(the\s+)?statement/i;

const AMOUNT = /^(\()?([-+])?\s*(?:₹|rs\.?|inr)?\s*([-+])?\s*(\d{1,3}(?:,\d{2,3})+|\d{1,13})(\.\d{1,2})?\s*(\))?\s*(dr|cr)?\.?$/i;
const DATE = /^(\d{1,2})[\s\-/.]+(\d{1,2}|[a-z]{3,9})[\s\-/.,]+(\d{4}|\d{2})$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseAmount(text: string): { value: number; dr: boolean | null } | null {
  const m = AMOUNT.exec(text.trim());
  if (!m) return null;
  const [, open, sign, innerSign, whole, fraction = '', close, side] = m;
  if (Boolean(open) !== Boolean(close)) return null;
  const value = round2(Number(whole.replace(/,/g, '') + fraction));
  const negative = Boolean(open) || sign === '-' || innerSign === '-';
  return { value: negative && value ? -value : value, dr: side ? side.toLowerCase() === 'dr' : null };
}

/** Day-first dates as Indian banks print them: 05/04/26, 05-04-2026, 05-Apr-2026, 05 Apr 2026, or ISO. */
export function parseDate(text: string): string | null {
  const t = text.trim();
  let day: number, month: number, year: number;
  const iso = ISO_DATE.exec(t);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else {
    const m = DATE.exec(t);
    if (!m) return null;
    day = Number(m[1]);
    month = /^\d+$/.test(m[2]) ? Number(m[2]) : MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  }
  if (month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate()) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toLines(items: TextItem[], page: number): Line[] {
  // Some PDFs draw the same text twice in the same place
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    const key = `${item.text}|${item.x.toFixed(1)}|${item.y.toFixed(1)}`;
    if (!item.text.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const item of unique) {
    const line = lines.at(-1);
    if (line && line.y - item.y <= SAME_LINE) line.items.push(item);
    else lines.push({ page, y: item.y, items: [item], text: '' });
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((item) => item.text.trim()).join(' ');
  }
  return lines;
}

const right = (item: TextItem) => item.x + item.width;
const middle = (item: TextItem) => item.x + item.width / 2;

/** Columns are matched by whichever edge lines up — amounts are usually right-aligned, text left-aligned or centred. */
const distance = (item: TextItem, col: Column) =>
  Math.min(Math.abs(item.x - col.left), Math.abs(right(item) - col.right), Math.abs(middle(item) - col.center));

function nearest(item: TextItem, cols: Column[]): Column {
  return cols.reduce((best, col) => (distance(item, col) < distance(item, best) ? col : best));
}

/** The columns of a header row, or null if the line isn't one. */
function headerColumns(line: Line): Column[] | null {
  // Join a heading split into several pieces ("Withdrawal" "Amt.")
  const headings: TextItem[] = [];
  for (const item of line.items) {
    const prev = headings.at(-1);
    if (prev && item.x - right(prev) < 4)
      headings[headings.length - 1] = { ...prev, text: `${prev.text} ${item.text.trim()}`, width: right(item) - prev.x };
    else headings.push({ ...item, text: item.text.trim() });
  }
  const cols = headings.map((item) => ({
    role: (item.text.length <= 30 && HEADINGS.find(([, re]) => re.test(item.text))?.[0]) || 'other',
    left: item.x,
    right: right(item),
    center: middle(item),
  }));
  const has = (role: Role) => cols.some((col) => col.role === role);
  const isHeader =
    (has('date') || has('valueDate')) &&
    (has('withdrawal') || has('deposit') || has('amount')) &&
    (has('balance') || (has('withdrawal') && has('deposit')));
  return isHeader ? cols : null;
}

function readLine(line: Line, cols: Column[]): Cells {
  const dateCol = cols.find((col) => col.role === 'date') ?? cols.find((col) => col.role === 'valueDate');
  const textCols = cols.filter((col) => col.role === 'narration' || col.role === 'ref');
  const cells: Cells = { date: null, dateRight: 0, narration: [], ref: [], amounts: [], marker: null };

  for (const item of line.items) {
    const text = item.text.trim();
    const col = nearest(item, cols);
    if (MONEY_ROLES.has(col.role)) {
      const amount = parseAmount(text);
      if (amount) cells.amounts.push({ role: col.role, ...amount });
      else if (/^(dr|cr)\.?$/i.test(text)) {
        // "Dr"/"Cr" printed as its own piece after the amount it belongs to
        const owner = cells.amounts.findLast((cell) => cell.role === col.role);
        if (owner) owner.dr = /^dr/i.test(text);
      }
      continue;
    }
    if (col.role === 'drcr') {
      if (/^(dr|debit|d)\.?$/i.test(text)) cells.marker = 'debit';
      else if (/^(cr|credit|c)\.?$/i.test(text)) cells.marker = 'credit';
      continue;
    }
    if (col.role === 'date' || col.role === 'valueDate') {
      const date = parseDate(text);
      if (date && distance(item, col) <= DATE_SLACK) {
        if (col === dateCol && !cells.date) [cells.date, cells.dateRight] = [date, right(item)];
        continue;
      }
      if (col.role === 'valueDate') continue;
    }
    if (col.role === 'other') continue;
    // Narration often starts well left of its centred heading, so anything left over is narration or reference
    const target = textCols.length ? nearest(item, textCols) : null;
    (target?.role === 'ref' ? cells.ref : cells.narration).push(item);
  }
  return cells;
}

function narrationLine(items: TextItem[]): NarrationLine | null {
  if (!items.length) return null;
  let text = items[0].text.trim();
  for (let i = 1; i < items.length; i++) text += (items[i].x - right(items[i - 1]) > 1 ? ' ' : '') + items[i].text.trim();
  return { text, x: items[0].x, lead: /^\s/.test(items[0].text) };
}

function addCells(draft: Draft, cells: Cells) {
  const line = narrationLine(cells.narration);
  if (line) draft.lines.push(line);
  const ref = narrationLine(cells.ref);
  if (ref) draft.ref += ref.text;
}

/**
 * At a cut that may have swallowed a space, glue only when it's clearly inside a code — a UPI ID, IFSC or reference
 * number: next to a separator, or with a digit or @ in the word on either side.
 */
const cutMidToken = (prev: string, next: string) =>
  /[-@./_:]$/.test(prev) ||
  /^[-@./_:]/.test(next) ||
  /[@\d]/.test(prev.split(/[\s-]+/).at(-1) ?? '') ||
  /[@\d]/.test(next.split(/[\s-]+/)[0]);

/**
 * Re-joins a narration the bank spread over several lines. HDFC (the model here) stores narrations in fixed-width
 * pieces — cut anywhere, mid-word included — prints each piece on its own line, and wraps a piece too wide for the
 * column at a space onto a line that hangs a little further left. So: a hanging line inside a piece gets its space back,
 * a new piece is glued on unless it starts with a space (drawn indented), and other banks' plain word-wrapped lines
 * (shorter than the full width) are joined with spaces.
 */
function joinNarration(lines: NarrationLine[], fullWidth: number, baseX: number): string {
  let text = lines[0]?.text ?? '';
  let piece = text.length;
  for (const line of lines.slice(1)) {
    const prev = text;
    const indented = line.lead || line.x > baseX + 1;
    const hanging = line.x < baseX - 1;
    let space: boolean;
    if (indented) [space, piece] = [true, line.text.length + 1];
    else if (hanging && piece < fullWidth - 1) [space, piece] = [true, piece + 1 + line.text.length];
    else if (piece >= fullWidth) [space, piece] = [false, line.text.length];
    else if (piece === fullWidth - 1) [space, piece] = [!cutMidToken(prev, line.text), line.text.length];
    else [space, piece] = [true, line.text.length];
    text += (space ? ' ' : '') + line.text;
  }
  return text;
}

const mode = (values: number[]) => {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best), [NaN, 0])[0];
};

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
const signed = (row: StatementRow) => (row.direction === 'credit' ? row.amount : -row.amount);

function directionFromBalance(previous: number | null, balance: number | null, amount: number): Direction | null {
  if (previous === null || balance === null) return null;
  const change = round2(balance - previous);
  return near(change, amount) ? 'credit' : near(change, -amount) ? 'debit' : null;
}

function toRows(drafts: Draft[], opening: number | undefined): StatementRow[] {
  // The full line width is the longest line that was followed by another; most lines start at the same x
  const fullWidth = Math.max(0, ...drafts.flatMap((d) => d.lines.slice(0, -1).map((line) => line.text.length)));
  const baseX = mode(drafts.flatMap((d) => d.lines.map((line) => Math.round(line.x))));
  const rows: StatementRow[] = [];
  let previousBalance = opening ?? null;
  for (const draft of drafts) {
    const base = { date: draft.date, narration: joinNarration(draft.lines, fullWidth, baseX), ref: draft.ref };
    const total = (role: Role) => round2(draft.amounts.reduce((sum, cell) => sum + (cell.role === role ? Math.abs(cell.value) : 0), 0));
    const balanceCell = draft.amounts.find((cell) => cell.role === 'balance');
    const balance = balanceCell ? (balanceCell.dr ? -Math.abs(balanceCell.value) : balanceCell.value) : null;
    const [withdrawal, deposit] = [total('withdrawal'), total('deposit')];

    if (withdrawal > 0) rows.push({ ...base, amount: withdrawal, direction: 'debit', balance: deposit > 0 ? null : balance });
    if (deposit > 0) rows.push({ ...base, amount: deposit, direction: 'credit', balance });
    const single = draft.amounts.find((cell) => cell.role === 'amount');
    if (single?.value && !withdrawal && !deposit) {
      const amount = Math.abs(single.value);
      const hint: Direction | null = single.dr === null ? (single.value < 0 ? 'debit' : null) : single.dr ? 'debit' : 'credit';
      const direction = draft.marker ?? hint ?? directionFromBalance(previousBalance, balance, amount);
      if (direction) rows.push({ ...base, amount, direction, balance });
    }
    if (balance !== null) previousBalance = balance;
  }
  return rows;
}

const SUMMARY_LABELS: [keyof StatementSummary, RegExp][] = [
  ['openingBalance', /^opening\s*bal(ance)?$/i],
  ['closingBalance', /^closing\s*bal(ance)?$/i],
  ['debitCount', /^(dr|debit)s?\.?\s*(count|txns?|transactions)$/i],
  ['creditCount', /^(cr|credit)s?\.?\s*(count|txns?|transactions)$/i],
  ['debitTotal', /^(total\s*)?(debits?|withdrawals?)(\s*amount)?$/i],
  ['creditTotal', /^(total\s*)?(credits?|deposits?)(\s*amount)?$/i],
];
const INLINE_BALANCE =
  /\b(opening|closing)\s+bal(?:ance)?\s*[:-]?\s*((?:₹|rs\.?|inr)?\s*\(?-?[\d,]+(?:\.\d{1,2})?\)?(?:\s*(?:dr|cr)\b)?)/gi;

const summaryField = (text: string) => SUMMARY_LABELS.find(([, re]) => re.test(text.trim().replace(/[\s:-]+$/, '')))?.[0] ?? null;

function setField(summary: StatementSummary, field: keyof StatementSummary, text: string) {
  if (summary[field] !== undefined) return;
  if (field === 'debitCount' || field === 'creditCount') {
    const count = text.trim().replace(/,/g, '');
    if (/^\d+$/.test(count)) summary[field] = Number(count);
    return;
  }
  const amount = parseAmount(text);
  if (!amount) return;
  const isBalance = field === 'openingBalance' || field === 'closingBalance';
  summary[field] = isBalance && amount.dr ? -Math.abs(amount.value) : isBalance ? amount.value : Math.abs(amount.value);
}

/** The bank's own totals: a row of labels with the values beneath (HDFC), labels with values beside them, or "Opening Balance: …". */
function readSummary(lines: Line[]): StatementSummary | null {
  const summary: StatementSummary = {};
  lines.forEach((line, i) => {
    const labels = line.items.flatMap((item) => {
      const field = summaryField(item.text);
      return field ? [{ item, field }] : [];
    });
    if (new Set(labels.map((label) => label.field)).size < 2) return;
    const below = lines[i + 1];
    if (below?.page === line.page && line.y - below.y <= 25) {
      for (const value of below.items) {
        const label = labels.reduce((best, l) =>
          Math.abs(middle(l.item) - middle(value)) < Math.abs(middle(best.item) - middle(value)) ? l : best,
        );
        if (Math.abs(middle(label.item) - middle(value)) <= 40) setField(summary, label.field, value.text);
      }
    }
    for (const { item, field } of labels) {
      const next = line.items[line.items.indexOf(item) + 1];
      if (next && !summaryField(next.text)) setField(summary, field, next.text);
    }
  });
  for (const line of lines) {
    for (const [, kind, value] of line.text.matchAll(INLINE_BALANCE)) {
      setField(summary, kind.toLowerCase() === 'opening' ? 'openingBalance' : 'closingBalance', value);
    }
  }
  return Object.keys(summary).length ? summary : null;
}

function derivedOpening(rows: StatementRow[]): number | null {
  const first = rows[0];
  return first?.balance == null ? null : round2(first.balance - signed(first));
}

/** The balance before the first row: from the bank's summary, or worked back from the first row's balance. */
export function openingBalanceOf(statement: Pick<ParsedStatement, 'rows' | 'summary'>): number | null {
  return statement.summary?.openingBalance ?? derivedOpening(statement.rows);
}

function verify(rows: StatementRow[], summary: StatementSummary | null): ParsedStatement['checks'] {
  let balanceBreaks = 0;
  rows.forEach((row, i) => {
    const prev = rows[i - 1]?.balance;
    if (prev != null && row.balance !== null && !near(prev + signed(row), row.balance)) balanceBreaks++;
  });
  if (!summary) return { summaryMatches: null, balanceBreaks };

  const debits = rows.filter((row) => row.direction === 'debit');
  const credits = rows.filter((row) => row.direction === 'credit');
  const debitTotal = round2(debits.reduce((sum, row) => sum + row.amount, 0));
  const creditTotal = round2(credits.reduce((sum, row) => sum + row.amount, 0));
  const { openingBalance, closingBalance } = summary;
  const lastBalance = rows.at(-1)?.balance ?? null;
  const firstOpening = derivedOpening(rows);
  const results = [
    summary.debitCount === undefined || summary.debitCount === debits.length,
    summary.creditCount === undefined || summary.creditCount === credits.length,
    summary.debitTotal === undefined || near(summary.debitTotal, debitTotal),
    summary.creditTotal === undefined || near(summary.creditTotal, creditTotal),
    openingBalance === undefined || closingBalance === undefined || near(openingBalance + creditTotal - debitTotal, closingBalance),
    closingBalance === undefined || lastBalance === null || near(lastBalance, closingBalance),
    openingBalance === undefined || firstOpening === null || near(firstOpening, openingBalance),
  ];
  return { summaryMatches: results.every(Boolean), balanceBreaks };
}

/** Longer names first: "State Bank of India" must not count as "Bank of India". */
const BANKS: [RegExp, string][] = [
  [/\bHDFC\s*BANK\b/gi, 'HDFC Bank'],
  [/\bICICI\s*BANK\b/gi, 'ICICI Bank'],
  [/\bSTATE\s+BANK\s+OF\s+INDIA\b/gi, 'State Bank of India'],
  [/\bAXIS\s*BANK\b/gi, 'Axis Bank'],
  [/\bKOTAK\s+MAHINDRA\b/gi, 'Kotak Mahindra Bank'],
  [/\bPUNJAB\s+NATIONAL\s+BANK\b/gi, 'Punjab National Bank'],
  [/\bBANK\s+OF\s+BARODA\b/gi, 'Bank of Baroda'],
  [/\bCANARA\s+BANK\b/gi, 'Canara Bank'],
  [/\bUNION\s+BANK\s+OF\s+INDIA\b/gi, 'Union Bank of India'],
  [/\bCENTRAL\s+BANK\s+OF\s+INDIA\b/gi, 'Central Bank of India'],
  [/\bINDUSIND\s+BANK\b/gi, 'IndusInd Bank'],
  [/\bIDFC\s+FIRST\b/gi, 'IDFC FIRST Bank'],
  [/\bIDBI\s+BANK\b/gi, 'IDBI Bank'],
  [/\bYES\s+BANK\b/gi, 'Yes Bank'],
  [/\bFEDERAL\s+BANK\b/gi, 'Federal Bank'],
  [/\bAU\s+SMALL\s+FINANCE\b/gi, 'AU Small Finance Bank'],
  [/\bINDIAN\s+OVERSEAS\s+BANK\b/gi, 'Indian Overseas Bank'],
  [/\bINDIAN\s+BANK\b/gi, 'Indian Bank'],
  [/\bBANK\s+OF\s+INDIA\b/gi, 'Bank of India'],
];

/** A heading that is just a bank's name: "KARUR VYSYA BANK LTD". */
const BANK_HEADING = /^([A-Z][A-Z&.' ]{1,40}?\sBANK)(?:\s+(?:LTD|LIMITED))?\.?$/;

/**
 * The bank named most often outside the table (narrations mention other banks all the time), or failing that a heading
 * line that names one.
 */
function detectBank(lines: Line[]): string | null {
  const counts = new Map<string, number>();
  for (const line of lines) {
    let text = line.text;
    for (const [re, name] of BANKS) {
      const hits = text.match(re)?.length ?? 0;
      if (!hits) continue;
      counts.set(name, (counts.get(name) ?? 0) + hits);
      text = text.replace(re, ' ');
    }
  }
  let best: string | null = null;
  for (const [name, hits] of counts) if (best === null || hits > (counts.get(best) ?? 0)) best = name;
  if (best) return best;
  const heading = lines.map((line) => BANK_HEADING.exec(line.text.trim())).find(Boolean);
  return heading
    ? heading[1].toLowerCase().replace(/(^|[\s&.'])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase())
    : null;
}

const ACCOUNT_NUMBER = /\b(?:account|a\/c|acct)\.?\s*(?:no|number|num)\.?\s*[:.-]?\s*([\dXx*]{4,20}(?:[ -][\dXx*]{4,20}){0,3})/i;
const DATE_TEXT = String.raw`\d{4}-\d{2}-\d{2}|\d{1,2}[\s\-/.]+(?:\d{1,2}|[A-Za-z]{3,9})[\s\-/.,]+\d{2,4}`;
const PERIOD = new RegExp(String.raw`\b(?:from|period)\b\s*:?\s*(${DATE_TEXT})\s*(?:to|-|–)\s*:?\s*(${DATE_TEXT})`, 'i');

function readLast4(text: string): string | null {
  const digits = ACCOUNT_NUMBER.exec(text)?.[1].replace(/\D/g, '') ?? '';
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function readPeriod(text: string, rows: StatementRow[]): ParsedStatement['period'] {
  const m = PERIOD.exec(text);
  const [from, to] = m ? [parseDate(m[1]), parseDate(m[2])] : [null, null];
  if (from && to) return { from, to };
  const dates = rows.map((row) => row.date).sort();
  return { from: dates[0] ?? null, to: dates.at(-1) ?? null };
}

/** Turns the text of every page into transactions. Throws a StatementError the UI can show as is. */
export function parseStatement(pages: StatementPage[]): ParsedStatement {
  const pageLines = pages.map((page, i) => toLines(page.items, i));
  if (!pageLines.some((lines) => lines.length)) {
    throw new StatementError(
      'This PDF has no text to read — it looks like a scan or a photo. Download the statement from your bank’s website or app as a PDF and try that.',
      'no-text',
    );
  }

  const outside: Line[] = []; // everything that isn't part of the table: account details, summary, footers
  const drafts: Draft[] = [];
  let cols: Column[] | null = null;
  let anchor: string | null = null; // the line just above the header, to find where the table resumes on later pages
  let draft: Draft | null = null;
  let dateRight: number | null = null;
  let ended = false;

  for (const lines of pageLines) {
    const headerAt = ended ? -1 : lines.findIndex((line) => headerColumns(line) !== null);
    let start = lines.length;
    let continues = true; // may this page's first lines continue the previous page's last row?
    if (headerAt >= 0) {
      cols = headerColumns(lines[headerAt]);
      anchor ??= headerAt > 0 ? lines[headerAt - 1].text : null;
      outside.push(...lines.slice(0, headerAt));
      start = headerAt + 1;
    } else if (cols && !ended) {
      // Pages without their own header (HDFC prints it once): the table starts after the repeated account block
      const anchorAt = anchor === null ? -1 : lines.findIndex((line) => line.text === anchor);
      outside.push(...lines.slice(0, anchorAt + 1));
      start = anchorAt + 1;
      continues = anchorAt >= 0;
    } else outside.push(...lines);
    if (!cols || start >= lines.length) continue;

    const columns = cols;
    const dateCol = columns.find((col) => col.role === 'date') ?? columns.find((col) => col.role === 'valueDate');
    const moneyLeft = Math.min(...columns.filter((col) => MONEY_ROLES.has(col.role)).map((col) => col.left));
    const body = lines.slice(start);
    const gaps = body
      .slice(1)
      .map((line, i) => body[i].y - line.y)
      .sort((a, b) => a - b);
    const lineGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 18;
    let lastY: number | null = null;

    for (const line of body) {
      if (ended || END_OF_TABLE.test(line.text)) {
        ended = true;
        outside.push(line);
        continue;
      }
      const cells = readLine(line, columns);
      if (cells.date) {
        draft = { date: cells.date, lines: [], ref: '', amounts: cells.amounts, marker: cells.marker };
        addCells(draft, cells);
        drafts.push(draft);
        dateRight = Math.max(dateRight ?? 0, cells.dateRight);
        continues = true;
        lastY = line.y;
        continue;
      }
      // A wrapped narration: text only, indented past the dates, left of the amounts, right under the previous line
      const isContinuation =
        draft !== null &&
        continues &&
        !cells.amounts.length &&
        cells.narration.length + cells.ref.length > 0 &&
        line.items[0].x >= (dateRight ?? dateCol?.right ?? 0) - 2 &&
        right(line.items[line.items.length - 1]) <= moneyLeft &&
        (lastY === null || lastY - line.y <= lineGap * 2.5);
      if (draft && isContinuation) {
        addCells(draft, cells);
        lastY = line.y;
      } else outside.push(line);
    }
  }

  if (!cols) {
    throw new StatementError(
      'Couldn’t find a transaction table in this PDF. Use the account statement PDF from your bank (credit card bills and scanned copies won’t work).',
      'no-table',
    );
  }
  const summary = readSummary(outside);
  const rows = toRows(drafts, summary?.openingBalance);
  if (!rows.length) throw new StatementError('Found the transaction table, but there are no transactions in it.', 'no-rows');

  const outsideText = outside.map((line) => line.text).join('\n');
  return {
    bank: detectBank(outside),
    accountLast4: readLast4(outsideText),
    period: readPeriod(outsideText, rows),
    rows,
    summary,
    checks: verify(rows, summary),
  };
}
