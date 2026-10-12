// Printable invoice page for GET /finance/invoices/<id>.html.
//
// One self-contained HTML document: no scripts, no external files, the
// BUILT lockup drawn inline, styles in one <style> block (INVOICE_CSS).
// Prints on A4 or Letter (the page size follows the printer setting).
//
// The dashboard opens it in a new tab as a blob, which inherits the
// dashboard's Content-Security-Policy. That policy allows this exact style
// block by its SHA-256 hash (admin/index.html, style-src). If you change
// INVOICE_CSS, update the hash there too. The hash covers exactly the text
// between <style> and </style>: 'sha256-' + base64(sha256(INVOICE_CSS)).

export type InvoiceLine = { description: string; qty: number; unit_cents: number; amount_cents?: number };
export type InvoiceDetail = {
  invoice: {
    id: string;
    number: string;
    status: 'draft' | 'sent' | 'paid' | 'void';
    issued_on: string;
    due_on: string | null;
    paid_on: string | null;
    lines: InvoiceLine[];
    total_cents: number;
    currency?: string;
    notes: string;
    overdue?: boolean;
  };
  customer: { name?: string; email?: string; phone?: string } | null;
};
export type InvoiceSettings = {
  /** Seller block, one line per line (legal name, address, tax number). */
  from: string;
  /** Payment instructions or a thank-you line at the foot of the page. */
  footer: string;
};

export const INVOICE_CSS = `
@page{size:auto;margin:16mm}
*{box-sizing:border-box;margin:0}
html{background:#E9E9E9;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#080808;padding:32px 16px 64px}
.bar{max-width:210mm;margin:0 auto 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;color:#3A3A3A;font-size:14px}
.bar button{font:600 15px/1 Sora,Inter,ui-sans-serif,system-ui,sans-serif;min-height:44px;padding:0 22px;border:0;border-radius:999px;background:#080808;color:#FFFFFF;cursor:pointer}
.bar button:focus-visible{outline:2px solid #080808;outline-offset:3px}
.sheet{max-width:210mm;margin:0 auto;background:#FFFFFF;padding:18mm 16mm;border-radius:4px}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:28px;border-bottom:2px solid #080808}
.logo{width:150px;height:auto;display:block}
.from{margin-top:14px;font-size:13px;color:#3A3A3A;white-space:pre-line}
.title{text-align:right}
.title h1{font:600 34px/1 Sora,Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:-.02em}
.title p{margin-top:8px;font-size:15px;font-variant-numeric:tabular-nums}
.chip{display:inline-block;margin-top:10px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border:1.5px solid #080808}
.chip--paid{background:#080808;color:#A3FF3D;border-color:#080808}
.chip--void{color:#B42318;border-color:#B42318}
.chip--overdue{color:#8A5A00;border-color:#8A5A00}
.meta{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:24px;padding:24px 0 28px}
.meta h2{font:600 12px/1.4 Inter,ui-sans-serif,system-ui,sans-serif;color:#5C5C5C;letter-spacing:.02em;margin-bottom:6px}
.meta p{font-size:15px;overflow-wrap:anywhere}
.meta .sub{color:#3A3A3A;font-size:13px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{font:600 12px/1.4 Inter,ui-sans-serif,system-ui,sans-serif;color:#5C5C5C;text-align:left;padding:10px 8px;border-bottom:1px solid #080808}
td{padding:12px 8px;border-bottom:1px solid #D4D4D4;vertical-align:top}
td.d{overflow-wrap:anywhere}
.n{text-align:right;white-space:nowrap}
.totals{display:flex;justify-content:flex-end;padding-top:20px}
.totals dl{min-width:260px;display:grid;grid-template-columns:1fr auto;row-gap:8px}
.totals dt{color:#3A3A3A}
.totals dd{text-align:right;font-variant-numeric:tabular-nums;padding-left:24px}
.totals .grand{font:600 24px/1.2 Sora,Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:-.01em;padding-top:10px;border-top:2px solid #080808}
.notes{margin-top:32px;padding-top:16px;border-top:1px solid #D4D4D4;font-size:14px;white-space:pre-line;color:#3A3A3A}
.notes h2{font:600 12px/1.4 Inter,ui-sans-serif,system-ui,sans-serif;color:#5C5C5C;margin-bottom:6px}
.foot{margin-top:40px;font-size:13px;color:#3A3A3A;white-space:pre-line}
.foot b{font-family:Sora,Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:.3em;font-weight:400;color:#080808}
.empty{padding:20px 8px;color:#5C5C5C}
@media (max-width:640px){body{padding:16px 8px 48px}.sheet{padding:24px 18px}.top{flex-direction:column}.title{text-align:left}.meta{grid-template-columns:1fr 1fr}.meta>div:first-child{grid-column:1/-1}.logo{width:120px}th.u,td.u{display:none}}
@media print{html{background:#FFFFFF}body{padding:0}.bar{display:none}.sheet{max-width:none;padding:0;border-radius:0}tr{break-inside:avoid}}
`;

const LOCKUP = `<svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 482.4 100" width="482.4" height="100" role="img" aria-label="BUILT"><path fill="#A3FF3D" d="M15.2 0H100.35A27.15 27.15 0 0 1 127.5 27.15A27.15 27.15 0 0 1 115.97 49.36A28 28 0 0 1 127.5 72A28 28 0 0 1 99.5 100H0L11.76 75.03H89.02A6.89 6.89 0 0 0 89.02 61.26H18.25L29.95 36.42H89.08A6.82 6.82 0 0 0 89.08 22.78H36.37Z"/><path fill="#080808" d="M145.2 7.98H179.7V57.1A12.4 12.4 0 0 0 192.1 69.5H206.2A12.4 12.4 0 0 0 218.6 57.1V7.98H253.1V57.3A36 36 0 0 1 217.1 93.3H181.2A36 36 0 0 1 145.2 57.3ZM263 7.98H297.5V93.3H263ZM307.8 7.98H342.3V69.5H394.8V93.3H324.5A16.7 16.7 0 0 1 307.8 76.6ZM381.2 7.98H482.4V31.78H447.4V93.3H412.9V31.78H381.2Z"/></svg>`;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (cents: number) => usd.format((Number(cents) || 0) / 100);

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const day = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? dayFmt.format(new Date(`${d}T12:00:00Z`)) : '');

export function invoiceHtml(d: InvoiceDetail, settings: InvoiceSettings): string {
  const inv = d.invoice;
  const c = d.customer ?? {};
  const lines = Array.isArray(inv.lines) ? inv.lines : [];
  const status = inv.status;
  const chip = status === 'paid'
    ? `<span class="chip chip--paid">Paid${inv.paid_on ? ` ${esc(day(inv.paid_on))}` : ''}</span>`
    : status === 'void'
      ? '<span class="chip chip--void">Void</span>'
      : status === 'draft'
        ? '<span class="chip">Draft</span>'
        : inv.overdue ? '<span class="chip chip--overdue">Overdue</span>' : '';
  const rows = lines.length
    ? lines.map((l) => {
      const amount = l.amount_cents ?? l.qty * l.unit_cents;
      return `<tr><td class="d">${esc(l.description)}</td><td class="n">${esc(l.qty)}</td><td class="n u">${esc(money(l.unit_cents))}</td><td class="n">${esc(money(amount))}</td></tr>`;
    }).join('')
    : '<tr><td class="empty" colspan="4">No lines yet.</td></tr>';
  const contact = [c.email, c.phone].filter(Boolean).map((x) => `<p class="sub">${esc(x)}</p>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(inv.number)} | BUILT</title>
<style>${INVOICE_CSS}</style>
</head>
<body>
<div class="bar"><span>Print it or save it as a PDF from your browser's print window.</span><button type="button" id="print" hidden>Print or save as PDF</button></div>
<main class="sheet">
  <header class="top">
    <div>${LOCKUP}${settings.from ? `<p class="from">${esc(settings.from)}</p>` : ''}</div>
    <div class="title"><h1>Invoice</h1><p>${esc(inv.number)}</p>${chip}</div>
  </header>
  <section class="meta">
    <div><h2>Billed to</h2><p>${esc(c.name || c.email || 'Customer')}</p>${contact}</div>
    <div><h2>Issued</h2><p>${esc(day(inv.issued_on))}</p></div>
    <div><h2>${status === 'paid' ? 'Paid' : 'Due'}</h2><p>${esc(status === 'paid' ? day(inv.paid_on) : (day(inv.due_on) || 'On receipt'))}</p></div>
  </section>
  <table>
    <thead><tr><th scope="col">Description</th><th scope="col" class="n">Qty</th><th scope="col" class="n u">Unit price</th><th scope="col" class="n">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals"><dl>
    <dt>Subtotal</dt><dd>${esc(money(inv.total_cents))}</dd>
    <dt class="grand">Total (${esc(inv.currency || 'USD')})</dt><dd class="grand">${esc(money(inv.total_cents))}</dd>
  </dl></div>
  ${inv.notes ? `<section class="notes"><h2>Notes</h2>${esc(inv.notes)}</section>` : ''}
  <footer class="foot">${settings.footer ? `${esc(settings.footer)}\n\n` : ''}<b>BUILD YOUR BEST.</b></footer>
</main>
</body>
</html>
`;
}
