const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function csp() {
    const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
    assert.ok(m, 'index.html needs a Content-Security-Policy meta tag');
    return Object.fromEntries(m[1].split(';').map(d => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
}

test('CSP only runs scripts from this site', () => {
    const policy = csp();
    assert.deepEqual(policy['script-src'], ["'self'"]);
    assert.deepEqual(policy['object-src'], ["'none'"]);
    assert.deepEqual(policy['base-uri'], ["'none'"]);
});

test('CSP meta comes before any stylesheet or script', () => {
    const cspAt = html.indexOf('Content-Security-Policy');
    assert.ok(cspAt < html.indexOf('<link'), 'CSP must precede <link> tags');
    assert.ok(cspAt < html.indexOf('<script'), 'CSP must precede <script> tags');
});

test('index.html has no inline scripts or inline event handlers', () => {
    for (const [, attrs] of html.matchAll(/<script\b([^>]*)>/g)) {
        assert.match(attrs, /\bsrc=/, 'inline <script> would be blocked by the CSP');
        assert.doesNotMatch(attrs, /src="https?:/, 'scripts must be served from this site');
    }
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'inline on* handlers would be blocked by the CSP');
});

test('every outside host the game loads from is allowed by the CSP', () => {
    const allowed = Object.values(csp()).flat().filter(v => v.startsWith('https://'));
    const sources = ['index.html', 'game.js', 'tutorial.js', 'styles.css']
        .map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
    // Only resources the browser fetches; links in comments and SVG namespaces don't count.
    const used = new Set([...sources.matchAll(/(?:src|href)=["'`]?(https:\/\/[^/"'`]+)|'(https:\/\/media\.[^/']+)/g)]
        .map(m => m[1] || m[2]));
    for (const origin of used) assert.ok(allowed.includes(origin), `${origin} is not in the CSP`);
});

test('CI runs with a read-only token and pinned actions', () => {
    const wf = fs.readFileSync(path.join(root, '.github/workflows/test.yml'), 'utf8');
    assert.match(wf, /permissions:\s*\n\s*contents: read/);
    for (const [, ref] of wf.matchAll(/uses:\s*\S+@(\S+)/g)) assert.match(ref, /^[0-9a-f]{40}$/, `${ref} is not a commit SHA`);
});
