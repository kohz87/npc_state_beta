import fs from 'node:fs';
import path from 'node:path';

// Runtime entrypoints come from the manifest. Follow static imports, literal dynamic
// imports, URL assets, and CSS references; never include all of src/ implicitly.
export function runtimeFiles(root) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    const pending = [manifest.js, manifest.css].filter(Boolean);
    const seen = new Set();
    while (pending.length) {
        const relative = pending.pop();
        if (seen.has(relative)) continue;
        const absolute = path.resolve(root, relative);
        if (!absolute.startsWith(path.resolve(root) + path.sep)) throw new Error(`Runtime path escapes package: ${relative}`);
        if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`Missing runtime dependency: ${relative}`);
        seen.add(relative);
        const source = fs.readFileSync(absolute, 'utf8');
        const refs = [];
        if (/\.(?:js|mjs)$/.test(relative)) {
            for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^;'"`]*?\s+from\s*)?['"]([^'"]+)['"]/g)) refs.push(match[1]);
            for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) refs.push(match[1]);
            for (const match of source.matchAll(/\bnew\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) refs.push(match[1]);
            if (/\bimport\s*\(\s*[^\s'"]/.test(source)) throw new Error(`Nonliteral dynamic import needs an explicit dependency: ${relative}`);
        } else if (/\.css$/.test(relative)) {
            for (const match of source.matchAll(/@import\s+['"]([^'"]+)['"]|url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)) refs.push(match[1] || match[2]);
        }
        for (const ref of refs) {
            if (/^(?:data:|https?:|#)/i.test(ref)) continue;
            const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), ref.split(/[?#]/)[0]));
            // Host imports are deliberately external and validated separately.
            if (resolved.startsWith('../')) {
                if (!['extensions.js', 'script.js'].includes(path.posix.basename(resolved))) throw new Error(`Unrecognized host dependency: ${relative}: ${ref}`);
                continue;
            }
            pending.push(resolved);
        }
    }
    return [...seen].sort();
}

export function sourceFiles(root) {
    const out = [];
    const walk = relative => {
        for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
            const next = `${relative}/${item.name}`;
            if (item.isDirectory()) walk(next);
            else out.push(next);
        }
    };
    walk('src');
    return out.sort();
}
