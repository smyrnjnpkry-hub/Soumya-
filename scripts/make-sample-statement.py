"""Draws public/sample-statement.pdf: a made-up "Demo Bank" statement for trying out statement import.

Every name, account number and transaction in it is fictional. It copies the layout quirks of a real Indian bank
statement (HDFC Bank's) so the importer is exercised end to end: column positions, a header row on the first page only,
narrations stored in 40-character pieces that are cut mid-word, pieces too wide for the column wrapped onto a line that
hangs further left, and a summary block at the end.

Also writes src/lib/statement/sample-statement.expected.json, the rows as they should come back out, for the test.

    pip install reportlab==5.0.1
    python3 scripts/make-sample-statement.py
"""

import json
from datetime import date
from pathlib import Path

from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "public" / "sample-statement.pdf"
EXPECTED = ROOT / "src" / "lib" / "statement" / "sample-statement.expected.json"

PAGE = (638, 842)
FONT, BOLD, SIZE = "Helvetica", "Helvetica-Bold", 7
LINE = 14  # points between lines
TOP, BOTTOM = 590, 80  # where rows may go
PIECE = 40  # the bank stores narrations in pieces of this many characters
NARRATION_WIDTH = 181  # wider pieces are wrapped at a space

# Column x positions (points); amounts are right-aligned on these edges
X_DATE, X_NARRATION, X_HANG, X_REF, X_VALUE = 33.7, 72, 68, 288.6, 362.5
R_WITHDRAWAL, R_DEPOSIT, R_BALANCE = 470.2, 548.2, 626.7

OPENING = 42350.75
FROM, TO = date(2026, 7, 1), date(2026, 9, 30)

# (day, month, narration, withdrawal, deposit)
ROWS = [
    (1, 7, "NEFT CR-DEMO0000101-BRIGHTPATH SOFTWARE PVT LTD-ASHA VERMA-N182026123456 SALARY FOR JUN 2026", 0, 68500.00),
    (1, 7, "UPI-MANOJ SHARMA-MKSHARMA.HOME@OKDEMO-DEMO0001234-618201234501-HOUSE RENT JULY", 18000.00, 0),
    (2, 7, "UPI-ZOMATO LTD-ZOMATO.ORDER@DEMOBANK-DEMO0MERUPI-618201234502-PAY VIA RAZORPAY", 486.00, 0),
    (3, 7, "UPI-BIGBASKET-BIGBASKET.PAY@DEMOBANK-DEMO0MERUPI-618201234503-UPI", 2145.30, 0),
    (4, 7, "POS 512345XXXXXX7788 HP PETROL PUMP PUNE", 1500.00, 0),
    (5, 7, "ACH D- DEMO HOUSING FINANCE LTD-LOAN0042137", 12450.00, 0),
    (6, 7, "UPI-AIRTEL PREPAID-AIRTEL.RECHARGE@DEMOBANK-DEMO0MERUPI-618201234504-MOBILE RECHARGE", 299.00, 0),
    (8, 7, "NWD-512345XXXXXX7788-00123456-PUNE CAMP", 3000.00, 0),
    (9, 7, "UPI-UBER INDIA-UBER.RIDES@DEMOBANK-DEMO0MERUPI-618201234505-UPI", 246.75, 0),
    (10, 7, "UPI-NETFLIX-NETFLIX.SUB@DEMOBANK-DEMO0MERUPI-618201234506-AUTOPAY", 649.00, 0),
    (12, 7, "UPI-APOLLO PHARMACY-APOLLO.PHARMACY@DEMOBANK-DEMO0MERUPI-618201234507-MEDICINES", 812.40, 0),
    (13, 7, "UPI-RAHUL MEHTA-RAHULMEHTA@OKDEMO-DEMO0002345-618201234508-DINNER SPLIT", 0, 650.00),
    (14, 7, "POS 512345XXXXXX7788 612345 14JUL26 19:42:10 PUNE WESTSIDE STORE", 2799.00, 0),
    (15, 7, "UPI-SWIGGY-SWIGGY.ORDER@DEMOBANK-DEMO0MERUPI-618201234509-UPI", 384.00, 0),
    (17, 7, "IB BILLPAY DR-MSEDCL-DEMO123456789", 1184.00, 0),
    (19, 7, "UPI-AMAZON PAY GROCERIES-AMAZONPAYGROCERY@DEMOBANK-DEMO0MERUPI-618201234510-UPI SEND MONEY", 1276.00, 0),
    (20, 7, "CRV POS 512345******7788 WESTSIDE STORE", 0, 899.00),
    (22, 7, "UPI-CULT FIT-CULTFIT.PAY@DEMOBANK-DEMO0MERUPI-618201234511-MEMBERSHIP", 1999.00, 0),
    (24, 7, "UPI-PRIYA NAIR-PRIYANAIR@OKDEMO-DEMO0003456-618201234512-UPI SEND MONEY", 1200.00, 0),
    (26, 7, "UPI-INOX LEISURE-INOX.TICKETS@DEMOBANK-DEMO0MERUPI-618201234513-MOVIE TICKETS", 760.00, 0),
    (28, 7, "UPI-ZEPTO-ZEPTO.ORDERS@DEMOBANK-DEMO0MERUPI-618201234514-UPI", 645.50, 0),
    (30, 7, "FUEL SURCHG 512345******7788 DT 04/07/26", 15.00, 0),
    (1, 8, "NEFT CR-DEMO0000101-BRIGHTPATH SOFTWARE PVT LTD-ASHA VERMA-N182026123457 SALARY FOR JUL 2026", 0, 68500.00),
    (1, 8, "UPI-MANOJ SHARMA-MKSHARMA.HOME@OKDEMO-DEMO0001234-618201234515-HOUSE RENT AUGUST", 18000.00, 0),
    (2, 8, "UPI-SWIGGY-SWIGGY.ORDER@DEMOBANK-DEMO0MERUPI-618201234516-UPI", 512.00, 0),
    (4, 8, "UPI-BIGBASKET-BIGBASKET.PAY@DEMOBANK-DEMO0MERUPI-618201234517-UPI", 1890.60, 0),
    (5, 8, "ACH D- DEMO HOUSING FINANCE LTD-LOAN0042137", 12450.00, 0),
    (6, 8, "UPI-AIRTEL PREPAID-AIRTEL.RECHARGE@DEMOBANK-DEMO0MERUPI-618201234518-MOBILE RECHARGE", 299.00, 0),
    (7, 8, "UPI-MAKEMYTRIP-MAKEMYTRIP.FLIGHTS@DEMOBANK-DEMO0MERUPI-618201234519-PUNE TO KOCHI", 6842.00, 0),
    (9, 8, "POS 512345XXXXXX7788 HP PETROL PUMP PUNE", 1800.00, 0),
    (10, 8, "UPI-NETFLIX-NETFLIX.SUB@DEMOBANK-DEMO0MERUPI-618201234520-AUTOPAY", 649.00, 0),
    (11, 8, "UPI-UBER INDIA-UBER.RIDES@DEMOBANK-DEMO0MERUPI-618201234521-UPI", 318.20, 0),
    (13, 8, "UPI-SUNRISE PUBLIC SCHOOL-SUNRISESCHOOL@DEMOBANK-DEMO0MERUPI-618201234522-TERM FEE", 9500.00, 0),
    (14, 8, "NWD-512345XXXXXX7788-00123457-KOCHI MG ROAD", 2000.00, 0),
    (16, 8, "UPI-ZOMATO LTD-ZOMATO.ORDER@DEMOBANK-DEMO0MERUPI-618201234523-PAY VIA RAZORPAY", 742.00, 0),
    (18, 8, "IB BILLPAY DR-MSEDCL-DEMO123456790", 1320.00, 0),
    (19, 8, "UPI-AMAZON INDIA-AMAZON.SHOP@DEMOBANK-DEMO0MERUPI-618201234524-UPI", 1599.00, 0),
    (21, 8, "UPI-DEMOPAY CASHBACK-REWARDS@DEMOPAY-DEMO0PAYUPI-618201234525-CASHBACK", 0, 120.00),
    (23, 8, "UPI-SMILE DENTAL CLINIC-SMILEDENTAL@OKDEMO-DEMO0004567-618201234526-CHECKUP", 1500.00, 0),
    (25, 8, "UPI-PRIYA NAIR-PRIYANAIR@OKDEMO-DEMO0003456-618201234527-PAYMENT FROM PHONE", 0, 2400.00),
    (27, 8, "UPI-AKSHAYA FOUNDATION-AKSHAYA.DONATE@DEMOBANK-DEMO0MERUPI-618201234528-DONATION", 1000.00, 0),
    (29, 8, "UPI-ZEPTO-ZEPTO.ORDERS@DEMOBANK-DEMO0MERUPI-618201234529-UPI", 923.40, 0),
    (1, 9, "NEFT CR-DEMO0000101-BRIGHTPATH SOFTWARE PVT LTD-ASHA VERMA-N182026123458 SALARY FOR AUG 2026", 0, 68500.00),
    (1, 9, "UPI-MANOJ SHARMA-MKSHARMA.HOME@OKDEMO-DEMO0001234-618201234530-HOUSE RENT SEPTEMBER", 18000.00, 0),
    (3, 9, "UPI-BIGBASKET-BIGBASKET.PAY@DEMOBANK-DEMO0MERUPI-618201234531-UPI", 2310.80, 0),
    (5, 9, "ACH D- DEMO HOUSING FINANCE LTD-LOAN0042137", 12450.00, 0),
    (6, 9, "UPI-AIRTEL PREPAID-AIRTEL.RECHARGE@DEMOBANK-DEMO0MERUPI-618201234532-MOBILE RECHARGE", 299.00, 0),
    (7, 9, "ACH D- DEMO LIFE INSURANCE-POL778899", 2450.00, 0),
    (8, 9, "UPI-SWIGGY-SWIGGY.ORDER@DEMOBANK-DEMO0MERUPI-618201234533-UPI", 455.00, 0),
    (10, 9, "UPI-NETFLIX-NETFLIX.SUB@DEMOBANK-DEMO0MERUPI-618201234534-AUTOPAY", 649.00, 0),
    (12, 9, "NWD-512345XXXXXX7788-00123458-PUNE CAMP", 2500.00, 0),
    (13, 9, "UPI-MYNTRA DESIGNS-MYNTRA.PAY@DEMOBANK-DEMO0MERUPI-618201234535-UPI", 2199.00, 0),
    (15, 9, "POS 512345XXXXXX7788 HP PETROL PUMP PUNE", 1650.00, 0),
    (16, 9, "UPI-LOOKS SALON-LOOKSSALON@OKDEMO-DEMO0005678-618201234536-HAIRCUT", 650.00, 0),
    (18, 9, "IB BILLPAY DR-MSEDCL-DEMO123456791", 1240.00, 0),
    (20, 9, "UPI-UBER INDIA-UBER.RIDES@DEMOBANK-DEMO0MERUPI-618201234537-UPI", 289.00, 0),
    (22, 9, "UPI-ZOMATO LTD-ZOMATO.ORDER@DEMOBANK-DEMO0MERUPI-618201234538-PAY VIA RAZORPAY", 618.00, 0),
    (24, 9, "UPI-RAHUL MEHTA-RAHULMEHTA@OKDEMO-DEMO0002345-618201234539-UPI SEND MONEY", 800.00, 0),
    (26, 9, "UPI-ZEPTO-ZEPTO.ORDERS@DEMOBANK-DEMO0MERUPI-618201234540-UPI", 712.30, 0),
    (28, 9, "CASH DEPOSIT BY SELF-PUNE CAMP BRANCH", 0, 5000.00),
    (30, 9, "000123456789:Int.Pd:01-07-2026 to 30-09-2026", 0, 412.00),
]


def money(value):
    return f"{value:,.2f}"


def pieces(narration):
    """The bank's fixed-width storage: 40-character pieces, cut anywhere."""
    return [narration[i : i + PIECE] for i in range(0, len(narration), PIECE)]


def narration_lines(narration):
    """(x, text) for each printed line, the way the bank lays a narration out."""
    lines = []
    for piece in pieces(narration):
        x = X_NARRATION
        if piece.startswith(" "):  # a piece starting with a space is drawn indented by it
            piece, x = piece[1:], X_NARRATION + stringWidth(" ", FONT, SIZE)
        piece = piece.rstrip()
        while stringWidth(piece, FONT, SIZE) > NARRATION_WIDTH and " " in piece:
            cut = max(i for i, c in enumerate(piece) if c == " " and stringWidth(piece[:i], FONT, SIZE) <= NARRATION_WIDTH)
            lines.append((x, piece[:cut]))
            piece, x = piece[cut + 1 :], X_HANG
        lines.append((x, piece))
    return lines


def right(canvas, text, edge, y):
    canvas.drawString(edge - stringWidth(text, FONT, SIZE), y, text)


def page_top(canvas, number):
    canvas.setFont(BOLD, 14)
    canvas.drawString(34, 800, "DEMO BANK")
    canvas.setFont(BOLD, 8)
    canvas.setFillColorRGB(0.75, 0.1, 0.1)
    canvas.drawString(34, 786, "SAMPLE STATEMENT - FICTIONAL DATA FOR TRYING OUT FINTRACK - NOT A REAL BANK DOCUMENT")
    canvas.setFillColorRGB(0, 0, 0)
    canvas.setFont(FONT, SIZE + 1)
    for i, text in enumerate(["MS ASHA VERMA", "12 LAKE VIEW ROAD", "PUNE 411001"]):
        canvas.drawString(34, 755 - i * 12, text)
    for i, text in enumerate(["Account Branch : DEMO BRANCH", "Account No : 000123456789", "Currency : INR", f"Page No. : {number}"]):
        canvas.drawString(400, 755 - i * 12, text)
    canvas.drawString(34, 620.2, f"From : {FROM:%d/%m/%Y}")
    canvas.drawString(154, 620.2, f"To : {TO:%d/%m/%Y}")
    canvas.drawString(340.2, 620.2, "Statement of account")
    canvas.setFont(FONT, 6)
    canvas.drawString(28.3, 50.1, "DEMO BANK - sample statement made for FinTrack. All names, numbers and transactions are fictional.")
    canvas.setFont(FONT, SIZE)


def header(canvas, y):
    canvas.setFont(BOLD, SIZE)
    for text, x in [("Date", 39.9), ("Narration", 144.2), ("Chq./Ref.No.", 283.5), ("Value Dt", 361.5)]:
        canvas.drawString(x, y, text)
    for text, edge in [("Withdrawal Amt.", 465.7), ("Deposit Amt.", 536.0), ("Closing Balance", 619.2)]:
        canvas.drawString(edge - stringWidth(text, BOLD, SIZE), y, text)
    canvas.setFont(FONT, SIZE)


def main():
    canvas = Canvas(str(PDF), pagesize=PAGE, invariant=1)
    canvas.setTitle("Demo Bank sample statement")
    canvas.setAuthor("FinTrack")
    page = 1
    page_top(canvas, page)
    header(canvas, TOP + 12)
    y = TOP - LINE
    balance = OPENING
    expected = []
    debits = credits = 0.0
    for day, month, narration, withdrawal, deposit in ROWS:
        when = date(2026, month, day)
        balance = round(balance - withdrawal + deposit, 2)
        debits, credits = debits + withdrawal, credits + deposit
        lines = narration_lines(narration)
        if y - (len(lines) - 1) * LINE < BOTTOM:  # rows never split across pages in this sample
            canvas.showPage()
            page += 1
            page_top(canvas, page)
            y = TOP
        ref = f"0000{618201234500 + len(expected):012d}"
        canvas.drawString(X_DATE, y, f"{when:%d/%m/%y}")
        canvas.drawString(X_REF, y, ref)
        canvas.drawString(X_VALUE, y, f"{when:%d/%m/%y}")
        if withdrawal:
            right(canvas, money(withdrawal), R_WITHDRAWAL, y)
        if deposit:
            right(canvas, money(deposit), R_DEPOSIT, y)
        right(canvas, money(balance), R_BALANCE, y)
        for x, text in lines:
            canvas.drawString(x, y, text)
            y -= LINE
        expected.append(
            {
                "date": when.isoformat(),
                "narration": narration,
                "direction": "debit" if withdrawal else "credit",
                "amount": withdrawal or deposit,
                "balance": balance,
            }
        )

    if y - 80 < BOTTOM:
        canvas.showPage()
        page_top(canvas, page + 1)
        y = TOP
    y -= 30
    canvas.drawString(68, y, "STATEMENT SUMMARY :-")
    labels = [("Opening Balance", 132.3), ("Dr Count", 289.8), ("Cr Count", 360.7), ("Debits", 424.9), ("Credits", 501.1), ("Closing Bal", 572.1)]
    values = [money(OPENING), str(sum(1 for e in expected if e["direction"] == "debit")),
              str(sum(1 for e in expected if e["direction"] == "credit")), money(debits), money(credits), money(balance)]
    canvas.setFont(BOLD, SIZE)
    for text, x in labels:
        canvas.drawString(x, y - 10, text)
    canvas.setFont(FONT, SIZE)
    for (label, x), value in zip(labels, values):
        middle = x + stringWidth(label, BOLD, SIZE) / 2
        canvas.drawString(middle - stringWidth(value, FONT, SIZE) / 2, y - 21, value)
    canvas.drawString(83, y - 50, "Generated On: 01-Oct-2026 09:15")
    canvas.save()

    EXPECTED.write_text(
        json.dumps(
            {
                "bank": "Demo Bank",
                "accountLast4": "6789",
                "period": {"from": FROM.isoformat(), "to": TO.isoformat()},
                "openingBalance": OPENING,
                "closingBalance": balance,
                "rows": expected,
            },
            indent=1,
        )
        + "\n"
    )
    print(f"{PDF.relative_to(ROOT)}: {page} pages, {len(expected)} rows, closing {money(balance)}")


if __name__ == "__main__":
    main()
