// functions/oai.js -> GET/POST /oai  (OAI-PMH 2.0, metama'lumot formati: oai_dc)
// BASE, OpenAIRE, CORE va boshqa ilmiy yig'uvchilar repozitoriydagi nashrlarni shu protokol orqali oladi.
// Ma'lumot build.js yaratadigan /data/oai.json dan o'qiladi (har bir yangi nashrdan keyin avtomat yangilanadi).
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
const NS = 'xmlns="http://www.openarchives.org/OAI/2.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd"';
const DC_NS = 'xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/ http://www.openarchives.org/OAI/2.0/oai_dc.xsd"';
const VERBS = {
  Identify: [],
  ListMetadataFormats: ['identifier'],
  ListSets: ['resumptionToken'],
  ListIdentifiers: ['metadataPrefix', 'from', 'until', 'set', 'resumptionToken'],
  ListRecords: ['metadataPrefix', 'from', 'until', 'set', 'resumptionToken'],
  GetRecord: ['identifier', 'metadataPrefix'],
};
const REQUIRED = { ListIdentifiers: ['metadataPrefix'], ListRecords: ['metadataPrefix'], GetRecord: ['identifier', 'metadataPrefix'] };
const PAGE = 100;

const x = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const DAY = /^\d{4}-\d{2}-\d{2}$/;

let CACHE = null, CACHE_AT = 0;
async function load(env, request) {
  if (CACHE && Date.now() - CACHE_AT < 60000) return CACHE;
  const res = await env.ASSETS.fetch(new Request(new URL('/data/oai.json', request.url)));
  if (!res.ok) throw new Error('oai.json topilmadi');
  CACHE = await res.json(); CACHE_AT = Date.now();
  return CACHE;
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  let params = url.searchParams;
  if (request.method === 'POST') {
    const body = await request.text();
    params = new URLSearchParams(body);
  } else if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  let data;
  try { data = await load(env, request); } catch (e) { return new Response('OAI ma\'lumoti mavjud emas', { status: 503 }); }

  const host = new URL(data.base || url.origin).hostname;
  const oaiId = (id) => `oai:${host}:${id}`;
  const base = `${url.origin}/oai`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const verb = params.get('verb') || '';
  const args = {};
  for (const [k, v] of params) if (k !== 'verb') args[k] = v;

  const reqAttrs = (ok) => (ok ? [['verb', verb], ...Object.entries(args)].map(([k, v]) => ` ${k}="${x(v)}"`).join('') : '');
  const wrap = (inner, ok = true) => new Response(
    `${XML_HEAD}<OAI-PMH ${NS}>\n<responseDate>${now}</responseDate>\n<request${reqAttrs(ok)}>${x(base)}</request>\n${inner}\n</OAI-PMH>\n`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex' } },
  );
  const err = (code, text, ok = false) => wrap(`<error code="${code}">${x(text)}</error>`, ok);

  if (!VERBS[verb]) return err('badVerb', "Noma'lum yoki ko'rsatilmagan verb");
  const dup = [...params.keys()].filter((k, i, a) => a.indexOf(k) !== i);
  const bad = Object.keys(args).filter((k) => !VERBS[verb].includes(k));
  if (dup.length || bad.length) return err('badArgument', `Noto'g'ri argument: ${[...dup, ...bad].join(', ')}`);
  if (args.resumptionToken && Object.keys(args).length > 1) return err('badArgument', 'resumptionToken boshqa argumentlar bilan birga berilmaydi');
  if (!args.resumptionToken) for (const r of REQUIRED[verb] || []) if (!args[r]) return err('badArgument', `${r} majburiy`);

  const records = data.records || [];
  const header = (r) => `<header><identifier>${x(oaiId(r.id))}</identifier><datestamp>${x(r.stamp)}</datestamp>${(r.sets || []).map((s) => `<setSpec>${x(s)}</setSpec>`).join('')}</header>`;
  const dc = (r) => {
    const parts = Object.entries(r.dc || {}).flatMap(([k, vs]) => [].concat(vs || []).filter(Boolean).map((v) => `<dc:${k}>${x(v)}</dc:${k}>`));
    return `<metadata><oai_dc:dc ${DC_NS}>${parts.join('')}</oai_dc:dc></metadata>`;
  };
  const byId = (ident) => {
    const pre = `oai:${host}:`;
    return ident && ident.startsWith(pre) ? records.find((r) => r.id === ident.slice(pre.length)) : null;
  };

  if (verb === 'Identify') {
    return wrap(`<Identify><repositoryName>${x(data.name)}</repositoryName><baseURL>${x(base)}</baseURL><protocolVersion>2.0</protocolVersion>
${data.email ? `<adminEmail>${x(data.email)}</adminEmail>` : '<adminEmail>admin@' + x(host) + '</adminEmail>'}<earliestDatestamp>${x(data.earliest)}</earliestDatestamp><deletedRecord>no</deletedRecord><granularity>YYYY-MM-DD</granularity>
<description><oai-identifier xmlns="http://www.openarchives.org/OAI/2.0/oai-identifier" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai-identifier http://www.openarchives.org/OAI/2.0/oai-identifier.xsd"><scheme>oai</scheme><repositoryIdentifier>${x(host)}</repositoryIdentifier><delimiter>:</delimiter><sampleIdentifier>${x(oaiId('maqola-id'))}</sampleIdentifier></oai-identifier></description></Identify>`);
  }
  if (verb === 'ListMetadataFormats') {
    if (args.identifier && !byId(args.identifier)) return err('idDoesNotExist', 'Bunday identifikator yo\'q', true);
    return wrap('<ListMetadataFormats><metadataFormat><metadataPrefix>oai_dc</metadataPrefix><schema>http://www.openarchives.org/OAI/2.0/oai_dc.xsd</schema><metadataNamespace>http://www.openarchives.org/OAI/2.0/oai_dc/</metadataNamespace></metadataFormat></ListMetadataFormats>');
  }
  if (verb === 'ListSets') {
    if (args.resumptionToken) return err('badResumptionToken', 'Token noto\'g\'ri', true);
    return wrap(`<ListSets>${(data.sets || []).map((s) => `<set><setSpec>${x(s.spec)}</setSpec><setName>${x(s.name)}</setName></set>`).join('')}</ListSets>`);
  }
  if (verb === 'GetRecord') {
    if (args.metadataPrefix !== 'oai_dc') return err('cannotDisseminateFormat', 'Faqat oai_dc qo\'llab-quvvatlanadi', true);
    const r = byId(args.identifier);
    if (!r) return err('idDoesNotExist', 'Bunday identifikator yo\'q', true);
    return wrap(`<GetRecord><record>${header(r)}${dc(r)}</record></GetRecord>`);
  }

  // ListIdentifiers / ListRecords: sahifalash resumptionToken orqali (token = "offset|prefix|from|until|set")
  let q = { ...args }, offset = 0;
  if (args.resumptionToken) {
    const t = args.resumptionToken.split('|');
    if (t.length !== 5 || !/^\d+$/.test(t[0])) return err('badResumptionToken', 'Token noto\'g\'ri', true);
    offset = Number(t[0]); q = { metadataPrefix: t[1], from: t[2], until: t[3], set: t[4] };
  }
  if (q.metadataPrefix !== 'oai_dc') return err('cannotDisseminateFormat', 'Faqat oai_dc qo\'llab-quvvatlanadi', true);
  for (const k of ['from', 'until']) if (q[k] && !DAY.test(q[k])) return err('badArgument', `${k} YYYY-MM-DD shaklida bo'lishi kerak`, true);
  if (q.from && q.until && q.from > q.until) return err('badArgument', 'from until dan katta', true);
  if (q.set && !(data.sets || []).some((s) => s.spec === q.set)) return err('noRecordsMatch', 'Bunday to\'plam yo\'q', true);
  const list = records.filter((r) => (!q.from || r.stamp >= q.from) && (!q.until || r.stamp <= q.until) && (!q.set || (r.sets || []).includes(q.set)))
    .sort((a, b) => a.stamp.localeCompare(b.stamp) || a.id.localeCompare(b.id));
  if (!list.length) return err('noRecordsMatch', 'Mos yozuv topilmadi', true);
  if (offset >= list.length) return err('badResumptionToken', 'Token muddati o\'tgan', true);
  const pageItems = list.slice(offset, offset + PAGE);
  const next = offset + PAGE < list.length ? [offset + PAGE, q.metadataPrefix, q.from || '', q.until || '', q.set || ''].join('|') : '';
  const token = (next || offset) ? `<resumptionToken completeListSize="${list.length}" cursor="${offset}">${x(next)}</resumptionToken>` : '';
  const tag = verb === 'ListRecords' ? 'ListRecords' : 'ListIdentifiers';
  const body = pageItems.map((r) => (verb === 'ListRecords' ? `<record>${header(r)}${dc(r)}</record>` : header(r))).join('\n');
  return wrap(`<${tag}>${body}${token}</${tag}>`);
}
