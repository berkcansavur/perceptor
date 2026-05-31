import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, createNonce, renderWebviewHtml } from "../src/webviewHtml";

const TEMPLATE = [
  "<!doctype html>",
  '<html><head><link rel="stylesheet" href="style.css" /></head>',
  '<body><div id="app"></div><script src="app.js"></script></body></html>',
].join("\n");

describe("createNonce", () => {
  it("returns a 24-char base36 string by default", () => {
    expect(createNonce()).toMatch(/^[0-9a-z]{24}$/);
  });

  it("honors a custom length", () => {
    expect(createNonce(8)).toHaveLength(8);
  });

  it("is different across calls", () => {
    expect(createNonce()).not.toEqual(createNonce());
  });
});

describe("buildContentSecurityPolicy", () => {
  it("locks default-src and scopes script to the nonce", () => {
    const csp = buildContentSecurityPolicy("vscode-resource:", "abc123");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'nonce-abc123'");
    expect(csp).toContain("style-src vscode-resource: 'unsafe-inline'");
    expect(csp).toContain("img-src vscode-resource: data:");
  });
});

describe("renderWebviewHtml", () => {
  const html = renderWebviewHtml({
    template: TEMPLATE,
    cspSource: "vscode-resource:",
    nonce: "nonce123",
    styleUri: "https://host/style.css",
    scriptUri: "https://host/app.js",
  });

  it("injects the CSP meta tag", () => {
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("script-src 'nonce-nonce123'");
  });

  it("rewrites asset references to the resolved webview URIs", () => {
    expect(html).toContain('href="https://host/style.css"');
    expect(html).toContain('<script nonce="nonce123" src="https://host/app.js"></script>');
  });

  it("leaves no raw relative asset references", () => {
    expect(html).not.toContain('href="style.css"');
    expect(html).not.toContain('<script src="app.js"></script>');
  });
});
