import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";

const require = createRequire(import.meta.url);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function buildHtml({
  inputPath,
  markdown,
  title,
  mermaidTheme = "default",
  securityLevel = "strict",
}) {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  }).use(taskLists, { enabled: true, label: true });

  const defaultFence =
    md.renderer.rules.fence ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || "").trim().split(/\s+/g)[0];
    if (info === "mermaid") {
      return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>\n`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };

  const body = md.render(markdown);

  let githubCss = "";
  try {
    const ghCssPath = require.resolve("github-markdown-css/github-markdown-light.css");
    githubCss = (await fs.readFile(ghCssPath, "utf8")) || "";
  } catch {
    githubCss = "";
  }

  let mermaidJs = "";
  try {
    const mermaidPath = require.resolve("mermaid/dist/mermaid.min.js");
    mermaidJs = (await fs.readFile(mermaidPath, "utf8")) || "";
  } catch (error) {
    throw new Error(
      `Could not find Mermaid runtime JS. Is 'mermaid' installed? Original error: ${
        error?.message || error
      }`
    );
  }

  const baseDir = path.dirname(path.resolve(inputPath));
  const baseHref = pathToFileURL(baseDir + path.sep).href;

  const extraCss = `
    body { margin: 0; }
    .markdown-body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 24px;
    }

    .mermaid svg { max-width: 100%; height: auto; }

    @media print {
      .markdown-body { max-width: none; padding: 0; }
      a { color: inherit; text-decoration: none; }
    }
  `;

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

        if (typeof mermaid.initialize === "function") {
          mermaid.initialize(init);
        } else if (mermaid.mermaidAPI && typeof mermaid.mermaidAPI.initialize === "function") {
          mermaid.mermaidAPI.initialize(init);
        }

        var p;
        if (typeof mermaid.run === "function") {
          p = mermaid.run({ querySelector: ".mermaid" });
        } else if (typeof mermaid.init === "function") {
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

export async function renderPdfFromHtmlFile({
  htmlFilePath,
  outPdfPath,
  timeoutMs,
  pdfFormat,
  pdfMarginMm,
  chromePath,
}) {
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch (error) {
    throw new Error(
      `PDF requested but puppeteer is not available. Install it: npm i puppeteer\nOriginal error: ${
        error?.message || error
      }`
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
