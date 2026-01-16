# Markdown Mermaid Export (VS Code Extension)
Export Markdown files with Mermaid diagrams to HTML or PDF directly from VS Code.

## Features
- Export the current Markdown file to HTML with rendered Mermaid diagrams.
- Export the current Markdown file to PDF via Puppeteer.
- Configure Mermaid theme/security and PDF settings in VS Code settings.

## Usage (VS Code)
1. Open a Markdown file.
2. Run **“Markdown Mermaid: Export to HTML”** or **“Markdown Mermaid: Export to PDF”** from the Command Palette.
3. Choose an output file location.

### Settings
Configure in `settings.json` under the `markdownWithMermaidExport` prefix:
- `markdownWithMermaidExport.mermaidTheme`
- `markdownWithMermaidExport.securityLevel`
- `markdownWithMermaidExport.pdfFormat`
- `markdownWithMermaidExport.pdfMarginMm`
- `markdownWithMermaidExport.timeoutMs`
- `markdownWithMermaidExport.keepHtml`
- `markdownWithMermaidExport.chromePath`

## Chrome Extension
A lightweight Chrome extension is available in the `chrome-extension/` folder. It detects Mermaid code fences on web pages and renders diagrams in-place.

### Load in Chrome
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `chrome-extension/` folder.
4. Visit any page that contains Mermaid markdown (for example, a GitHub README with a Mermaid code block).

### Supported Mermaid Markup
The content script looks for common Mermaid markdown forms:
- ` ```mermaid ... ``` ` fenced blocks.
- `<pre><code class="language-mermaid">` / `<code class="lang-mermaid">`.
- `<pre class="mermaid">` or `<code class="mermaid">`.

## CLI (optional)
The original CLI script still works for direct usage.

### To HTML
```bash
bin/md-mermaid-export.mjs example/test.md --format html --out example/test.html
```

### TO PDF
```bash
bin/md-mermaid-export.mjs example/test.md --format pdf --out example/test.pdf
```

### Other Knobs
```bash

./md-mermaid-export.mjs README.md --format pdf --out README.pdf \
  --mermaid-theme dark \
  --security strict \
  --pdf-format Letter \
  --pdf-margin 12 \
  --timeout-ms 120000 \
  --keep-html

```

### Use Server Chrome/Chromium

```bash
./md-mermaid-export.mjs README.md --format pdf --out README.pdf --chrome /usr/bin/chromium-browser
```
