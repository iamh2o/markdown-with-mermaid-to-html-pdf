# markdown-with-mermaid-to-html-pdf
Script to take a markdown file with embedded mermaid and export a html or pdf file with the mermaid rendered inline w/the markdown.


# Prerequisites

```bash
mkdir md-mermaid-export && cd md-mermaid-export
npm init -y
npm i markdown-it markdown-it-task-lists mermaid puppeteer github-markdown-css
```

# Example 

```bash
bin/./md-mermaid-export.mjs example/test.md --format html --out example/test.html

```
