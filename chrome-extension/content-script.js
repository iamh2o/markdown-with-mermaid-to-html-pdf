(() => {
  const MERMAID_SELECTORS = [
    "pre.mermaid",
    "code.mermaid",
    "pre > code.language-mermaid",
    "code.language-mermaid",
    "pre > code.lang-mermaid",
    "code.lang-mermaid",
    "pre > code[data-language='mermaid']",
    "pre > code[data-lang='mermaid']",
    "code[data-language='mermaid']",
    "code[data-lang='mermaid']"
  ];

  const MERMAID_FENCE_RE = /^```mermaid\s*([\s\S]*?)```\s*$/i;

  let mermaidReady = null;
  let runScheduled = false;
  let contextTarget = null;

  function ensureMermaidLoaded() {
    if (window.mermaid) {
      return Promise.resolve(window.mermaid);
    }

    if (mermaidReady) {
      return mermaidReady;
    }

    mermaidReady = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("mermaid.min.js");
      script.onload = () => resolve(window.mermaid);
      script.onerror = () => reject(new Error("Failed to load mermaid library."));
      document.documentElement.appendChild(script);
    });

    return mermaidReady;
  }

  function ensureStyles() {
    if (document.getElementById("mermaid-markdown-renderer-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "mermaid-markdown-renderer-style";
    style.textContent = `
      .mermaid svg {
        max-width: 100%;
        height: auto;
      }
    `;
    document.head.appendChild(style);
  }

  function replaceWithMermaid(node, source) {
    if (!source || !source.trim()) {
      return;
    }

    const container = document.createElement("div");
    container.className = "mermaid";
    container.dataset.mermaidRenderer = "pending";
    container.textContent = source.trim();

    node.replaceWith(container);
  }

  function promoteToMermaid(node, source) {
    if (!node || !source || !source.trim()) {
      return;
    }

    node.classList.add("mermaid");
    node.dataset.mermaidRenderer = "pending";
    node.textContent = source.trim();
  }

  function processCodeBlocks() {
    const nodes = document.querySelectorAll(MERMAID_SELECTORS.join(","));
    nodes.forEach((node) => {
      if (node.dataset.mermaidRenderer === "done") {
        return;
      }

      const text = node.textContent || "";
      const parentPre = node.tagName.toLowerCase() === "code" ? node.closest("pre") : null;
      const target = parentPre || node;

      if (MERMAID_FENCE_RE.test(text.trim())) {
        const match = text.trim().match(MERMAID_FENCE_RE);
        replaceWithMermaid(target, match ? match[1] : "");
        return;
      }

      replaceWithMermaid(target, text);
    });
  }

  function processFencedMarkdown() {
    const preBlocks = document.querySelectorAll("pre");
    preBlocks.forEach((pre) => {
      if (pre.dataset.mermaidRenderer === "done") {
        return;
      }

      const text = pre.textContent || "";
      if (!text.includes("```mermaid")) {
        return;
      }

      const match = text.trim().match(MERMAID_FENCE_RE);
      if (!match) {
        return;
      }

      replaceWithMermaid(pre, match[1]);
    });
  }

  async function renderMermaid() {
    if (runScheduled) {
      return;
    }

    runScheduled = true;
    queueMicrotask(async () => {
      runScheduled = false;

      processCodeBlocks();
      processFencedMarkdown();

      const nodes = document.querySelectorAll(".mermaid:not([data-mermaid-renderer='done'])");
      if (!nodes.length) {
        return;
      }

      ensureStyles();

      try {
        const mermaid = await ensureMermaidLoaded();
        if (!mermaid) {
          return;
        }

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "default"
        });

        await mermaid.run({ querySelector: ".mermaid" });
        nodes.forEach((node) => {
          node.dataset.mermaidRenderer = "done";
        });
      } catch (error) {
        console.warn("Mermaid renderer failed to initialize:", error);
      }
    });
  }

  const observer = new MutationObserver(() => {
    renderMermaid();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  renderMermaid();

  document.addEventListener("contextmenu", (event) => {
    const target = event.target instanceof Element ? event.target.closest("div") : null;
    if (!target) {
      contextTarget = null;
      return;
    }

    contextTarget = target;
  });

  document.addEventListener("keydown", (event) => {
    if (!contextTarget) {
      return;
    }

    if (event.key.toLowerCase() !== "m" || !event.altKey) {
      return;
    }

    const source = contextTarget.textContent || "";
    if (!source.trim()) {
      return;
    }

    promoteToMermaid(contextTarget, source);
    renderMermaid();
  });
})();
