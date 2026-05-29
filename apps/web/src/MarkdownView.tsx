import React from "react";

// ── Inline renderer ───────────────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Patterns: **bold**, *italic*, `code`
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={key++} style={{ color: "var(--text-1)", fontWeight: 700 }}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<em key={key++} style={{ fontStyle: "italic", color: "var(--text-2)" }}>{m[3]}</em>);
    } else if (m[4] !== undefined) {
      nodes.push(
        <code key={key++} style={{ fontFamily: "var(--font-mono)", fontSize: "0.88em", background: "var(--bg-4)", padding: "1px 5px", borderRadius: 3, color: "var(--accent)", border: "1px solid var(--border)" }}>
          {m[4]}
        </code>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// ── JSON syntax highlighter ───────────────────────────────────────────────────
function JsonHighlight({ code }: { code: string }) {
  // Colorize JSON keys, strings, numbers, booleans/null
  const html = code
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"([^"\\]*(\\.[^"\\]*)*)"\s*:/g, '<span class="json-key">"$1"</span>:')
    .replace(/:\s*"([^"\\]*(\\.[^"\\]*)*)"/g, ': <span class="json-str">"$1"</span>')
    .replace(/:\s*(-?\d+(\.\d+)?([eE][+-]?\d+)?)/g, ': <span class="json-num">$1</span>')
    .replace(/:\s*(true|false|null)/g, ': <span class="json-kw">$1</span>');

  return (
    <>
      <style>{`
        .json-key { color: #60a5fa; }
        .json-str { color: #4ade80; }
        .json-num { color: #f59e0b; }
        .json-kw  { color: #a78bfa; }
      `}</style>
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

// ── Block parser ──────────────────────────────────────────────────────────────
type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "hr" }
  | { type: "code"; lang: string; code: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "blockquote"; text: string }
  | { type: "p"; text: string }
  | { type: "blank" };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim().toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i] ?? "")) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    // Headings
    if (/^### /.test(line)) { blocks.push({ type: "h3", text: line.slice(4) }); i++; continue; }
    if (/^## /.test(line))  { blocks.push({ type: "h2", text: line.slice(3) }); i++; continue; }
    if (/^# /.test(line))   { blocks.push({ type: "h1", text: line.slice(2) }); i++; continue; }

    // HR
    if (/^---+$/.test(line.trim())) { blocks.push({ type: "hr" }); i++; continue; }

    // Blockquote
    if (/^> /.test(line)) { blocks.push({ type: "blockquote", text: line.slice(2) }); i++; continue; }

    // Unordered list
    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").slice(2));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\d+\. /, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Blank line
    if (line.trim() === "") { blocks.push({ type: "blank" }); i++; continue; }

    // Paragraph (collect consecutive non-special lines)
    const pLines: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !/^[#>*\-`]/.test(lines[i] ?? "") &&
      !/^\d+\. /.test(lines[i] ?? "") &&
      !/^---/.test(lines[i] ?? "")
    ) {
      pLines.push(lines[i] ?? "");
      i++;
    }
    if (pLines.length > 0) blocks.push({ type: "p", text: pLines.join(" ") });
  }

  return blocks;
}

// ── Renderer ──────────────────────────────────────────────────────────────────
function renderBlock(block: Block, idx: number): React.ReactNode {
  switch (block.type) {
    case "h1": return (
      <h2 key={idx} style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)", margin: "20px 0 10px", paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
        {renderInline(block.text)}
      </h2>
    );
    case "h2": return (
      <h3 key={idx} style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: "16px 0 8px" }}>
        {renderInline(block.text)}
      </h3>
    );
    case "h3": return (
      <h4 key={idx} style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", margin: "12px 0 6px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
        {renderInline(block.text)}
      </h4>
    );
    case "hr": return (
      <hr key={idx} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />
    );
    case "code": {
      const isJson = block.lang === "json" || (block.lang === "" && /^\s*[{[]/.test(block.code));
      return (
        <div key={idx} style={{ margin: "10px 0", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}>
          {block.lang && (
            <div style={{ padding: "3px 10px", background: "var(--bg-4)", borderBottom: "1px solid var(--border)", fontSize: 10, color: "var(--text-3)", fontWeight: 600, letterSpacing: "0.4px", textTransform: "uppercase" }}>
              {block.lang}
            </div>
          )}
          <pre style={{ margin: 0, padding: "12px 14px", background: "var(--bg-3)", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7, overflowX: "auto", color: "var(--text-1)" }}>
            {isJson ? <JsonHighlight code={block.code} /> : block.code}
          </pre>
        </div>
      );
    }
    case "ul": return (
      <ul key={idx} style={{ margin: "8px 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
        {block.items.map((item, j) => (
          <li key={j} style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
            {renderInline(item)}
          </li>
        ))}
      </ul>
    );
    case "ol": return (
      <ol key={idx} style={{ margin: "8px 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
        {block.items.map((item, j) => (
          <li key={j} style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
            {renderInline(item)}
          </li>
        ))}
      </ol>
    );
    case "blockquote": return (
      <div key={idx} style={{ margin: "8px 0", padding: "8px 12px", borderLeft: "3px solid var(--accent)", background: "var(--bg-3)", borderRadius: "0 4px 4px 0", fontSize: 13, color: "var(--text-2)", fontStyle: "italic" }}>
        {renderInline(block.text)}
      </div>
    );
    case "p": return (
      <p key={idx} style={{ margin: "6px 0", fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
        {renderInline(block.text)}
      </p>
    );
    case "blank": return null;
    default: return null;
  }
}

// ── Public component ──────────────────────────────────────────────────────────
export function MarkdownView({ markdown, style }: { markdown: string; style?: React.CSSProperties }) {
  const blocks = parseBlocks(markdown);
  return (
    <div style={{ lineHeight: 1.6, ...style }}>
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  );
}
