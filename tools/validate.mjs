#!/usr/bin/env node
/**
 * Validação local e de CI do RiftStream AutoFarm.
 * Não precisa de dependências: apenas Node.js 20+.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const checks = [];
let total = 0;

function ok(label) {
  total++;
  checks.push(label);
}

function fail(label, detail) {
  total++;
  failures.push(detail ? `${label}: ${detail}` : label);
}

function must(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function parseJson(file) {
  try {
    return JSON.parse(read(file));
  } catch (e) {
    fail(`JSON válido (${file})`, e.message);
    return null;
  }
}

/* ------------------------------- manifest -------------------------------- */

const manifest = parseJson("manifest.json");
if (manifest) ok("manifest.json é JSON válido");

if (manifest) {
  must(manifest.manifest_version === 3, "manifest_version é 3", `recebido: ${manifest.manifest_version}`);
  must(!!manifest.name, "manifest.name presente");
  must(
    /^\d+\.\d+\.\d+$/.test(String(manifest.version || "")),
    "manifest.version é semver",
    String(manifest.version)
  );
  must(
    typeof manifest.description === "string" && manifest.description.length <= 132,
    "manifest.description tem até 132 caracteres",
    `${String(manifest.description || "").length} caracteres`
  );
  must(!!manifest.action?.default_popup, "manifest.action.default_popup definido");
  must(!!manifest.background?.service_worker, "manifest.background.service_worker definido");

  const refs = [];
  if (manifest.background?.service_worker) refs.push(manifest.background.service_worker);
  if (manifest.action?.default_popup) refs.push(manifest.action.default_popup);
  for (const icon of Object.values(manifest.icons || {})) refs.push(icon);
  for (const cs of manifest.content_scripts || []) {
    for (const js of cs.js || []) refs.push(js);
    for (const css of cs.css || []) refs.push(css);
  }

  for (const ref of refs) {
    must(exists(ref), `arquivo referenciado existe: ${ref}`);
  }

  const allowed = new Set(["storage", "alarms", "tabs", "scripting"]);
  for (const p of manifest.permissions || []) {
    must(allowed.has(p), `permissão conhecida: ${p}`);
  }
}

/* --------------------------------- JS ------------------------------------ */

const jsFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (/\.(js|mjs)$/.test(entry.name)) jsFiles.push(rel);
  }
}
walk(".");
walk("content");
walk("popup");
walk("tools");

for (const file of [...new Set(jsFiles)].sort()) {
  const res = spawnSync(process.execPath, ["--check", path.join(root, file)], {
    encoding: "utf8",
  });
  if (res.status === 0) ok(`sintaxe: ${file}`);
  else fail(`sintaxe: ${file}`, (res.stderr || res.stdout || "").trim().split("\n")[0]);
}

/* ------------------------------- encoding -------------------------------- */

const textFiles = [
  "manifest.json",
  "background.js",
  "content/riftstream.js",
  "content/twitch.js",
  "popup/popup.html",
  "popup/popup.css",
  "popup/popup.js",
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "PRIVACY.md",
  "SECURITY.md",
  "LICENSE",
  "docs/ARQUITETURA.md",
  "docs/VALIDACAO.md",
  "docs/RELEASE.md",
  "tools/validate.mjs",
  ".github/workflows/validar.yml",
];

for (const file of textFiles) {
  if (!exists(file)) {
    fail(`arquivo obrigatório: ${file}`);
    continue;
  }
  const buf = fs.readFileSync(path.join(root, file));
  const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const txt = buf.toString("utf8");
  const invalid = [...txt].filter((c) => c === "\uFFFD").length;
  must(!bom, `sem BOM: ${file}`);
  must(invalid === 0, `UTF-8 válido: ${file}`, `${invalid} caractere(s) inválido(s)`);
  must(txt.endsWith("\n"), `termina com nova linha: ${file}`);
}

/* ------------------------------ HTML local ------------------------------- */

const html = read("popup/popup.html");
const assetRefs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((ref) => !/^(https?:|data:|#|mailto:)/.test(ref));

for (const ref of assetRefs) {
  must(exists(path.posix.join("popup", ref)), `asset do popup existe: ${ref}`);
}

/* -------------------------------- imagens -------------------------------- */

for (const file of ["docs/banner.png", "docs/screenshot.png", "icons/icon16.png", "icons/icon48.png", "icons/icon128.png"]) {
  if (!exists(file)) {
    fail(`imagem obrigatória: ${file}`);
    continue;
  }
  const buf = fs.readFileSync(path.join(root, file));
  const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  must(png, `PNG válido: ${file}`);
}

/* --------------------------- links da documentação ----------------------- */

const markdown = [
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "PRIVACY.md",
  "SECURITY.md",
  "docs/ARQUITETURA.md",
  "docs/VALIDACAO.md",
  "docs/RELEASE.md",
];

for (const file of markdown) {
  if (!exists(file)) continue;
  const txt = read(file);
  const baseDir = path.dirname(file);
  let count = 0;
  for (const m of txt.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#|data:)/.test(target)) continue;
    const clean = decodeURIComponent(target.split("#")[0]);
    if (!clean) continue;
    count++;
    const resolved = path.posix.normalize(path.posix.join(baseDir, clean));
    must(exists(resolved), `link de ${file} existe: ${clean}`);
  }
  ok(`links verificados: ${file} (${count} local(is))`);
}

/* ------------------------------- segredos -------------------------------- */

const secretPatterns = [
  [/ghp_[A-Za-z0-9]{20,}/, "token clássico do GitHub"],
  [/github_pat_[A-Za-z0-9_]{20,}/, "token fine-grained do GitHub"],
  [/AKIA[0-9A-Z]{16}/, "chave AWS"],
  [/-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----/, "chave privada"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JWT"],
];

for (const file of textFiles) {
  if (!exists(file)) continue;
  const txt = read(file);
  for (const [re, label] of secretPatterns) {
    must(!re.test(txt), `sem ${label}: ${file}`);
  }
}

/* --------------------------- versão consistente -------------------------- */

if (manifest) {
  const version = manifest.version;
  const readme = exists("README.md") ? read("README.md") : "";
  const changelog = exists("CHANGELOG.md") ? read("CHANGELOG.md") : "";
  const badge = /vers%C3%A3o-(\d+\.\d+\.\d+)-/.exec(readme);
  const section = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog);

  must(!!badge && badge[1] === version, "badge de versão do README bate com o manifest", badge?.[1]);
  must(!!section && section[1] === version, "CHANGELOG tem seção da versão atual", section?.[1]);
}

/* -------------------------------- resumo --------------------------------- */

console.log(`\nRiftStream AutoFarm — validação\n`);
console.log(`  ${checks.length} verificação(ões) concluída(s)`);

if (failures.length) {
  console.log(`  ${failures.length} falha(s):\n`);
  for (const f of failures) console.log(`   ✗ ${f}`);
  console.log("");
  process.exit(1);
}

console.log(`  ✓ Tudo certo\n`);
