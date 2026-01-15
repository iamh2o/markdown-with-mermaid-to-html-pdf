#!/usr/bin/env node
/**
 * md-mermaid-export.mjs
 *
 * Convert Markdown (with ```mermaid fences) -> self-contained HTML (rendered Mermaid)
 * or -> PDF (rendered Mermaid) via Puppeteer.
 *
 * Usage:
 *   node md-mermaid-export.mjs README.md --format html --out README.html
 *   node md-mermaid-export.mjs README.md --format pdf  --out README.pdf
 *
 * Options:
 *   --format html|pdf        (default: html)
 *   --out <path>             (default: input basename + .html/.pdf)
 *   --title <string>         (default: input filename)
 *   --mermaid-theme <name>   default|dark|forest|neutral  (default: default)
 *   --security <level>       strict|loose|antiscript (default: strict)
 *   --pdf-format <fmt>       A4|Letter|... (default: A4)
 *   --pdf-margin <mm>        number in mm (default: 15)
 *   --keep-html              keep intermediate HTML when producing PDF
 *   --timeout-ms <n>         wait for Mermaid render (default: 60000)
 *   --chrome <path>          use system Chrome/Chromium executable
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";

const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function tryReadFile(p) {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

function usageAndExit(code = 1) {
  console.error(`
Usage:
  node md-mermaid-export.mjs <input.md> [--format html|pdf] [--out out.html|out.pdf] [options]

Examples:
  node md-mermaid-export.mjs README.md --format html --out README.html
  node md-mermaid-export.mjs README.md --format pdf  --out README.pdf

Options:
  --title <string>
  --mermaid-theme default|dark|forest|neutral
  --security strict|loose|antiscript
  --pdf-format A4|Letter|...
  --pdf-margin <mm>
  --keep-html
  --timeout-ms <n>
  --chrome <path>
`);
  process.exit(code);
}

async function buildHtml({ inputPath, markdown, title, mermaidTheme, securityLevel }) {
  // Markdown-it with GFM-ish features + task lists
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  }).use(taskLists, { enabled: true, label: true });

  // Override fence rendering for mermaid
  const defaultFence =
    md.renderer.rules.fence ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || "").trim().split(/\s+/g)[0];
    if (info === "mermaid") {
      // Mermaid expects text content; escape HTML but keep original chars
      return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>\n`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };

  const body = md.render(markdown);

  // Inline GitHub Markdown CSS if available
  let githubCss = "";
  try {
    const ghCssPath = require.resolve("github-markdown-css/github-markdown-light.css");
    githubCss = (await fs.readFile(ghCssPath, "utf8")) || "";
  } catch {
    githubCss = "";
  }

  // Inline Mermaid JS
  let mermaidJs = "";
  try {
    const mermaidPath = require.resolve("mermaid/dist/mermaid.min.js");
    mermaidJs = (await fs.readFile(mermaidPath, "utf8")) || "";
  } catch (e) {
    throw new Error(
      `Could not find Mermaid runtime JS. Is 'mermaid' installed? Original error: ${e?.message || e}`
    );
  }

  // Base href so relative images/links resolve from the markdown directory
  const baseDir = path.dirname(path.resolve(inputPath));
  const baseHref = pathToFileURL(baseDir + path.sep).href;

  // Some sensible layout defaults (esp. for PDF printing)
  const extraCss = `
    /* Layout polish */
    body { margin: 0; }
    .markdown-body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 24px;
    }

    /* Ensure mermaid SVGs don't overflow */
    .mermaid svg { max-width: 100%; height: auto; }

    /* Print tweaks */
    @media print {
      .markdown-body { max-width: none; padding: 0; }
      a { color: inherit; text-decoration: none; }
    }
  `;

  // Render Mermaid deterministically & set a window flag for Puppeteer to wait on.
  // Works for Mermaid v9/v10-ish APIs.
  const mermaidBootstrap = `
    (function () {
      function markDone(ok, err) {
        window.__MERMAID_DONE = true;
        window.__MERMAID_OK = ok;
        if (err) window.__MERMAID_ERROR = String(err);
      }

      try {
        if (typeof mermaid === "undefined") {
          markDone(false, "Mermaid failed to load");
          return;
        }

        var init = {
          startOnLoad: false,
          securityLevel: ${JSON.stringify(securityLevel)},
          theme: ${JSON.stringify(mermaidTheme)}
        };

        // Init (API differs across versions)
        if (typeof mermaid.initialize === "function") {
          mermaid.initialize(init);
        } else if (mermaid.mermaidAPI && typeof mermaid.mermaidAPI.initialize === "function") {
          mermaid.mermaidAPI.initialize(init);
        }

        // Render
        var p;
        if (typeof mermaid.run === "function") {
          // v10+
          p = mermaid.run({ querySelector: ".mermaid" });
        } else if (typeof mermaid.init === "function") {
          // older
          mermaid.init(undefined, document.querySelectorAll(".mermaid"));
          p = Promise.resolve();
        } else {
          p = Promise.reject(new Error("Unknown Mermaid API (no run/init found)"));
        }

        Promise.resolve(p)
          .then(function () { markDone(true); })
          .catch(function (e) { console.error(e); markDone(false, e); });

      } catch (e) {
        console.error(e);
        markDone(false, e);
      }
    })();
  `;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <base href="${escapeHtml(baseHref)}" />
  <title>${escapeHtml(title)}</title>
  <style>${githubCss}\n${extraCss}</style>
</head>
<body>
  <article class="markdown-body">
${body}
  </article>

  <script>${mermaidJs}</script>
  <script>${mermaidBootstrap}</script>
</body>
</html>`;

  return html;
}

async function renderPdfFromHtmlFile({
  htmlFilePath,
  outPdfPath,
  timeoutMs,
  pdfFormat,
  pdfMarginMm,
  chromePath,
}) {
  // Dynamic import so HTML-only usage doesn't require Puppeteer installed.
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch (e) {
    throw new Error(
      `PDF requested but puppeteer is not available. Install it: npm i puppeteer\nOriginal error: ${e?.message || e}`
    );
  }

  const launchOpts = {
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--allow-file-access-from-files",
    ],
  };
  if (chromePath && typeof chromePath === "string") {
    launchOpts.executablePath = chromePath;
  }

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();

    await page.goto(pathToFileURL(htmlFilePath).href, { waitUntil: "networkidle0" });

    // Wait for Mermaid completion flag
    await page.waitForFunction(() => window.__MERMAID_DONE === true, {
      timeout: timeoutMs,
    });

    const mermaidOk = await page.evaluate(() => Boolean(window.__MERMAID_OK));
    const mermaidErr = await page.evaluate(() => window.__MERMAID_ERROR || null);

    if (!mermaidOk) {
      console.error("[warn] Mermaid reported a render problem:");
      if (mermaidErr) console.error("       " + mermaidErr);
      console.error("       PDF will still be produced, but diagrams may be missing/broken.");
    }

    await page.pdf({
      path: outPdfPath,
      format: pdfFormat,
      printBackground: true,
      margin: {
        top: `${pdfMarginMm}mm`,
        right: `${pdfMarginMm}mm`,
        bottom: `${pdfMarginMm}mm`,
        left: `${pdfMarginMm}mm`,
      },
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args._[0];
  if (!inputPath) usageAndExit(1);

  const absInput = path.resolve(inputPath);
  const inStat = await fs.stat(absInput).catch(() => null);
  if (!inStat || !inStat.isFile()) {
    console.error(`Input file not found: ${absInput}`);
    process.exit(1);
  }

  const format = String(args.format || "html").toLowerCase();
  if (format !== "html" && format !== "pdf") {
    console.error(`--format must be 'html' or 'pdf' (got: ${format})`);
    process.exit(1);
  }

  const title = args.title ? String(args.title) : path.basename(absInput);

  const mermaidTheme = String(args["mermaid-theme"] || "default");
  const securityLevel = String(args.security || "strict");

  const timeoutMs = Number(args["timeout-ms"] || 60000);
  const pdfFormat = String(args["pdf-format"] || "A4");
  const pdfMarginMm = Number(args["pdf-margin"] || 15);
  const keepHtml = Boolean(args["keep-html"]);
  const chromePath = args.chrome ? String(args.chrome) : null;

  const markdown = await fs.readFile(absInput, "utf8");

  const html = await buildHtml({
    inputPath: absInput,
    markdown,
    title,
    mermaidTheme,
    securityLevel,
  });

  // Default output name
  const defaultOut =
    format === "html"
      ? path.join(process.cwd(), path.basename(absInput, path.extname(absInput)) + ".html")
      : path.join(process.cwd(), path.basename(absInput, path.extname(absInput)) + ".pdf");

  const outPath = path.resolve(String(args.out || defaultOut));

  if (format === "html") {
    await fs.writeFile(outPath, html, "utf8");
    console.error(`Wrote HTML: ${outPath}`);
    return;
  }

  // PDF path: write an intermediate HTML file, then print it.
  const tmpHtmlPath = keepHtml
    ? outPath.replace(/\.pdf$/i, "") + ".html"
    : path.join(os.tmpdir(), `md-mermaid-${Date.now()}-${Math.random().toString(16).slice(2)}.html`);

  await fs.writeFile(tmpHtmlPath, html, "utf8");

  try {
    await renderPdfFromHtmlFile({
      htmlFilePath: tmpHtmlPath,
      outPdfPath: outPath,
      timeoutMs,
      pdfFormat,
      pdfMarginMm,
      chromePath,
    });
    console.error(`Wrote PDF:  ${outPath}`);
    if (keepHtml) console.error(`Kept HTML: ${tmpHtmlPath}`);
  } finally {
    if (!keepHtml) {
      await fs.unlink(tmpHtmlPath).catch(() => {});
    }
  }
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
