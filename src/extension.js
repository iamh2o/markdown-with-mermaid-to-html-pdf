import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import * as vscode from "vscode";

import { buildHtml, renderPdfFromHtmlFile } from "./exporter.js";

const CONFIG_SECTION = "markdownWithMermaidExport";

async function ensureInputFile(editor) {
  if (editor?.document?.uri?.scheme === "file") {
    if (editor.document.isDirty) {
      await editor.document.save();
    }
    return editor.document.uri.fsPath;
  }

  if (editor?.document?.isUntitled) {
    const saveUri = await vscode.window.showSaveDialog({
      saveLabel: "Save Markdown",
      filters: {
        Markdown: ["md", "markdown"],
      },
    });
    if (!saveUri) {
      return null;
    }
    await vscode.workspace.fs.writeFile(saveUri, Buffer.from(editor.document.getText(), "utf8"));
    return saveUri.fsPath;
  }

  const openUri = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      Markdown: ["md", "markdown"],
      All: ["*"],
    },
    openLabel: "Select Markdown File",
  });
  if (!openUri || openUri.length === 0) {
    return null;
  }
  return openUri[0].fsPath;
}

async function resolveOutputPath(inputPath, extension, label) {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const defaultPath = path.join(path.dirname(inputPath), `${baseName}.${extension}`);
  const saveUri = await vscode.window.showSaveDialog({
    saveLabel: label,
    defaultUri: vscode.Uri.file(defaultPath),
    filters: extension === "pdf" ? { PDF: ["pdf"] } : { HTML: ["html"] },
  });
  if (!saveUri) {
    return null;
  }
  return saveUri.fsPath;
}

async function exportMarkdown(format) {
  const editor = vscode.window.activeTextEditor;
  const inputPath = await ensureInputFile(editor);
  if (!inputPath) {
    return;
  }

  const outputPath = await resolveOutputPath(
    inputPath,
    format,
    format === "pdf" ? "Export PDF" : "Export HTML"
  );
  if (!outputPath) {
    return;
  }

  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const mermaidTheme = config.get("mermaidTheme", "default");
  const securityLevel = config.get("securityLevel", "strict");
  const pdfFormat = config.get("pdfFormat", "A4");
  const pdfMarginMm = config.get("pdfMarginMm", 15);
  const timeoutMs = config.get("timeoutMs", 60000);
  const keepHtml = config.get("keepHtml", false);
  const chromePath = config.get("chromePath", null);

  try {
    const markdown = await fs.readFile(inputPath, "utf8");
    const html = await buildHtml({
      inputPath,
      markdown,
      title: path.basename(inputPath),
      mermaidTheme,
      securityLevel,
    });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    if (format === "html") {
      await fs.writeFile(outputPath, html, "utf8");
      vscode.window.showInformationMessage(`Exported HTML to ${outputPath}`);
      return;
    }

    const tmpHtmlPath = keepHtml
      ? outputPath.replace(/\.pdf$/i, "") + ".html"
      : path.join(
          os.tmpdir(),
          `md-mermaid-${Date.now()}-${Math.random().toString(16).slice(2)}.html`
        );

    await fs.writeFile(tmpHtmlPath, html, "utf8");

    try {
      await renderPdfFromHtmlFile({
        htmlFilePath: tmpHtmlPath,
        outPdfPath: outputPath,
        timeoutMs,
        pdfFormat,
        pdfMarginMm,
        chromePath,
      });
      vscode.window.showInformationMessage(`Exported PDF to ${outputPath}`);
      if (keepHtml) {
        vscode.window.showInformationMessage(`Kept HTML at ${tmpHtmlPath}`);
      }
    } finally {
      if (!keepHtml) {
        await fs.unlink(tmpHtmlPath).catch(() => {});
      }
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Markdown Mermaid export failed: ${error?.message || String(error)}`
    );
  }
}

export function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("markdownWithMermaid.exportHtml", async () => {
      await exportMarkdown("html");
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("markdownWithMermaid.exportPdf", async () => {
      await exportMarkdown("pdf");
    })
  );
}

export function deactivate() {}
