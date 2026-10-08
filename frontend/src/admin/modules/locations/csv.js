/** Minimal CSV parser (handles quoted fields, commas and newlines inside quotes). Returns rows of strings. */
export const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
};

export const IMPORT_COLUMNS = ['country', 'countryCode', 'state', 'district', 'subdistrict', 'place', 'placeType', 'lat', 'lng', 'pin'];

/** Turn CSV text (with a header row) into import rows for the API. */
export const csvToImportRows = (text) => {
  const [header, ...body] = parseCsv(text);
  if (!header) return { rows: [], problems: ['The file is empty'] };
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const missing = ['country', 'countryCode'].filter((c) => !(c in idx));
  if (missing.length) return { rows: [], problems: [`Missing column(s): ${missing.join(', ')}`] };

  const problems = [];
  const rows = body.map((cells, n) => {
    const get = (k) => (k in idx ? (cells[idx[k]] ?? '').trim() : '');
    const num = (k) => {
      const v = get(k);
      if (v === '') return null;
      const x = Number(v);
      if (Number.isNaN(x)) problems.push(`Row ${n + 2}: ${k} is not a number`);
      return Number.isNaN(x) ? null : x;
    };
    return {
      country: get('country'),
      countryCode: get('countryCode').toUpperCase(),
      state: get('state'),
      district: get('district'),
      subdistrict: get('subdistrict'),
      place: get('place'),
      placeType: get('placeType') || undefined,
      lat: num('lat'),
      lng: num('lng'),
      pin: get('pin'),
    };
  });
  return { rows, problems };
};
