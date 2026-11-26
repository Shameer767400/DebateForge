import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUILD_DIR = path.resolve(__dirname, '../build');
const BASE_URL = 'https://www.debateforge.tech';

const ROUTES = [
  {
    routePath: '/gd-topics',
    title: 'Campus Placement Group Discussion Topics & Talking Points (2026) | DebateForge',
    description:
      'Prepare for TCS, Infosys, Accenture, Wipro, and MBA Group Discussions with DebateForge. Review For/Against points and practice live with AI peers in English and Telugu.',
    noscriptHtml: `
      <main style="max-width:780px;margin:40px auto;font-family:sans-serif;padding:0 16px;">
        <h1>Campus Placement Group Discussion Topics &amp; Talking Points (2026)</h1>
        <p>Prepare for TCS, Infosys, Accenture, Wipro, Cognizant, and MBA Group Discussions with structured For &amp; Against talking points and live 4-seat AI + classmate GD practice in English and Telugu.</p>
        <ul>
          <li>Work From Home vs Return to Office: What is better for young careers?</li>
          <li>Should Generative AI tools be allowed during campus placement coding tests?</li>
          <li>AI Copilots vs Junior Software Developers: Will entry-level tech hiring shrink?</li>
          <li>Moonlighting in IT: Legitimate entrepreneurial freedom or breach of employer trust?</li>
          <li>70-Hour Work Week vs Work-Life Balance: What drives sustainable GDP growth?</li>
          <li>Startups: Hyper-growth with heavy cash burn vs sustainable unit economics?</li>
          <li>Electric Vehicles vs Hybrids &amp; Biofuels: Realistic transition path for India?</li>
          <li>Should technical &amp; placement training be offered in native languages like Telugu alongside English?</li>
        </ul>
        <p><a href="/">Home</a> · <a href="/pricing">Pricing</a> · <a href="/about">About</a> · <a href="/register">Start Free Practice</a></p>
      </main>`,
  },
  {
    routePath: '/pricing',
    title: 'Pricing | DebateForge',
    description:
      'Simple, transparent pricing for DebateForge. Start free, try the ₹49 24-Hour Pass, or upgrade to Pro for unlimited debates via UPI and cards.',
    noscriptHtml: `
      <main style="max-width:780px;margin:40px auto;font-family:sans-serif;padding:0 16px;">
        <h1>DebateForge Pricing — Free, ₹49 24-Hour Pass, Pro &amp; Institution Plans</h1>
        <p>Start free with 5 AI debates/month, grab an instant ₹49 24-Hour Sprint Pass via UPI/Cards for upcoming placement GDs, or unlock unlimited coaching with Pro (₹999/month or ₹7,999/year).</p>
        <p><a href="/">Home</a> · <a href="/gd-topics">Campus GD Topics</a> · <a href="/about">About</a> · <a href="/register">Create Free Account</a></p>
      </main>`,
  },
  {
    routePath: '/about',
    title: 'About DebateForge | DebateForge',
    description:
      'Learn about DebateForge, our mission to democratize debate skills through AI, and the founder behind the platform.',
    noscriptHtml: `
      <main style="max-width:780px;margin:40px auto;font-family:sans-serif;padding:0 16px;">
        <h1>About DebateForge</h1>
        <p>DebateForge makes AI debate coaching, logical fallacy detection, and bilingual Campus Placement Group Discussion practice accessible to students across India and beyond.</p>
        <p><a href="/">Home</a> · <a href="/gd-topics">Campus GD Topics</a> · <a href="/pricing">Pricing</a> · <a href="/feedback">Community Feedback</a></p>
      </main>`,
  },
  {
    routePath: '/feedback',
    title: 'Community Feedback | DebateForge',
    description:
      'Share your DebateForge experience, suggest features, and read reviews from fellow debaters.',
    noscriptHtml: `
      <main style="max-width:780px;margin:40px auto;font-family:sans-serif;padding:0 16px;">
        <h1>DebateForge Community Feedback &amp; Reviews</h1>
        <p>Read reviews from students and debaters practicing with DebateForge, and suggest new debate topics or features.</p>
        <p><a href="/">Home</a> · <a href="/gd-topics">Campus GD Topics</a> · <a href="/pricing">Pricing</a></p>
      </main>`,
  },
  {
    routePath: '/privacy',
    title: 'Privacy Policy | DebateForge',
    description: 'DebateForge privacy policy — how we collect, use, and protect your data.',
    noscriptHtml: `
      <main style="max-width:780px;margin:40px auto;font-family:sans-serif;padding:0 16px;">
        <h1>DebateForge Privacy Policy</h1>
        <p>Learn how DebateForge collects, uses, and safeguards your account and debate session data.</p>
        <p><a href="/">Home</a> · <a href="/terms">Terms of Service</a></p>
      </main>`,
  },
  {
    routePath: '/terms',
    title: 'Terms of Service | DebateForge',
    description: 'DebateForge terms of service — rules and guidelines for using our platform.',
    noscriptHtml: `
      <main style="max-width:780px;margin:40px auto;font-family:sans-serif;padding:0 16px;">
        <h1>DebateForge Terms of Service</h1>
        <p>Read the terms, eligibility, and usage guidelines for DebateForge.</p>
        <p><a href="/">Home</a> · <a href="/privacy">Privacy Policy</a></p>
      </main>`,
  },
];

function escapeHtmlAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildRouteHtml(baseHtml, routeConfig) {
  const canonicalUrl = `${BASE_URL}${routeConfig.routePath}`;
  const safeTitleText = escapeHtmlText(routeConfig.title);
  const safeTitleAttr = escapeHtmlAttr(routeConfig.title);
  const safeDescAttr = escapeHtmlAttr(routeConfig.description);

  let html = baseHtml;

  const replaceRequired = (pattern, replacement, label) => {
    if (!pattern.test(html)) {
      throw new Error(`prerender-seo: could not find ${label} in built index.html`);
    }
    html = html.replace(pattern, replacement);
  };

  replaceRequired(
    /<title>[^<]*<\/title>/,
    `<title>${safeTitleText}</title>`,
    '<title>'
  );
  replaceRequired(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${safeDescAttr}" />`,
    'meta[name="description"]'
  );
  replaceRequired(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${canonicalUrl}" />`,
    'link[rel="canonical"]'
  );
  replaceRequired(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    'meta[property="og:url"]'
  );
  replaceRequired(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${safeTitleAttr}" />`,
    'meta[property="og:title"]'
  );
  replaceRequired(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${safeDescAttr}" />`,
    'meta[property="og:description"]'
  );
  replaceRequired(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${safeTitleAttr}" />`,
    'meta[name="twitter:title"]'
  );
  replaceRequired(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${safeDescAttr}" />`,
    'meta[name="twitter:description"]'
  );
  replaceRequired(
    /<noscript>[\s\S]*?<\/noscript>/,
    `<noscript>${routeConfig.noscriptHtml.trim()}</noscript>`,
    '<noscript>'
  );

  return html;
}

const indexPath = path.join(BUILD_DIR, 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error(`prerender-seo: missing ${indexPath}; run vite build first`);
}

const baseHtml = fs.readFileSync(indexPath, 'utf8');

for (const routeConfig of ROUTES) {
  const slug = routeConfig.routePath.replace(/^\/+/, '');
  const outDir = path.join(BUILD_DIR, slug);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'index.html');
  const routeHtml = buildRouteHtml(baseHtml, routeConfig);
  fs.writeFileSync(outPath, routeHtml, 'utf8');
  console.log(`✓ Prerendered ${routeConfig.routePath} -> ${path.relative(BUILD_DIR, outPath)}`);
}
