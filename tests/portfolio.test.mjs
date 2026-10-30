import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const script = await readFile(new URL('script.js', root), 'utf8');
const stylesheet = await readFile(new URL('styles.css', root), 'utf8');
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function themeEnvironment({ saved = null, blocked = false, hasButton = true } = {}) {
    const attributes = {};
    const button = {
        hidden: true,
        textContent: '',
        setAttribute: (name, value) => { attributes[name] = value; },
        addEventListener: (event, callback) => { button[event] = callback; },
    };
    const status = { textContent: '' };
    const documentElement = { dataset: { theme: 'dark' } };
    const warnings = [];
    let stored = saved;
    const context = {
        document: {
            documentElement,
            getElementById: id => id === 'theme-toggle' ? (hasButton ? button : null) : status,
        },
        localStorage: {
            getItem: () => {
                if (blocked) throw new Error('Storage blocked');
                return stored;
            },
            setItem: (key, value) => {
                assert.equal(key, 'theme');
                if (blocked) throw new Error('Storage blocked');
                stored = value;
            },
        },
        console: { warn: (...args) => warnings.push(args) },
    };
    runInNewContext(bootstrap, context);
    runInNewContext(script, context);
    return { button, status, documentElement, warnings, attributes, stored: () => stored };
}

test('new visitors default to dark and get an accessible light-theme action', () => {
    const env = themeEnvironment();
    assert.equal(env.documentElement.dataset.theme, 'dark');
    assert.equal(env.button.hidden, false);
    assert.equal(env.attributes['aria-label'], 'Switch to light theme');
    env.button.click();
    assert.equal(env.documentElement.dataset.theme, 'light');
    assert.equal(env.stored(), 'light');
    assert.equal(env.attributes['aria-label'], 'Switch to dark theme');
    env.button.click();
    assert.equal(env.documentElement.dataset.theme, 'dark');
    assert.equal(env.stored(), 'dark');
});

test('valid saved themes are restored and invalid values do not affect the default', () => {
    for (const saved of ['light', 'dark', '', 'invalid']) {
        const env = themeEnvironment({ saved });
        assert.equal(env.documentElement.dataset.theme, saved === 'light' ? 'light' : 'dark');
    }
});

test('blocked storage does not prevent switching and reports the persistence failure', () => {
    const env = themeEnvironment({ blocked: true });
    assert.equal(env.documentElement.dataset.theme, 'dark');
    assert.equal(env.warnings.length, 1);
    env.button.click();
    assert.equal(env.documentElement.dataset.theme, 'light');
    assert.equal(env.warnings.length, 2);
    assert.match(env.status.textContent, /prevented saving/);
});

test('shared script tolerates a page without the optional theme control', () => {
    assert.doesNotThrow(() => themeEnvironment({ hasButton: false }));
});

test('initial assets stay below 200 KB and reference only local dependencies', async () => {
    const assets = ['index.html', 'styles.css', 'script.js'];
    assets.push(...(await readdir(new URL('fonts/', root))).filter(name => name.endsWith('.woff2')).map(name => `fonts/${name}`));
    const sizes = await Promise.all(assets.map(name => stat(new URL(name, root))));
    assert.ok(sizes.reduce((sum, file) => sum + file.size, 0) <= 200_000);
    assert.doesNotMatch(stylesheet, /@import|https?:\/\//);
    for (const [, reference] of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)) {
        if (reference.startsWith('data:')) continue;
        assert.doesNotMatch(reference, /^https?:/);
        assert.ok((await stat(new URL(reference, root))).isFile(), reference);
    }
    assert.ok((await stat(new URL('fonts/OFL.txt', root))).size > 0);
});

test('local destinations exist and project disclosures require no JavaScript', async () => {
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.equal((html.match(/<details>/g) || []).length, 3);
    assert.equal((html.match(/<summary>/g) || []).length, 3);
    assert.match(html, /<pre class="ascii-name" aria-hidden="true">/);
    assert.match(html, /<button id="theme-toggle"[^>]* hidden>/);
    assert.doesNotMatch(html, /<(?:img|video|iframe)\b/);
    for (const [, href] of html.matchAll(/\bhref="([^"]+)"/g)) {
        if (href.startsWith('#')) {
            assert.ok(ids.has(href.slice(1)), `Missing anchor: ${href}`);
        } else if (!/^(?:https?:|mailto:|data:)/.test(href)) {
            assert.ok((await stat(fileURLToPath(new URL(href, root)))).isFile(), href);
        }
    }
    assert.ok((await stat(new URL('blog.html', root))).isFile());
});
