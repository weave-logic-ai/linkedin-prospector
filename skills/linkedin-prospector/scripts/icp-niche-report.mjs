/**
 * icp-niche-report.mjs -- Reverse ICP & Niche Discovery Report
 *
 * Analyzes your vector store to discover your ideal customer profile and
 * strongest niches based on semantic proximity of your actual contacts.
 *
 * Usage:
 *   node icp-niche-report.mjs [--output path]
 *
 * Default: --output ../data/icp-niche-report.html
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { parseArgs, DATA_DIR } from './lib.mjs';
import {
  isRvfAvailable, openStore, getContact, queryStore,
  storeLength, closeStore,
} from './rvf-store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GRAPH_PATH = resolve(DATA_DIR, 'graph.json');
const DEFAULT_OUTPUT = resolve(DATA_DIR, 'icp-niche-report.html');

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function loadGraph() {
  return JSON.parse(readFileSync(GRAPH_PATH, 'utf-8'));
}

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------

const STOP = new Set(
  'the and for with that this from have been will more than also based over into about their your what when where which while each most some only just very them these those other like make made many much then here well work help best lead self team high area part full time year years new first last next using across does used able sure open sure'.split(' ')
);

function words(text) {
  if (!text) return [];
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));
}

function topKw(obj, n) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
}

// ---------------------------------------------------------------------------
// Compute report data
// ---------------------------------------------------------------------------

async function computeData(graph) {
  const contacts = Object.entries(graph.contacts)
    .map(([url, c]) => ({ url, ...c }))
    .filter(c => c.scores);

  const tiers = { gold: [], silver: [], bronze: [], watch: [] };
  contacts.forEach(c => {
    const t = c.scores?.tier || 'watch';
    if (tiers[t]) tiers[t].push(c);
  });

  // ── Keyword analysis (gold-score weighted) ──
  const roleKw = {}, headlineKw = {}, aboutKw = {};
  contacts.forEach(c => {
    const w = c.scores?.goldScore || 0;
    words(c.currentRole || '').forEach(k => { roleKw[k] = (roleKw[k] || 0) + w; });
    words(c.headline || '').forEach(k => { headlineKw[k] = (headlineKw[k] || 0) + w; });
    words((c.about || '').substring(0, 300)).forEach(k => { aboutKw[k] = (aboutKw[k] || 0) + w; });
  });

  // ── Cluster analysis ──
  const clusters = Object.entries(graph.clusters || {}).map(([id, cl]) => {
    const clContacts = cl.contacts.map(u => graph.contacts[u]).filter(Boolean);
    const goldCount = clContacts.filter(c => c.scores?.tier === 'gold').length;
    const silverCount = clContacts.filter(c => c.scores?.tier === 'silver').length;
    const bronzeCount = clContacts.filter(c => c.scores?.tier === 'bronze').length;
    const avgGold = clContacts.reduce((s, c) => s + (c.scores?.goldScore || 0), 0) / (clContacts.length || 1);
    const goldDensity = clContacts.length > 0 ? (goldCount + silverCount * 0.5) / clContacts.length : 0;
    return {
      id, size: cl.contacts.length,
      keywords: cl.keywords || [],
      goldCount, silverCount, bronzeCount,
      watchCount: clContacts.length - goldCount - silverCount - bronzeCount,
      avgGold, goldDensity,
    };
  }).sort((a, b) => b.goldDensity - a.goldDensity);

  // ── Company analysis ──
  const companyMap = {};
  contacts.forEach(c => {
    let co = (c.currentCompany || '').trim();
    // Clean up LinkedIn company format artifacts
    if (!co || co.startsWith('Full-time') || co === 'Self-employed' || co === 'Career Break') return;
    co = co.replace(/ · Full-time$/, '').replace(/ · Part-time$/, '').replace(/ · Contract$/, '').replace(/ · Freelance$/, '').trim();
    if (!co) return;
    if (!companyMap[co]) companyMap[co] = { count: 0, goldSum: 0, tiers: { gold: 0, silver: 0, bronze: 0, watch: 0 } };
    companyMap[co].count++;
    companyMap[co].goldSum += c.scores?.goldScore || 0;
    companyMap[co].tiers[c.scores?.tier || 'watch']++;
  });
  const topCompanies = Object.entries(companyMap)
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].goldSum - a[1].goldSum)
    .slice(0, 20)
    .map(([name, v]) => ({ name, ...v, avgGold: v.goldSum / v.count }));

  // ── Persona distribution ──
  const personaCounts = {};
  contacts.forEach(c => {
    const p = c.personaType || 'unknown';
    personaCounts[p] = (personaCounts[p] || 0) + 1;
  });
  const behCounts = {};
  contacts.forEach(c => {
    const p = c.behavioralPersona || 'unknown';
    behCounts[p] = (behCounts[p] || 0) + 1;
  });

  // ── Vector analysis ──
  let vectorData = null;
  if (isRvfAvailable()) {
    const storeSize = await storeLength();
    if (storeSize > 0) {
      vectorData = { storeSize };

      // Gold centroid
      const goldVectors = [];
      for (const gc of tiers.gold) {
        const nUrl = gc.url.replace(/\/$/, '').split('?')[0];
        const stored = await getContact(nUrl);
        if (stored) goldVectors.push(stored.vector);
      }

      if (goldVectors.length > 0) {
        const dim = goldVectors[0].length;
        const centroid = new Array(dim).fill(0);
        for (const v of goldVectors) for (let i = 0; i < dim; i++) centroid[i] += v[i];
        for (let i = 0; i < dim; i++) centroid[i] /= goldVectors.length;
        const norm = Math.sqrt(centroid.reduce((s, x) => s + x * x, 0));
        for (let i = 0; i < dim; i++) centroid[i] /= norm;

        // Contacts nearest to gold centroid
        const centroidResults = await queryStore(centroid, 40);
        vectorData.centroidContacts = (centroidResults || []).map(r => ({
          name: r.metadata?.name || 'Unknown',
          url: r.id,
          tier: r.metadata?.tier || 'watch',
          similarity: Math.max(0, 1 - (r.score || 0)),
          goldScore: r.metadata?.goldScore || 0,
          role: r.metadata?.currentRole || r.metadata?.headline || '',
          company: r.metadata?.currentCompany || '',
          persona: r.metadata?.persona || '',
        }));

        // Promotion candidates (non-gold nearest to gold centroid)
        vectorData.promotionCandidates = vectorData.centroidContacts
          .filter(c => c.tier !== 'gold')
          .slice(0, 20);

        // Network centroid (broader sample)
        const allVectors = [];
        for (const c of contacts.slice(0, 300)) {
          const nUrl = c.url.replace(/\/$/, '').split('?')[0];
          const stored = await getContact(nUrl);
          if (stored) allVectors.push(stored.vector);
        }

        if (allVectors.length > 0) {
          const netCentroid = new Array(dim).fill(0);
          for (const v of allVectors) for (let i = 0; i < dim; i++) netCentroid[i] += v[i];
          for (let i = 0; i < dim; i++) netCentroid[i] /= allVectors.length;
          const nNorm = Math.sqrt(netCentroid.reduce((s, x) => s + x * x, 0));
          for (let i = 0; i < dim; i++) netCentroid[i] /= nNorm;

          // Gold-Network alignment
          let dot = 0;
          for (let i = 0; i < dim; i++) dot += centroid[i] * netCentroid[i];
          vectorData.goldNetAlignment = dot;
          vectorData.networkSampleSize = allVectors.length;

          // Network centroid contacts
          const netResults = await queryStore(netCentroid, 15);
          vectorData.networkCenter = (netResults || []).map(r => ({
            name: r.metadata?.name || 'Unknown',
            url: r.id,
            tier: r.metadata?.tier || 'watch',
            similarity: Math.max(0, 1 - (r.score || 0)),
            role: r.metadata?.currentRole || r.metadata?.headline || '',
          }));
        }

        // Niche centroids — compute centroid per cluster and find representative contacts
        vectorData.nicheCentroids = [];
        for (const cl of clusters.slice(0, 8)) {
          const clVectors = [];
          const clUrls = (graph.clusters[cl.id]?.contacts || []);
          for (const u of clUrls.slice(0, 50)) {
            const nUrl = u.replace(/\/$/, '').split('?')[0];
            const stored = await getContact(nUrl);
            if (stored) clVectors.push(stored.vector);
          }
          if (clVectors.length < 3) continue;

          const clCentroid = new Array(dim).fill(0);
          for (const v of clVectors) for (let i = 0; i < dim; i++) clCentroid[i] += v[i];
          for (let i = 0; i < dim; i++) clCentroid[i] /= clVectors.length;
          const clNorm = Math.sqrt(clCentroid.reduce((s, x) => s + x * x, 0));
          for (let i = 0; i < dim; i++) clCentroid[i] /= clNorm;

          // How close is this niche centroid to the gold centroid?
          let clDot = 0;
          for (let i = 0; i < dim; i++) clDot += centroid[i] * clCentroid[i];

          // Find representative contacts for this niche
          const clResults = await queryStore(clCentroid, 5);
          const reps = (clResults || []).map(r => ({
            name: r.metadata?.name || 'Unknown',
            tier: r.metadata?.tier || 'watch',
            similarity: Math.max(0, 1 - (r.score || 0)),
            role: r.metadata?.currentRole || r.metadata?.headline || '',
          }));

          vectorData.nicheCentroids.push({
            id: cl.id,
            keywords: cl.keywords,
            size: cl.size,
            goldCount: cl.goldCount,
            silverCount: cl.silverCount,
            goldDensity: cl.goldDensity,
            icpAlignment: clDot,
            representatives: reps,
          });
        }
        vectorData.nicheCentroids.sort((a, b) => b.icpAlignment - a.icpAlignment);
      }

      await closeStore();
    }
  }

  return {
    meta: {
      generated: new Date().toISOString(),
      totalContacts: contacts.length,
    },
    tierCounts: {
      gold: tiers.gold.length,
      silver: tiers.silver.length,
      bronze: tiers.bronze.length,
      watch: tiers.watch.length,
    },
    goldContacts: tiers.gold
      .sort((a, b) => (b.scores?.goldScore || 0) - (a.scores?.goldScore || 0))
      .map(c => ({
        name: c.enrichedName || c.name,
        url: c.url,
        goldScore: c.scores?.goldScore || 0,
        role: c.currentRole || c.headline || '',
        company: c.currentCompany || '',
        persona: c.personaType || '',
      })),
    roleKeywords: topKw(roleKw, 25).map(([word, weight]) => ({ word, weight })),
    headlineKeywords: topKw(headlineKw, 25).map(([word, weight]) => ({ word, weight })),
    aboutKeywords: topKw(aboutKw, 20).map(([word, weight]) => ({ word, weight })),
    clusters,
    topCompanies,
    personaCounts,
    behCounts,
    vectorData,
  };
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

function generateHTML(data) {
  const dataJSON = JSON.stringify(data);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ICP & Niche Discovery Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"><\/script>
<style>
:root {
  --bg: #0f1117; --surface: #1a1d27; --surface2: #232633; --border: #2d3148;
  --text: #e1e4ed; --text-dim: #8b8fa3;
  --gold: #FFD700; --silver: #C0C0C0; --bronze: #CD7F32; --watch: #666;
  --accent: #6366f1; --accent2: #818cf8; --green: #22c55e; --blue: #3b82f6;
  --orange: #f59e0b; --red: #ef4444; --pink: #ec4899;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
a { color: var(--accent2); text-decoration: none; }
a:hover { text-decoration: underline; }

.sidebar { position: fixed; top: 0; left: 0; width: 220px; height: 100vh; background: var(--surface); border-right: 1px solid var(--border); padding: 20px 0; overflow-y: auto; z-index: 100; }
.sidebar h2 { font-size: 14px; color: var(--accent2); padding: 0 16px; margin-bottom: 16px; letter-spacing: 0.5px; }
.sidebar a { display: block; padding: 8px 16px; font-size: 13px; color: var(--text-dim); transition: all 0.2s; }
.sidebar a:hover, .sidebar a.active { color: var(--text); background: var(--surface2); text-decoration: none; }
.main { margin-left: 220px; padding: 32px 40px; max-width: 1200px; }

.header { margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
.header h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
.header .subtitle { color: var(--text-dim); font-size: 14px; }

.stat-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin: 20px 0; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; text-align: center; }
.stat-card .value { font-size: 28px; font-weight: 700; }
.stat-card .label { font-size: 12px; color: var(--text-dim); margin-top: 4px; }
.stat-card.gold .value { color: var(--gold); }
.stat-card.silver .value { color: var(--silver); }
.stat-card.accent .value { color: var(--accent2); }
.stat-card.green .value { color: var(--green); }

.section { margin-bottom: 48px; }
.section h2 { font-size: 22px; font-weight: 600; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--accent); display: inline-block; }
.section h3 { font-size: 16px; font-weight: 600; margin: 24px 0 10px; color: var(--accent2); }

.chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 24px; }
.chart-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px; }
.chart-card h3 { font-size: 14px; color: var(--text-dim); margin: 0 0 12px; }
.chart-card canvas { max-height: 280px; }

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; padding: 10px 12px; background: var(--surface2); color: var(--text-dim); font-weight: 600; white-space: nowrap; border-bottom: 2px solid var(--border); }
.data-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.data-table tr:hover { background: var(--surface2); }
.tier-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
.tier-badge.gold { background: rgba(255,215,0,0.2); color: var(--gold); }
.tier-badge.silver { background: rgba(192,192,192,0.2); color: var(--silver); }
.tier-badge.bronze { background: rgba(205,127,50,0.2); color: var(--bronze); }
.tier-badge.watch { background: rgba(102,102,102,0.2); color: var(--watch); }

.info-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 12px; }
.info-card .card-name { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
.info-card .card-role { color: var(--text-dim); font-size: 13px; margin-bottom: 8px; }

.kw-bar-container { display: flex; flex-direction: column; gap: 6px; }
.kw-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.kw-label { width: 140px; text-align: right; color: var(--text-dim); flex-shrink: 0; }
.kw-bar { height: 20px; border-radius: 3px; transition: width 0.5s ease; }
.kw-value { width: 50px; font-size: 12px; color: var(--text-dim); }

.niche-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin-bottom: 16px; }
.niche-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.niche-title { font-size: 18px; font-weight: 700; text-transform: capitalize; }
.niche-meta { display: flex; gap: 12px; font-size: 12px; color: var(--text-dim); flex-wrap: wrap; }
.niche-meta span { background: var(--surface2); padding: 2px 8px; border-radius: 4px; }
.alignment-bar { height: 8px; background: var(--surface2); border-radius: 4px; overflow: hidden; margin: 8px 0; }
.alignment-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }

.promo-card { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); }
.promo-card:last-child { border-bottom: none; }
.promo-info { flex: 1; min-width: 0; }
.promo-name { font-weight: 600; font-size: 14px; }
.promo-role { font-size: 12px; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.promo-scores { display: flex; gap: 12px; align-items: center; flex-shrink: 0; }
.promo-sim { font-size: 18px; font-weight: 700; color: var(--accent2); }
.promo-gold { font-size: 12px; color: var(--text-dim); }

.exec-summary { background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(129,140,248,0.05)); border: 1px solid rgba(99,102,241,0.3); border-radius: 12px; padding: 24px; margin-bottom: 32px; }
.exec-summary h3 { color: var(--accent2); margin: 0 0 12px; font-size: 18px; }
.exec-summary p { color: var(--text); line-height: 1.8; }
.exec-summary .highlight { color: var(--gold); font-weight: 600; }
.exec-summary .metric { color: var(--accent2); font-weight: 600; }

@media print {
  .sidebar { display: none; }
  .main { margin-left: 0; }
  body { background: #fff; color: #000; }
}
</style>
</head>
<body>

<nav class="sidebar">
  <h2>ICP & NICHE</h2>
  <a href="#header">Overview</a>
  <a href="#exec-summary">Executive Summary</a>
  <a href="#gold-profile">Gold ICP Profile</a>
  <a href="#niche-map">Niche Map</a>
  <a href="#keywords">Keyword DNA</a>
  <a href="#centroid">ICP Centroid</a>
  <a href="#promotion">Promotion Candidates</a>
  <a href="#companies">Company Clusters</a>
  <a href="#personas">Network Personas</a>
</nav>

<div class="main">
<script>const DATA = ${dataJSON};<\/script>

<div class="header" id="header">
  <h1>ICP & Niche Discovery Report</h1>
  <p class="subtitle">Reverse-engineered from <span id="total-contacts"></span> scored contacts &middot; Generated <span id="gen-date"></span></p>
  <div class="stat-cards" id="header-cards"></div>
</div>

<div id="exec-summary"></div>

<div class="section" id="gold-profile">
  <h2>Your Gold ICP Profile</h2>
  <p style="color:var(--text-dim);margin-bottom:16px;">These are your highest-scoring contacts — the pattern they share defines your ideal customer profile.</p>
  <div id="gold-list"></div>
</div>

<div class="section" id="niche-map">
  <h2>Niche Map</h2>
  <p style="color:var(--text-dim);margin-bottom:16px;">Your network clusters ranked by ICP alignment — higher alignment means the niche is closer to your gold contacts in semantic space.</p>
  <div id="niche-list"></div>
  <div class="chart-grid" style="margin-top:24px;">
    <div class="chart-card"><h3>Niche Size & Gold Density</h3><canvas id="chart-niches"></canvas></div>
    <div class="chart-card"><h3>Niche ICP Alignment</h3><canvas id="chart-alignment"></canvas></div>
  </div>
</div>

<div class="section" id="keywords">
  <h2>Keyword DNA</h2>
  <p style="color:var(--text-dim);margin-bottom:16px;">Most frequent keywords across your contacts, weighted by gold score — this is the language of your ICP.</p>
  <div class="chart-grid">
    <div class="chart-card"><h3>Role Keywords</h3><div id="kw-roles" class="kw-bar-container"></div></div>
    <div class="chart-card"><h3>Headline Keywords</h3><div id="kw-headlines" class="kw-bar-container"></div></div>
  </div>
  <div class="chart-grid" style="margin-top:24px;">
    <div class="chart-card"><h3>About Section Keywords</h3><div id="kw-about" class="kw-bar-container"></div></div>
    <div class="chart-card"><h3>Tier Breakdown</h3><canvas id="chart-tiers"></canvas></div>
  </div>
</div>

<div class="section" id="centroid">
  <h2>ICP Centroid Analysis</h2>
  <p style="color:var(--text-dim);margin-bottom:16px;">The semantic center of your gold contacts — anyone near this point in vector space matches your ideal customer profile.</p>
  <div id="centroid-contacts"></div>
</div>

<div class="section" id="promotion">
  <h2>Promotion Candidates</h2>
  <p style="color:var(--text-dim);margin-bottom:16px;">Non-gold contacts who semantically match your gold ICP — consider upgrading engagement with these contacts.</p>
  <div id="promo-list"></div>
</div>

<div class="section" id="companies">
  <h2>Company Clusters</h2>
  <p style="color:var(--text-dim);margin-bottom:16px;">Companies with the highest concentration of ICP-aligned contacts — potential beachheads for account-based outreach.</p>
  <div style="overflow-x:auto;">
    <table class="data-table" id="company-table">
      <thead><tr>
        <th>Company</th><th>Contacts</th><th>Gold</th><th>Silver</th><th>Avg Gold Score</th>
      </tr></thead>
      <tbody id="company-tbody"></tbody>
    </table>
  </div>
</div>

<div class="section" id="personas">
  <h2>Network Persona Composition</h2>
  <p style="color:var(--text-dim);margin-bottom:16px;">How your contacts break down by strategic persona and behavioral type.</p>
  <div class="chart-grid">
    <div class="chart-card"><h3>Strategic Personas</h3><canvas id="chart-personas"></canvas></div>
    <div class="chart-card"><h3>Behavioral Personas</h3><canvas id="chart-beh"></canvas></div>
  </div>
</div>

</div>

<script>
(function() {
  function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }

  // Header
  document.getElementById('gen-date').textContent = new Date(DATA.meta.generated).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('total-contacts').textContent = DATA.meta.totalContacts;

  var tc = DATA.tierCounts;
  var alignment = DATA.vectorData ? (DATA.vectorData.goldNetAlignment * 100).toFixed(0) : '?';
  var cards = document.getElementById('header-cards');
  [
    { v: tc.gold, l: 'Gold Contacts', cls: 'gold' },
    { v: tc.silver, l: 'Silver Contacts', cls: 'silver' },
    { v: DATA.clusters.length, l: 'Niches Identified', cls: 'accent' },
    { v: DATA.vectorData ? DATA.vectorData.storeSize : '—', l: 'Vectorized', cls: 'accent' },
    { v: alignment + '%', l: 'ICP Alignment', cls: 'green' },
  ].forEach(function(s) {
    var d = document.createElement('div');
    d.className = 'stat-card ' + s.cls;
    d.innerHTML = '<div class="value">' + s.v + '</div><div class="label">' + s.l + '</div>';
    cards.appendChild(d);
  });

  // Executive Summary
  var topRoles = DATA.roleKeywords.slice(0, 5).map(function(k) { return k.word; });
  var topHeadlines = DATA.headlineKeywords.slice(0, 5).map(function(k) { return k.word; });
  var topNiche = DATA.clusters[0] || { id: 'unknown', size: 0 };
  var bestNiche = DATA.vectorData && DATA.vectorData.nicheCentroids && DATA.vectorData.nicheCentroids[0];
  var alignPct = DATA.vectorData ? (DATA.vectorData.goldNetAlignment * 100).toFixed(0) : '?';

  var execDiv = document.getElementById('exec-summary');
  execDiv.innerHTML = '<div class="exec-summary">' +
    '<h3>Your Ideal Customer Profile</h3>' +
    '<p>Based on semantic analysis of <span class="metric">' + DATA.meta.totalContacts + '</span> contacts across <span class="metric">' + DATA.clusters.length + '</span> niches, your network gravitates toward ' +
    '<span class="highlight">' + topHeadlines.join(', ') + '</span> professionals. ' +
    'Your gold contacts cluster around roles in <span class="highlight">' + topRoles.slice(0, 4).join(', ') + '</span>.</p>' +
    '<p style="margin-top:12px;">Your strongest niche is <span class="highlight">' + (bestNiche ? bestNiche.id : topNiche.id) + '</span>' +
    (bestNiche ? ' with <span class="metric">' + (bestNiche.icpAlignment * 100).toFixed(0) + '%</span> ICP alignment' : '') +
    '. Your overall network-to-ICP alignment is <span class="metric">' + alignPct + '%</span>' +
    (parseFloat(alignPct) > 80 ? ' — highly focused.' : parseFloat(alignPct) > 60 ? ' — moderately focused with room for expansion.' : ' — broadly diverse.') +
    '</p>' +
    (DATA.vectorData && DATA.vectorData.promotionCandidates && DATA.vectorData.promotionCandidates.length > 0 ?
      '<p style="margin-top:12px;">We found <span class="metric">' + DATA.vectorData.promotionCandidates.length + '</span> non-gold contacts who semantically match your gold ICP — these are your strongest promotion candidates.</p>' : '') +
    '</div>';

  // Gold contacts
  var goldList = document.getElementById('gold-list');
  DATA.goldContacts.forEach(function(gc) {
    goldList.innerHTML += '<div class="info-card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div>' +
          '<div class="card-name">' + esc(gc.name) + ' <span class="tier-badge gold">GOLD</span></div>' +
          '<div class="card-role">' + esc(gc.role) + (gc.company ? ' @ ' + esc(gc.company) : '') + '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div style="font-size:22px;font-weight:700;color:var(--gold);">' + gc.goldScore.toFixed(3) + '</div>' +
          '<div style="font-size:11px;color:var(--text-dim);">' + esc(gc.persona) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  });

  // Niche map
  var nicheList = document.getElementById('niche-list');
  var niches = DATA.vectorData && DATA.vectorData.nicheCentroids ? DATA.vectorData.nicheCentroids : DATA.clusters;
  var useVector = DATA.vectorData && DATA.vectorData.nicheCentroids && DATA.vectorData.nicheCentroids.length > 0;

  niches.forEach(function(n) {
    var alignVal = useVector ? n.icpAlignment : n.goldDensity;
    var alignPct = (alignVal * 100).toFixed(1);
    var barColor = alignVal > 0.85 ? 'var(--gold)' : alignVal > 0.7 ? 'var(--accent2)' : alignVal > 0.5 ? 'var(--blue)' : 'var(--watch)';

    var repsHtml = '';
    if (n.representatives) {
      repsHtml = '<div style="margin-top:12px;font-size:12px;color:var(--text-dim);">Representative contacts:</div>';
      n.representatives.forEach(function(r) {
        repsHtml += '<div style="font-size:12px;padding:2px 0;">' +
          '<span class="tier-badge ' + r.tier + '" style="font-size:10px;">' + r.tier + '</span> ' +
          esc(r.name) + ' — ' + esc(r.role) + '</div>';
      });
    }

    nicheList.innerHTML += '<div class="niche-card">' +
      '<div class="niche-header">' +
        '<div class="niche-title">' + esc(n.id) + '</div>' +
        '<div style="font-size:22px;font-weight:700;color:' + barColor + ';">' + alignPct + '%</div>' +
      '</div>' +
      '<div class="niche-meta">' +
        '<span>' + n.size + ' contacts</span>' +
        '<span>' + (n.goldCount || 0) + ' gold</span>' +
        '<span>' + (n.silverCount || 0) + ' silver</span>' +
        '<span>' + (n.keywords || []).join(', ') + '</span>' +
      '</div>' +
      '<div class="alignment-bar"><div class="alignment-fill" style="width:' + alignPct + '%;background:' + barColor + ';"></div></div>' +
      repsHtml +
    '</div>';
  });

  // Niche charts
  Chart.defaults.color = '#8b8fa3';
  var nicheLabels = DATA.clusters.map(function(c) { return c.id; });
  var nicheSizes = DATA.clusters.map(function(c) { return c.size; });
  var nicheGold = DATA.clusters.map(function(c) { return c.goldCount + c.silverCount; });

  new Chart(document.getElementById('chart-niches'), {
    type: 'bar',
    data: {
      labels: nicheLabels,
      datasets: [
        { label: 'Gold+Silver', data: nicheGold, backgroundColor: 'rgba(255,215,0,0.6)', borderWidth: 0 },
        { label: 'Total', data: nicheSizes, backgroundColor: 'rgba(99,102,241,0.2)', borderWidth: 0 },
      ]
    },
    options: { indexAxis: 'y', plugins: { legend: { position: 'top' } }, scales: { x: { beginAtZero: true, grid: { color: '#2d3148' } }, y: { grid: { display: false } } } }
  });

  if (useVector) {
    var alignLabels = DATA.vectorData.nicheCentroids.map(function(n) { return n.id; });
    var alignVals = DATA.vectorData.nicheCentroids.map(function(n) { return (n.icpAlignment * 100).toFixed(1); });
    var alignColors = DATA.vectorData.nicheCentroids.map(function(n) {
      return n.icpAlignment > 0.85 ? 'rgba(255,215,0,0.7)' : n.icpAlignment > 0.7 ? 'rgba(99,102,241,0.7)' : 'rgba(102,102,102,0.5)';
    });
    new Chart(document.getElementById('chart-alignment'), {
      type: 'bar',
      data: {
        labels: alignLabels,
        datasets: [{ label: 'ICP Alignment %', data: alignVals, backgroundColor: alignColors, borderWidth: 0 }]
      },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, max: 100, grid: { color: '#2d3148' } }, y: { grid: { display: false } } } }
    });
  }

  // Keyword bars
  function renderKwBars(containerId, keywords, color) {
    var el = document.getElementById(containerId);
    var maxWeight = keywords.length > 0 ? keywords[0].weight : 1;
    keywords.slice(0, 15).forEach(function(kw) {
      var pct = (kw.weight / maxWeight * 100).toFixed(0);
      el.innerHTML += '<div class="kw-row">' +
        '<div class="kw-label">' + esc(kw.word) + '</div>' +
        '<div class="kw-bar" style="width:' + pct + '%;background:' + color + ';"></div>' +
        '<div class="kw-value">' + kw.weight.toFixed(1) + '</div>' +
      '</div>';
    });
  }

  renderKwBars('kw-roles', DATA.roleKeywords, 'rgba(99,102,241,0.7)');
  renderKwBars('kw-headlines', DATA.headlineKeywords, 'rgba(34,197,94,0.7)');
  renderKwBars('kw-about', DATA.aboutKeywords, 'rgba(245,158,11,0.7)');

  // Tier donut
  new Chart(document.getElementById('chart-tiers'), {
    type: 'doughnut',
    data: {
      labels: ['Gold', 'Silver', 'Bronze', 'Watch'],
      datasets: [{ data: [tc.gold, tc.silver, tc.bronze, tc.watch], backgroundColor: ['#FFD700','#C0C0C0','#CD7F32','#555'], borderWidth: 0 }]
    },
    options: { plugins: { legend: { position: 'bottom' } } }
  });

  // Centroid contacts
  if (DATA.vectorData && DATA.vectorData.centroidContacts) {
    var centDiv = document.getElementById('centroid-contacts');
    centDiv.innerHTML = '<div style="overflow-x:auto;"><table class="data-table"><thead><tr>' +
      '<th>#</th><th>Name</th><th>ICP Similarity</th><th>Tier</th><th>Gold Score</th><th>Role</th><th>Company</th>' +
      '</tr></thead><tbody>' +
      DATA.vectorData.centroidContacts.slice(0, 25).map(function(c, i) {
        var simPct = (c.similarity * 100).toFixed(1);
        return '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td style="font-weight:600;">' + esc(c.name) + '</td>' +
          '<td style="color:var(--accent2);font-weight:600;">' + simPct + '%</td>' +
          '<td><span class="tier-badge ' + c.tier + '">' + c.tier + '</span></td>' +
          '<td>' + c.goldScore.toFixed(3) + '</td>' +
          '<td title="' + esc(c.role) + '">' + esc(c.role) + '</td>' +
          '<td title="' + esc(c.company) + '">' + esc(c.company) + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  // Promotion candidates
  if (DATA.vectorData && DATA.vectorData.promotionCandidates) {
    var promoList = document.getElementById('promo-list');
    DATA.vectorData.promotionCandidates.forEach(function(c) {
      var simPct = (c.similarity * 100).toFixed(1);
      promoList.innerHTML += '<div class="promo-card">' +
        '<div class="promo-info">' +
          '<div class="promo-name">' + esc(c.name) + ' <span class="tier-badge ' + c.tier + '" style="font-size:10px;">' + c.tier + '</span></div>' +
          '<div class="promo-role">' + esc(c.role) + (c.company ? ' @ ' + esc(c.company) : '') + '</div>' +
        '</div>' +
        '<div class="promo-scores">' +
          '<div><div class="promo-sim">' + simPct + '%</div><div style="font-size:10px;color:var(--text-dim);text-align:center;">ICP match</div></div>' +
          '<div style="margin-left:12px;text-align:center;"><div class="promo-gold">' + c.goldScore.toFixed(3) + '</div><div style="font-size:10px;color:var(--text-dim);">gold score</div></div>' +
        '</div>' +
      '</div>';
    });
  }

  // Company table
  var compTbody = document.getElementById('company-tbody');
  DATA.topCompanies.forEach(function(c) {
    compTbody.innerHTML += '<tr>' +
      '<td style="font-weight:600;">' + esc(c.name) + '</td>' +
      '<td>' + c.count + '</td>' +
      '<td style="color:var(--gold);">' + c.tiers.gold + '</td>' +
      '<td style="color:var(--silver);">' + c.tiers.silver + '</td>' +
      '<td>' + c.avgGold.toFixed(3) + '</td>' +
      '</tr>';
  });

  // Persona charts
  var pLabels = Object.keys(DATA.personaCounts);
  var pValues = Object.values(DATA.personaCounts);
  var pColors = ['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#ec4899'];
  new Chart(document.getElementById('chart-personas'), {
    type: 'doughnut',
    data: { labels: pLabels, datasets: [{ data: pValues, backgroundColor: pColors.slice(0, pLabels.length), borderWidth: 0 }] },
    options: { plugins: { legend: { position: 'bottom' } } }
  });

  var bLabels = Object.keys(DATA.behCounts);
  var bValues = Object.values(DATA.behCounts);
  new Chart(document.getElementById('chart-beh'), {
    type: 'doughnut',
    data: { labels: bLabels, datasets: [{ data: bValues, backgroundColor: pColors.slice(0, bLabels.length), borderWidth: 0 }] },
    options: { plugins: { legend: { position: 'bottom' } } }
  });

  // Sidebar tracking
  var sidebarLinks = document.querySelectorAll('.sidebar a');
  var sections = Array.from(document.querySelectorAll('.section, .header'));
  window.addEventListener('scroll', function() {
    var current = '';
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= 100) current = sections[i].id;
    }
    sidebarLinks.forEach(function(a) { a.classList.toggle('active', a.getAttribute('href') === '#' + current); });
  });
})();
<\/script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const args = parseArgs(process.argv);
  const outputPath = args.output
    ? resolve(process.cwd(), args.output)
    : DEFAULT_OUTPUT;

  console.log('Loading graph.json...');
  const graph = loadGraph();

  console.log('Computing ICP & Niche data...');
  const data = await computeData(graph);

  console.log('  Clusters:', data.clusters.length);
  console.log('  Gold contacts:', data.tierCounts.gold);
  if (data.vectorData) {
    console.log('  Vector store:', data.vectorData.storeSize, 'contacts');
    console.log('  ICP alignment:', (data.vectorData.goldNetAlignment * 100).toFixed(1) + '%');
    console.log('  Promotion candidates:', data.vectorData.promotionCandidates?.length || 0);
    console.log('  Niche centroids:', data.vectorData.nicheCentroids?.length || 0);
  }

  console.log('Generating HTML...');
  const html = generateHTML(data);

  writeFileSync(outputPath, html, 'utf-8');
  console.log(`Report written to ${outputPath}`);
  console.log(`Open in browser: file://${outputPath}`);
})();
