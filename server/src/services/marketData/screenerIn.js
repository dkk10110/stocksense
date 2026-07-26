const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
};

/** Parses the "top ratios" sidebar (ROE, ROCE, Debt to equity, etc.) into a { name: number } map. */
function parseTopRatios($) {
  const ratios = {};
  $('#top-ratios li.flex.flex-space-between').each((_, el) => {
    const name = $(el).find('.name').text().trim().replace(/\s+/g, ' ');
    const numberText = $(el).find('.number').first().text().trim();
    if (name && numberText) ratios[name] = Number(numberText.replace(/,/g, ''));
  });
  return ratios;
}

/** Parses the Quarterly Results table into a chronological list of { label, sales, netProfit }. */
function parseQuarters($) {
  const quartersHeading = $('h2').filter((_, el) => $(el).text().trim() === 'Quarterly Results').first();
  const table = quartersHeading.closest('.card, section').find('[data-result-table] table').first();
  const labels = [];
  table.find('thead th[data-date-key]').each((_, el) => labels.push($(el).text().trim().replace(/\s+/g, ' ')));

  const rowFor = (metricName) => {
    let values = [];
    table.find('tbody tr').each((_, row) => {
      const rowLabel = $(row).find('td.text').text().trim();
      if (rowLabel.toLowerCase().startsWith(metricName.toLowerCase())) {
        values = $(row).find('td').slice(1).map((_, td) => {
          const t = $(td).text().trim().replace(/,/g, '');
          return t === '' ? null : Number(t);
        }).get();
      }
    });
    return values;
  };

  const sales = rowFor('Sales');
  const netProfit = rowFor('Net Profit');

  return labels.map((label, i) => ({ label, sales: sales[i] ?? null, netProfit: netProfit[i] ?? null }));
}

async function fetchFundamentals(symbol) {
  const urlsToTry = [
    `https://www.screener.in/company/${symbol}/consolidated/`,
    `https://www.screener.in/company/${symbol}/`,
  ];

  let html = null;
  for (const url of urlsToTry) {
    try {
      const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
      html = res.data;
      break;
    } catch {
      // try next URL variant
    }
  }
  if (!html) throw new Error(`Screener.in has no page for symbol "${symbol}"`);

  const $ = cheerio.load(html);
  const ratios = parseTopRatios($);
  const quarters = parseQuarters($);

  return {
    symbol,
    roe: ratios['ROE'] ?? null,
    roce: ratios['ROCE'] ?? null,
    debtToEquity: ratios['Debt to equity'] ?? null,
    quarters, // oldest → newest
  };
}

module.exports = { fetchFundamentals };
