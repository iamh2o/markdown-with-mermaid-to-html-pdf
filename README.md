# markdown-with-mermaid-to-html-pdf
Script to take a markdown file with embedded mermaid and export a html or pdf file with the mermaid rendered inline w/the markdown.


# Prerequisites

```bash
mkdir md-mermaid-export && cd md-mermaid-export
npm init -y
npm i markdown-it markdown-it-task-lists mermaid puppeteer github-markdown-css
```

# Example 

## To HTML
```bash
bin/md-mermaid-export.mjs example/test.md --format html --out example/test.html
```

## TO PDF
```bash
bin/md-mermaid-export.mjs example/test.md --format pdf --out example/test.pdf
```

## Other Knobs
```bash

./md-mermaid-export.mjs README.md --format pdf --out README.pdf \
  --mermaid-theme dark \
  --security strict \
  --pdf-format Letter \
  --pdf-margin 12 \
  --timeout-ms 120000 \
  --keep-html

```

## Use Server Chrome/Chromium

```bash
./md-mermaid-export.mjs README.md --format pdf --out README.pdf --chrome /usr/bin/chromium-browser
```
