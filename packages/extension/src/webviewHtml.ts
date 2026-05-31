// Pure webview-HTML assembly: no VS Code, no filesystem. The panel supplies the
// template and resolved URIs; everything here is deterministic and unit-testable.

const NONCE_LENGTH = 24;
const STYLE_LINK = '<link rel="stylesheet" href="style.css" />';
const SCRIPT_TAG = '<script src="app.js"></script>';

export type WebviewHtmlOptions = {
  readonly template: string;
  readonly cspSource: string;
  readonly nonce: string;
  readonly styleUri: string;
  readonly scriptUri: string;
}

export function createNonce(length: number = NONCE_LENGTH): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 36).toString(36)).join("");
}

export function buildContentSecurityPolicy(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${cspSource}`,
    `img-src ${cspSource} data:`,
  ].join("; ");
}

export function renderWebviewHtml(options: WebviewHtmlOptions): string {
  const csp = buildContentSecurityPolicy(options.cspSource, options.nonce);
  return options.template
    .replace(
      STYLE_LINK,
      `<meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <link rel="stylesheet" href="${options.styleUri}" />`
    )
    .replace(SCRIPT_TAG, `<script nonce="${options.nonce}" src="${options.scriptUri}"></script>`);
}
