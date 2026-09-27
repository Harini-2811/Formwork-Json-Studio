// ============================================================
// Formwork — UI interaction layer
// ============================================================

const inputArea   = document.getElementById('inputArea');
const inputGutter  = document.getElementById('inputGutter');
const inputStats   = document.getElementById('inputStats');
const outputGutter = document.getElementById('outputGutter');

const SAMPLES = {
  user: '{"user":{"name":"Alex","role":"student","skills":["HTML","CSS"]}}',
  orders: '{"orders":[{"id":1,"item":"Keyboard","qty":2},{"id":2,"item":"Monitor","qty":1}]}',
  broken: '{"user":{"name":"Alex""role":"student"}}'
};

// -------- gutter line numbers --------
function renderGutter(gutterEl, lineCount) {
  gutterEl.innerHTML = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => `<span>${i + 1}</span>`).join('\n');
}

function setOutputCode(text) {
  const codeEl = document.getElementById('outputCode');
  codeEl.textContent = text;
  if (window.Prism) {
    Prism.highlightElement(codeEl);
  }
}

function syncInputGutter() {
  const lines = inputArea.value.split('\n').length;
  renderGutter(inputGutter, lines);
}

inputArea.addEventListener('input', () => {
  syncInputGutter();
  updateInputStats();
});

inputArea.addEventListener('scroll', () => {
  inputGutter.scrollTop = inputArea.scrollTop;
});

// -------- live stats --------
function updateInputStats() {
  const value = inputArea.value;
  const bytes = new Blob([value]).size;
  const lines = value.split('\n').length;
  inputStats.textContent = `${bytes} bytes · ${lines} line${lines === 1 ? '' : 's'}`;
}

// -------- sample loader --------
document.getElementById('sampleSelect').addEventListener('change', (e) => {
  const key = e.target.value;
  if (key && SAMPLES[key]) {
    inputArea.value = SAMPLES[key];
    syncInputGutter();
    updateInputStats();
  }
  e.target.value = '';
});

// -------- theme switch --------
const themeButtons = document.querySelectorAll('.theme-opt');
themeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    themeButtons.forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const theme = btn.dataset.theme;
    if (theme === 'slate') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  });
});

// -------- reset / clear --------
document.getElementById('resetBtn').addEventListener('click', () => {
  document.documentElement.removeAttribute('data-theme');
  themeButtons.forEach((b) => b.classList.remove('is-active'));
  document.querySelector('[data-theme="slate"]').classList.add('is-active');
  clearAll();
});

document.getElementById('clearBtn').addEventListener('click', clearAll);

function clearAll() {
  inputArea.value = '';
  syncInputGutter();
  updateInputStats();
  document.getElementById('outputCode').textContent = '// Formatted JSON will appear here';
  document.getElementById('outputStats').textContent = 'Waiting for input…';
  renderGutter(outputGutter, 1);
  resetMetrics();
}

function resetMetrics() {
  document.getElementById('metricBytes').textContent = '0 B';
  document.getElementById('metricChars').textContent = '0';
  document.getElementById('metricDepth').textContent = '0';
  document.getElementById('metricArrays').textContent = '0';
  document.getElementById('metricPairs').textContent = '0';
}

// -------- copy button --------
document.getElementById('copyBtn').addEventListener('click', () => {
  const text = document.getElementById('outputCode').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyBtn');
    const original = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => (btn.textContent = original), 1200);
  });
});

// -------- drawer open/close --------
const drawer = document.getElementById('drawer');
const drawerToggle = document.getElementById('drawerToggle');

drawerToggle.addEventListener('click', () => {
  const isOpen = drawer.getAttribute('data-open') === 'true';
  drawer.setAttribute('data-open', String(!isOpen));
  drawerToggle.setAttribute('aria-expanded', String(!isOpen));
});

// -------- drawer inner tabs --------
document.querySelectorAll('.drawer-nav-btn').forEach((navBtn) => {
  navBtn.addEventListener('click', () => {
    document.querySelectorAll('.drawer-nav-btn').forEach((b) => b.classList.remove('is-active'));
    document.querySelectorAll('.drawer-panel').forEach((p) => p.classList.remove('is-active'));
    navBtn.classList.add('is-active');
    document.querySelector(`.drawer-panel[data-panel="${navBtn.dataset.panel}"]`).classList.add('is-active');
  });
});

// -------- friendly error translator --------
function explainJsonError(raw, err) {
  const msg = err.message;

  const posMatch = msg.match(/position (\d+)/);
  let lineInfo = '';
  if (posMatch) {
    const pos = parseInt(posMatch[1], 10);
    const upToPos = raw.slice(0, pos);
    const line = upToPos.split('\n').length;
    lineInfo = ` (around line ${line})`;
  }

  if (/Expected ',' or/.test(msg)) {
    return `Looks like a comma is missing${lineInfo} — check right before the spot the error points to.`;
  }
  if (/Unexpected token '?"'?/.test(msg) || /Unexpected string/.test(msg)) {
    return `It looks like two values are sitting next to each other without a comma between them${lineInfo}.`;
  }
  if (/Unexpected end of JSON input/.test(msg)) {
    return `The JSON stops abruptly — you're likely missing a closing "}" or "]" at the end.`;
  }
  if (/Unexpected token/.test(msg)) {
    return `There's an unexpected character${lineInfo}. Double-check for a missing comma, quote, or bracket nearby.`;
  }

  return `Couldn't parse this JSON: ${msg}`;
}

// -------- Auto-Fix: attempts simple repairs --------
function attemptAutoFix(raw, err) {
  const msg = err.message;
  const posMatch = msg.match(/position (\d+)/);

  if (/Expected ',' or/.test(msg) && posMatch) {
    const pos = parseInt(posMatch[1], 10);
    const fixed = raw.slice(0, pos) + ',' + raw.slice(pos);
    return fixed;
  }

  if (/Unexpected end of JSON input/.test(msg)) {
    let fixed = raw;
    const openCurly = (raw.match(/{/g) || []).length;
    const closeCurly = (raw.match(/}/g) || []).length;
    const openSquare = (raw.match(/\[/g) || []).length;
    const closeSquare = (raw.match(/\]/g) || []).length;

    fixed += ']'.repeat(Math.max(0, openSquare - closeSquare));
    fixed += '}'.repeat(Math.max(0, openCurly - closeCurly));
    return fixed;
  }

  return null;
}

// -------- analytics calculator --------
function analyzeJson(data) {
  let depth = 0;
  let arrays = 0;
  let pairs = 0;

  function walk(node, currentDepth) {
    depth = Math.max(depth, currentDepth);

    if (Array.isArray(node)) {
      arrays++;
      node.forEach((item) => walk(item, currentDepth + 1));
    } else if (node !== null && typeof node === 'object') {
      const keys = Object.keys(node);
      pairs += keys.length;
      keys.forEach((key) => walk(node[key], currentDepth + 1));
    }
  }

  walk(data, 1);
  return { depth, arrays, pairs };
}

function updateAnalytics(pretty, parsed) {
  const bytes = new Blob([pretty]).size;
  const chars = pretty.length;
  const { depth, arrays, pairs } = analyzeJson(parsed);

  document.getElementById('metricBytes').textContent = `${bytes} B`;
  document.getElementById('metricChars').textContent = chars;
  document.getElementById('metricDepth').textContent = depth;
  document.getElementById('metricArrays').textContent = arrays;
  document.getElementById('metricPairs').textContent = pairs;
}

// -------- Format button --------
document.getElementById('formatBtn').addEventListener('click', () => {
  const raw = inputArea.value.trim();

  if (!raw) {
    document.getElementById('outputCode').textContent = '// Nothing to format yet — paste some JSON on the left.';
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const pretty = JSON.stringify(parsed, null, 4);

    setOutputCode(pretty);
    renderGutter(outputGutter, pretty.split('\n').length);

    document.getElementById('outputStats').textContent =
      `${new Blob([pretty]).size} bytes · ${pretty.split('\n').length} lines`;

    document.getElementById('drawerBadge').textContent = 'no issues';
    drawer.setAttribute('data-badge', '');
    updateAnalytics(pretty, parsed);

  } catch (err) {
    document.getElementById('outputCode').textContent = '// Fix the error below, then click Format again.';

    const friendlyMsg = explainJsonError(raw, err);
    const fixAttempt = attemptAutoFix(raw, err);
    const fixButtonHtml = fixAttempt
      ? `<button class="btn btn-ghost" id="autoFixBtn" style="margin-top:10px;">Auto-Fix</button>`
      : '';

    document.querySelector('#drawer .drawer-panel[data-panel="errors"]').innerHTML = `
      <div class="error-card">
        <span class="error-card-icon">!</span>
        <div class="error-card-body">
          <p class="error-card-title">This JSON isn't valid yet</p>
          <p class="error-card-desc">${friendlyMsg}</p>
          ${fixButtonHtml}
        </div>
      </div>
    `;

    if (fixAttempt) {
      document.getElementById('autoFixBtn').addEventListener('click', () => {
        inputArea.value = fixAttempt;
        syncInputGutter();
        updateInputStats();
        document.getElementById('formatBtn').click();
      });
    }

    document.getElementById('drawerBadge').textContent = '1 issue';
    drawer.setAttribute('data-badge', 'error');
    drawer.setAttribute('data-open', 'true');
    drawerToggle.setAttribute('aria-expanded', 'true');
  }
});

// -------- Validate button --------
document.getElementById('validateBtn').addEventListener('click', () => {
  const raw = inputArea.value.trim();

  if (!raw) {
    document.getElementById('drawerBadge').textContent = 'no input';
    drawer.setAttribute('data-badge', '');
    drawer.setAttribute('data-open', 'true');
    drawerToggle.setAttribute('aria-expanded', 'true');

    document.querySelector('#drawer .drawer-panel[data-panel="errors"]').innerHTML = `
      <div class="error-card">
        <span class="error-card-icon">!</span>
        <div class="error-card-body">
          <p class="error-card-title">Nothing to validate</p>
          <p class="error-card-desc">Paste some JSON on the left first.</p>
        </div>
      </div>
    `;
    return;
  }

  try {
    JSON.parse(raw);

    document.getElementById('drawerBadge').textContent = 'valid ✓';
    drawer.setAttribute('data-badge', '');
    drawer.setAttribute('data-open', 'true');
    drawerToggle.setAttribute('aria-expanded', 'true');

    document.querySelector('#drawer .drawer-panel[data-panel="errors"]').innerHTML = `
      <div class="error-card" style="border-left-color: var(--accent);">
        <span class="error-card-icon" style="background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent);">✓</span>
        <div class="error-card-body">
          <p class="error-card-title">Valid JSON</p>
          <p class="error-card-desc">No syntax errors found. Click Format to prettify it.</p>
        </div>
      </div>
    `;

  } catch (err) {
    const friendlyMsg = explainJsonError(raw, err);

    document.getElementById('drawerBadge').textContent = '1 issue';
    drawer.setAttribute('data-badge', 'error');
    drawer.setAttribute('data-open', 'true');
    drawerToggle.setAttribute('aria-expanded', 'true');

    document.querySelector('#drawer .drawer-panel[data-panel="errors"]').innerHTML = `
      <div class="error-card">
        <span class="error-card-icon">!</span>
        <div class="error-card-body">
          <p class="error-card-title">This JSON isn't valid yet</p>
          <p class="error-card-desc">${friendlyMsg}</p>
        </div>
      </div>
    `;
  }
});

// -------- Anonymise button --------
function anonymiseData(node) {
  if (Array.isArray(node)) {
    return node.map((item) => anonymiseData(item));
  }

  if (node !== null && typeof node === 'object') {
    const result = {};
    for (const key of Object.keys(node)) {
      const lowerKey = key.toLowerCase();
      const value = node[key];

      if (lowerKey.includes('email')) {
        result[key] = '[ANONYMISED_EMAIL]';
      } else if (lowerKey.includes('phone')) {
        result[key] = '[ANONYMISED_PHONE]';
      } else if (lowerKey.includes('name')) {
        result[key] = '[ANONYMISED_NAME]';
      } else if (value !== null && typeof value === 'object') {
        result[key] = anonymiseData(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return node;
}

document.getElementById('anonBtn').addEventListener('click', () => {
  const raw = inputArea.value.trim();

  if (!raw) {
    document.getElementById('outputCode').textContent = '// Nothing to anonymise yet — paste some JSON on the left.';
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const scrubbed = anonymiseData(parsed);
    const pretty = JSON.stringify(scrubbed, null, 4);

    setOutputCode(pretty);
    renderGutter(outputGutter, pretty.split('\n').length);

    document.getElementById('outputStats').textContent =
      `${new Blob([pretty]).size} bytes · ${pretty.split('\n').length} lines · anonymised`;

    document.getElementById('drawerBadge').textContent = 'no issues';
    drawer.setAttribute('data-badge', '');
    updateAnalytics(pretty, scrubbed);

  } catch (err) {
    const friendlyMsg = explainJsonError(raw, err);

    document.getElementById('outputCode').textContent = '// Fix the JSON first, then click Anonymise.';

    document.querySelector('#drawer .drawer-panel[data-panel="errors"]').innerHTML = `
      <div class="error-card">
        <span class="error-card-icon">!</span>
        <div class="error-card-body">
          <p class="error-card-title">Can't anonymise invalid JSON</p>
          <p class="error-card-desc">${friendlyMsg}</p>
        </div>
      </div>
    `;

    document.getElementById('drawerBadge').textContent = '1 issue';
    drawer.setAttribute('data-badge', 'error');
    drawer.setAttribute('data-open', 'true');
    drawerToggle.setAttribute('aria-expanded', 'true');
  }
});

// -------- Mock data: shape detection + random value generation --------
const RANDOM_FIRST_NAMES = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Ishita', 'Vikram', 'Sara'];
const RANDOM_WORDS = ['Alpha', 'Bridge', 'Orbit', 'Nova', 'Pixel', 'Harbor', 'Drift', 'Echo'];
const RANDOM_DOMAINS = ['mail.com', 'example.com', 'test.org', 'workspace.io'];

function randomOf(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomStringLike(key, original) {
  const lowerKey = key.toLowerCase();

  if (lowerKey.includes('email')) {
    return `${randomOf(RANDOM_FIRST_NAMES).toLowerCase()}${Math.floor(Math.random() * 99)}@${randomOf(RANDOM_DOMAINS)}`;
  }
  if (lowerKey.includes('name')) {
    return randomOf(RANDOM_FIRST_NAMES);
  }
  if (lowerKey.includes('phone')) {
    return String(Math.floor(6000000000 + Math.random() * 3999999999));
  }
  if (lowerKey.includes('id')) {
    return original;
  }
  return `${randomOf(RANDOM_WORDS)}-${Math.floor(Math.random() * 1000)}`;
}

function randomValueLike(key, value) {
  if (typeof value === 'string') {
    return randomStringLike(key, value);
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return Math.floor(Math.random() * 1000);
    }
    return parseFloat((Math.random() * 1000).toFixed(2));
  }
  if (typeof value === 'boolean') {
    return Math.random() < 0.5;
  }
  if (Array.isArray(value)) {
    return value.map((item) => generateMockFromTemplate(item));
  }
  if (value !== null && typeof value === 'object') {
    return generateMockFromTemplate(value);
  }
  return value;
}

function generateMockFromTemplate(template) {
  if (Array.isArray(template)) {
    return template.map((item) => generateMockFromTemplate(item));
  }
  if (template !== null && typeof template === 'object') {
    const result = {};
    for (const key of Object.keys(template)) {
      result[key] = randomValueLike(key, template[key]);
    }
    return result;
  }
  return template;
}

// -------- Mock ×100 button --------
document.getElementById('mockBtn').addEventListener('click', () => {
  const raw = inputArea.value.trim();

  if (!raw) {
    document.getElementById('outputCode').textContent = '// Paste one valid JSON object first — it\'ll be used as the template.';
    return;
  }

  try {
    const template = JSON.parse(raw);
    const count = 100;
    const mockSet = [];

    for (let i = 0; i < count; i++) {
      mockSet.push(generateMockFromTemplate(template));
    }

    const pretty = JSON.stringify(mockSet, null, 4);

    setOutputCode(
      `// Generated ${count} mock entries — preview below, full set downloading as a file.\n\n` + pretty
    );
    renderGutter(outputGutter, pretty.split('\n').length + 2);

    document.getElementById('outputStats').textContent =
      `${new Blob([pretty]).size} bytes · ${count} mock entries generated`;

    document.getElementById('drawerBadge').textContent = 'no issues';
    drawer.setAttribute('data-badge', '');
    updateAnalytics(pretty, mockSet);

    const blob = new Blob([pretty], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mock-data.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

  } catch (err) {
    const friendlyMsg = explainJsonError(raw, err);

    document.getElementById('outputCode').textContent = '// Fix the JSON first, then click Mock ×100.';

    document.querySelector('#drawer .drawer-panel[data-panel="errors"]').innerHTML = `
      <div class="error-card">
        <span class="error-card-icon">!</span>
        <div class="error-card-body">
          <p class="error-card-title">Can't generate mock data from invalid JSON</p>
          <p class="error-card-desc">${friendlyMsg}</p>
        </div>
      </div>
    `;

    document.getElementById('drawerBadge').textContent = '1 issue';
    drawer.setAttribute('data-badge', 'error');
    drawer.setAttribute('data-open', 'true');
    drawerToggle.setAttribute('aria-expanded', 'true');
  }
});

// -------- init --------
syncInputGutter();
updateInputStats();
renderGutter(outputGutter, 10);

// -------- home screen → main app navigation --------
document.getElementById('enterAppBtn').addEventListener('click', () => {
  document.getElementById('homeScreen').style.display = 'none';
  document.getElementById('appShell').classList.add('is-visible');
});

// -------- landing page: looping format animation --------
(function animateHomePreview() {
  const el = document.getElementById('homePreviewCode');
  if (!el) return;

  const messy = '{"user":"Alex","role":"dev"}';
  const pretty =
`{
  "user": "Alex",
  "role": "dev"
}`;

  function highlight(str) {
    return str
      .replace(/"(.*?)":/g, '<span class="tok-key">"$1"</span><span class="tok-punc">:</span>')
      .replace(/: "(.*?)"/g, ': <span class="tok-str">"$1"</span>');
  }

  let showingPretty = false;

  function typeText(text, callback) {
    el.innerHTML = '';
    let i = 0;
    const raw = text;
    const interval = setInterval(() => {
      i++;
      el.innerHTML = highlight(raw.slice(0, i));
      if (i >= raw.length) {
        clearInterval(interval);
        if (callback) setTimeout(callback, 1400);
      }
    }, 28);
  }

  function loop() {
    typeText(showingPretty ? messy : pretty, () => {
      showingPretty = !showingPretty;
      loop();
    });
  }

  loop();
})();
