import type { Transaction, TransactionType } from '../types';
import type { Direction } from './types';

export interface Suggestion {
  type: TransactionType;
  /** Category id; '' for transfers */
  category: string;
}

/*
 * Keyword rules for Indian bank narrations. A keyword matches a whole word ("RENT" doesn't fire on "PARENT"); a trailing
 * * matches the start of a word ("PHARM*" → PHARMACY); keywords of six letters or more also match inside run-together
 * text ("AMAZONPAYGROCERY"), unless marked with a trailing ! . Rules are checked in order and the first match wins.
 */
const TRANSFER = '__transfer__';

const SPENDING: [string, string[]][] = [
  [TRANSFER, ['NWD', 'ATW', 'EAW', 'ATM WDL', 'ATM CASH', 'ATM WITHDRAWAL', 'CASH WDL', 'CASH WITHDRAWAL']],
  ['emi', ['EMI', 'LOAN*', 'BAJAJ FINANCE', 'BAJAJ FINSERV', 'HOME CREDIT', 'TVS CREDIT', 'HDB FINANCIAL', 'MUTHOOT', 'MANAPPURAM']],
  [
    'groceries',
    [
      'AMAZON PAY GROCER*',
      'BIGBASKET',
      'BB NOW',
      'BLINKIT',
      'GROFERS',
      'ZEPTO',
      'INSTAMART',
      'DMART',
      'AVENUE SUPERMART*',
      'JIOMART',
      'GROCER*',
      'SUPERMARKET',
      'SUPER MARKET',
      'KIRANA',
      'RELIANCE FRESH',
      'SMART BAZAAR',
      'SPENCER*',
      'NATURES BASKET',
      'COUNTRY DELIGHT',
      'MILKBASKET',
      'DAIRY',
      'MILK',
      'VEGETABLE*',
      'FRUIT*',
      'PROVISION*',
    ],
  ],
  [
    'food',
    [
      'ZOMATO',
      'SWIGGY',
      'EATSURE',
      'DOMINO*',
      'PIZZA*',
      'MCDONALD*',
      'KFC',
      'BURGER*',
      'SUBWAY',
      'STARBUCKS',
      'CAFE',
      'COFFEE',
      'CHAAYOS',
      'CHAI*',
      'TEA',
      'RESTAURANT*',
      'HOTEL',
      'DHABA',
      'BIRYANI',
      'BAKERY',
      'BAKERS',
      'SWEETS',
      'HALDIRAM*',
      'BIKANERVALA',
      'BARBEQUE',
      'BEHROUZ',
      'FAASOS',
      'FOOD*',
      'CANTEEN',
      'MESS',
      'KITCHEN',
      'TIFFIN',
      'JUICE',
      'ICE CREAM',
    ],
  ],
  [
    'transport',
    [
      'UBER',
      'OLA',
      'OLACABS',
      'OLA CABS',
      'RAPIDO',
      'BLUSMART',
      'NAMMA YATRI',
      'YULU',
      'METRO',
      'DMRC',
      'BMRCL',
      'FASTAG',
      'NETC',
      'TOLL',
      'PARKING',
      'PETROL*',
      'FUEL',
      'HPCL',
      'BPCL',
      'IOCL',
      'INDIAN OIL',
      'INDIANOIL',
      'SHELL',
      'NAYARA',
      'JIO BP',
      'FILLING STATION',
      'SERVICE STATION',
      'TAXI',
      'CAB',
      'CABS',
    ],
  ],
  [
    'travel',
    [
      'MAKEMYTRIP',
      'GOIBIBO',
      'CLEARTRIP',
      'YATRA',
      'EASEMYTRIP',
      'IXIGO',
      'IRCTC',
      'REDBUS',
      'ABHIBUS',
      'INDIGO',
      'INTERGLOBE',
      'AIR INDIA',
      'VISTARA',
      'SPICEJET',
      'AKASA',
      'AIRASIA',
      'AIRLINE*',
      'AIRPORT',
      'OYO',
      'AIRBNB',
      'BOOKING COM',
      'AGODA',
      'RESORT*',
      'TRAVEL*',
      'TOURS',
      'HOLIDAY*',
    ],
  ],
  [
    'bills',
    [
      'AIRTEL',
      'JIO',
      'VODAFONE',
      'BSNL',
      'MTNL',
      'RECHARGE',
      'PREPAID',
      'POSTPAID',
      'BROADBAND',
      'FIBERNET',
      'HATHWAY',
      'ELECTRICITY',
      'BESCOM',
      'MSEDCL',
      'TNEB',
      'TANGEDCO',
      'CESC',
      'BSES',
      'TPDDL',
      'TATA POWER',
      'ADANI ELECTRICITY',
      'TORRENT POWER',
      'UPPCL',
      'WATER BILL',
      'JAL BOARD',
      'BWSSB',
      'GAS',
      'INDANE',
      'BHARAT GAS',
      'HP GAS',
      'MAHANAGAR GAS',
      'DTH',
      'TATA PLAY',
      'TATA SKY',
      'DISH TV',
      'SUN DIRECT',
      'BILLPAY',
      'BILL PAY',
      'BILLDESK',
      'BBPS',
      'INSURANCE',
      'LIC',
      'PREMIUM',
      'POLICY*',
      'CC',
      'CREDIT CARD',
    ],
  ],
  ['rent', ['RENT', 'HOUSE RENT', 'NOBROKER', 'NESTAWAY', 'MAINTENANCE', 'SOCIETY', 'HOSTEL', 'LANDLORD']],
  [
    'health',
    [
      'PHARM*',
      'MEDIC*',
      'APOLLO',
      'MEDPLUS',
      'NETMEDS',
      '1MG',
      'HOSPITAL*',
      'CLINIC*',
      'DIAGNOS*',
      'PATHOLOG*',
      'LAB',
      'DENTAL',
      'DENTIST',
      'DOCTOR',
      'PRACTO',
      'CULTFIT',
      'CULT FIT',
      'GYM',
      'FITNESS',
      'HEALTH*',
      'AYURVED*',
      'OPTICAL*',
      'CHEMIST*',
    ],
  ],
  [
    'entertainment',
    [
      'NETFLIX',
      'HOTSTAR',
      'DISNEY',
      'PRIME VIDEO',
      'AMAZON PRIME',
      'SPOTIFY',
      'GAANA',
      'WYNK',
      'JIOCINEMA',
      'SONYLIV',
      'ZEE5',
      'YOUTUBE',
      'APPLE MEDIA',
      'GOOGLE PLAY',
      'BOOKMYSHOW',
      'PVR',
      'INOX',
      'CINEPOLIS',
      'CINEMA*',
      'MOVIE*',
      'THEATRE',
      'STEAM',
      'PLAYSTATION',
      'XBOX',
      'DREAM11',
      'GAMES',
      'GAMING',
    ],
  ],
  [
    'education',
    [
      'SCHOOL',
      'COLLEGE',
      'UNIVERSITY',
      'VIDYALAYA',
      'TUITION*',
      'COACHING',
      'CLASSES',
      'BYJU*',
      'UNACADEMY',
      'VEDANTU',
      'PHYSICSWALLAH',
      'UDEMY',
      'COURSERA',
      'EXAM*',
      'ACADEMY',
      'INSTITUTE',
      'EDUCATION*',
      'BOOKS',
      'STATIONERY',
      'STUDENT*',
    ],
  ],
  [
    'personal',
    [
      'SALON',
      'SPA',
      'PARLOUR',
      'PARLOR',
      'BEAUTY',
      'URBAN COMPANY',
      'URBANCLAP',
      'NYKAA',
      'BARBER',
      'GROOMING',
      'COSMETIC*',
      'LAUNDRY',
      'DRY CLEAN*',
    ],
  ],
  [
    'gifts',
    [
      'DONATION',
      'DONATE',
      'CHARITY',
      'TEMPLE!',
      'MANDIR',
      'GURUDWARA',
      'CHURCH',
      'MASJID',
      'DEVASTHAN*',
      'TRUST',
      'FOUNDATION',
      'GIVEINDIA',
      'KETTO',
      'MILAAP',
      'PM CARES',
      'GIFT*',
      'FLOWERS',
      'FERNS N PETALS',
    ],
  ],
  [
    'shopping',
    [
      'AMAZON',
      'AMZN',
      'FLIPKART',
      'MYNTRA',
      'AJIO',
      'MEESHO',
      'TATA CLIQ',
      'TATACLIQ',
      'SNAPDEAL',
      'DECATHLON',
      'IKEA',
      'CROMA',
      'RELIANCE DIGITAL',
      'VIJAY SALES',
      'LIFESTYLE',
      'PANTALOONS',
      'WESTSIDE',
      'MAX FASHION',
      'PETER ENGLAND',
      'RAYMOND',
      'SHOPPERS STOP',
      'TRENDS',
      'ZUDIO',
      'LENSKART',
      'BATA',
      'PUMA',
      'NIKE',
      'ADIDAS',
      'UNIQLO',
      'MALL',
      'STORE*',
      'MART',
      'SHOP*',
      'RETAIL',
      'EMPORIUM',
      'ELECTRONICS',
      'MOBILES',
      'FASHION*',
      'GARMENTS',
      'TEXTILE*',
      'FOOTWEAR',
      'JEWEL*',
      'TANISHQ',
    ],
  ],
  ['other-expense', ['CHARGES', 'CHGS', 'CHG', 'FEE', 'FEES', 'MARKUP*', 'GST', 'DECCHG', 'SURCHARGE', 'PENALTY']],
];

const EARNING: [string, string[]][] = [
  [TRANSFER, ['CASH DEP*', 'CASH DEPOSIT', 'CDM', 'BY CASH', 'CASH CR']],
  ['refunds', ['REFUND*', 'REVERSAL', 'REVERSED', 'REV', 'CRV', 'UPIRET', 'RETURN*', 'CASHBACK', 'CHARGEBACK']],
  ['salary', ['SALARY', 'SAL', 'PAYROLL', 'STIPEND', 'WAGES', 'BONUS']],
  ['interest', ['INTEREST', 'INT PD', 'INT CR', 'INT PAID', 'SB INT', 'FD INT', 'DIVIDEND*']],
  ['gifts-received', ['GIFT*']],
];

/** Money in from a shop or service is almost always a refund. */
const MERCHANT_CATEGORIES = new Set([
  'food',
  'groceries',
  'transport',
  'travel',
  'bills',
  'health',
  'entertainment',
  'personal',
  'shopping',
]);

interface Keyword {
  spaced: string;
  squashed: string | null;
}

const spaced = (text: string) =>
  ` ${text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()} `;
const squashed = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, '');

function compile(rules: [string, string[]][]): [string, Keyword[]][] {
  return rules.map(([category, words]) => [
    category,
    words.map((word) => {
      const bare = word.replace(/[*!]$/, '');
      const joined = squashed(bare);
      return {
        // A prefix keyword drops the trailing space so it matches the start of a longer word
        spaced: word.endsWith('*') ? spaced(bare).trimEnd() : spaced(bare),
        squashed: !word.endsWith('!') && joined.length >= 6 ? joined : null,
      };
    }),
  ]);
}

const SPENDING_RULES = compile(SPENDING);
const EARNING_RULES = compile(EARNING);

function firstMatch(rules: [string, Keyword[]][], narration: string): string | undefined {
  const [text, joined] = [spaced(narration), squashed(narration)];
  return rules.find(([, keywords]) =>
    keywords.some((k) => text.includes(k.spaced) || (k.squashed !== null && joined.includes(k.squashed))),
  )?.[0];
}

/**
 * The most likely type and category for a statement row: what you chose before for the same payee, then the keyword rules,
 * then "Other". ATM withdrawals and cash deposits become transfers with your Cash account.
 */
export function suggestCategory(narration: string, direction: Direction, learned?: Map<string, Suggestion>): Suggestion {
  const type: TransactionType = direction === 'debit' ? 'expense' : 'income';
  const known = learned?.get(describeNarration(narration).toLowerCase());
  if (known?.type === type) return known;

  let category: string;
  if (direction === 'debit') category = firstMatch(SPENDING_RULES, narration) ?? 'other-expense';
  else {
    const spentAt = firstMatch(SPENDING_RULES, narration);
    category = firstMatch(EARNING_RULES, narration) ?? (spentAt && MERCHANT_CATEGORIES.has(spentAt) ? 'refunds' : 'other-income');
  }
  return category === TRANSFER ? { type: 'transfer', category: '' } : { type, category };
}

/** For each description you've used before, the type and category of its most recent transaction. */
export function learnCategories(transactions: Transaction[]): Map<string, Suggestion> {
  const latest = new Map<string, Transaction>();
  for (const t of transactions) {
    const key = t.note.trim().toLowerCase();
    if (t.type === 'transfer' || !key) continue;
    const seen = latest.get(key);
    if (!seen || t.date >= seen.date) latest.set(key, t);
  }
  return new Map([...latest].map(([key, t]) => [key, { type: t.type, category: t.category }]));
}

const ACRONYMS = new Set([
  'ATM',
  'UPI',
  'EMI',
  'NEFT',
  'IMPS',
  'RTGS',
  'ICICI',
  'HDFC',
  'SBI',
  'IDBI',
  'IDFC',
  'PNB',
  'LIC',
  'IRCTC',
  'BSNL',
  'MTNL',
  'PVR',
  'KFC',
  'IGNOU',
  'NSE',
  'BSE',
  'GST',
  'POS',
  'ACH',
  'NACH',
  'ECS',
  'DTH',
  'TV',
  'DC',
  'CC',
  'PAN',
  'KYC',
  'IFSC',
  'BPCL',
  'HPCL',
  'IOCL',
  'ONGC',
  'NTPC',
  'ITC',
  'DLF',
  'MRF',
  'AU',
  'HP',
  'BP',
  'UK',
  'USA',
  'UAE',
  'LLP',
  'NGO',
  'FD',
  'RD',
  'SIP',
  'NPS',
  'PPF',
  'EPF',
  'CBSE',
  'ICSE',
  'IIT',
  'IIM',
  'NIT',
  'AIIMS',
  'MG',
  'GT',
]);
const SMALL_WORDS = new Set(['and', 'for', 'of', 'the', 'to', 'in', 'on', 'by', 'via', 'at', 'from', 'with']);
/** Words banks add to UPI/IMPS/NEFT remarks that say nothing about the payment. */
const FILLER = new Set([
  'UPI',
  'SEND',
  'MONEY',
  'PAY',
  'PAYMENT',
  'PAID',
  'SENT',
  'USING',
  'VIA',
  'FROM',
  'PHONE',
  'COLLECT',
  'TRANSACTION',
  'TRANSACTIO',
  'REQUEST',
  'REQUES',
  'RAZORPAY',
  'PAYTM',
  'CRED',
  'NAVI',
  'GPAY',
  'PHONEPE',
  'BHIM',
  'NA',
  'TRANSFER',
  'IMPS',
  'NEFT',
  'RTGS',
  'P2A',
  'P2M',
  'U',
  'TO',
  'NO',
  'REMARKS',
  'NETBANK',
  'MUM',
  'MUMBAI',
  'DR',
  'CR',
  'BY',
  'TRF',
  'TXN',
  'REF',
  'BIL',
  'ONL',
  'INB',
  'MB',
  'IB',
]);

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => {
      if (ACRONYMS.has(word.toUpperCase()) || /\d/.test(word)) return word.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(word)) return word;
      return word[0].toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function shorten(text: string, max = 60): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : cut.length).trimEnd()}…`;
}

/** Splits text into words, dropping reference numbers, masked card numbers, IFSCs and UPI IDs. */
function cleanTokens(text: string): string[] {
  return text
    .toUpperCase()
    .split(/[\s\-/:*|,]+/)
    .map((token) => token.replace(/^\d{5,}/, ''))
    .filter(
      (token) => token && !/\d{5,}/.test(token) && !/[X*]{3,}/.test(token) && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(token) && !token.includes('@'),
    );
}

const isFiller = (token: string) => FILLER.has(token) || !/[A-Z]/.test(token);

/** The words that name something: no references, no filler, no bare numbers. */
const meaningfulWords = (text: string) =>
  cleanTokens(text)
    .filter((token) => !isFiller(token))
    .join(' ');

/** Stock remarks, often cut short by the bank ("UPI SEND MO"); compared without spaces. */
const FILLER_REMARKS = [
  'UPISENDMONEY',
  'PAYMENTFROMPHONE',
  'SENTUSINGPAYTMUPI',
  'PAIDVIACRED',
  'PAIDVIANAVIUPI',
  'PAIDVIASUPERMONEY',
  'PAYVIARAZORPAY',
  'COLLECTREQUESTFROM',
  'COLLECTTRANSACTION',
  'COLLECTPAY',
  'VERIFIEDPAYTMACCOUNT',
  'REQUESTMONEY',
  'IMPSTRANSACTION',
  'NEFTTRANSFER',
];

/** A remark is kept whole ("Salary for Mar 2026") unless it's filler or just repeats the payee. */
function withRemark(name: string, remark: string): string {
  const tokens = cleanTokens(remark);
  const joined = tokens.join('');
  const filler = !tokens.some((token) => !isFiller(token)) || FILLER_REMARKS.some((phrase) => phrase.startsWith(joined));
  const short = squashed(name).slice(0, 8);
  const repeatsName = short.length >= 4 && joined.startsWith(short);
  return filler || repeatsName ? titleCase(name) : `${titleCase(name)} · ${titleCase(tokens.join(' '))}`;
}

/** A short, readable description for a narration, e.g. "UPI-ZOMATO LTD-ZOMATO.RZP@HDFCBANK-…" → "Zomato Ltd". */
export function describeNarration(narration: string): string {
  const n = narration.trim().replace(/\s+/g, ' ');
  const N = n.toUpperCase();
  const parts = n.split('-').map((part) => part.trim());

  if (/FUEL SURCHG|FUEL SURCHARGE/.test(N)) return 'Fuel surcharge';
  if (/MARKUP/.test(N)) return 'Forex markup charge';
  if (/DECCHG/.test(N)) return 'Card decline charge';
  if (/\bINT\.?\s*PD\b|\bINTEREST\b/.test(N)) return 'Interest';
  if (/^UPIRET\b/.test(N)) return 'UPI return';
  if (/^REV-UPI\b/.test(N)) return 'UPI reversal';
  if (/^EMI\s/.test(N)) return 'Loan EMI';

  const card = /^CC\s+\S*?(\d{4})\s+AUTOPAY/.exec(N);
  if (card) return `Credit card bill ••${card[1]}`;

  if (/^(ACH|NACH|ECS)\b/.test(N)) {
    const company = n
      .replace(/^(ACH|NACH|ECS)\s*(D|DR|DEBIT)?\s*-\s*/i, '')
      .replace(/^TP\s+ACH\s+/i, '')
      .replace(/-\s*\S*\d{4,}\S*$/, '');
    return shorten(`Auto-debit · ${titleCase(meaningfulWords(company) || company)}`);
  }
  if (/^(NWD|ATW|EAW)-/.test(N)) {
    const place = parts.at(-1) ?? '';
    return /^[A-Z][A-Z .]+$/i.test(place) ? shorten(`ATM withdrawal · ${titleCase(place)}`) : 'ATM withdrawal';
  }
  if (/BILLPAY|BILL PAY|\bBBPS\b/.test(N)) return 'Bill payment';

  // HDFC: UPI-<payee>-<UPI ID>-<IFSC>-<ref>-<remark>
  if (/^UPI-/.test(N)) {
    const at = parts.findIndex((part) => part.includes('@'));
    // A UPI ID can contain a hyphen itself ("ASHAVERMA99-2@OKSBI")
    const idStart = at > 2 && /^\w{1,3}@/.test(parts[at]) ? at - 1 : at;
    const name = at > 1 ? parts.slice(1, idStart).join('-') : (parts[1] ?? '');
    if (/^X+\d{4,}$/i.test(name)) return `UPI transfer ••${name.slice(-4)}`;
    return shorten(withRemark(meaningfulWords(name) || name, at > 1 ? parts.slice(at + 3).join(' ') : ''));
  }
  // SBI, ICICI, Axis: …UPI/DR/<ref>/<payee>/<bank>/<UPI ID>/…
  const slash = /(?:^|[-\s])UPI\/(.+)$/i.exec(n);
  if (slash) {
    const payee = slash[1].split('/').find((token) => meaningfulWords(token) && !/^[A-Z]{4}$/.test(token.trim()));
    if (payee) return shorten(titleCase(meaningfulWords(payee)));
  }
  // HDFC: NEFT CR-<IFSC>-<sender>-<you>-<UTR> <remark>; IMPS-<ref>-<name>-<bank>-<account>-<remark>
  if (/^(NEFT|RTGS)\s*(CR|DR)?\s*-/.test(N) || /^IMPS-/.test(N)) {
    const name = parts[2] ?? '';
    const remark = parts.length > 4 ? (parts.at(-1) ?? '') : '';
    if (meaningfulWords(name)) return shorten(withRemark(meaningfulWords(name), remark === name ? '' : remark));
  }
  const pos = /^(CRV POS|ME DC SI|POS)\s+(.*)$/.exec(N);
  if (pos) {
    const merchant = meaningfulWords(
      pos[2]
        .split(' ')
        .filter((token) => !/^\d{1,2}[A-Z]{3}\d{2,4}$/.test(token) && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(token))
        .join(' ')
        .replace(/\s*\bCYBS SI$|\s+SI$/, ''),
    );
    if (merchant) return shorten(titleCase(merchant));
  }

  const words = meaningfulWords(n);
  return shorten(titleCase(words || n));
}
