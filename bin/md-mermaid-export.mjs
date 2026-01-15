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

import { buildHtml, renderPdfFromHtmlFile } from "../src/exporter.js";

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
