# Markdown Mermaid Export (VS Code Extension)
Export Markdown files with Mermaid diagrams to HTML or PDF directly from VS Code.

## ENVIRONMENT

### conda

```bash

conda create -n MMDMD -c conda-forge nodejs
conda activate MMDMD
npm install markdown-it
```

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
