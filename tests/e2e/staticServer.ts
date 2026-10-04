import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** Minimal static server whose root can be switched, to "deploy" a new version under the same origin. */
export class SwitchableServer {
  private root: string;
  private server: Server | null = null;

  constructor(root: string, readonly port: number) {
    this.root = root;
  }

  deploy(root: string): void {
    this.root = root;
  }

  get url(): string {
    return `http://localhost:${this.port}`;
  }

  start(): Promise<void> {
    this.server = createServer((request, response) => {
      const path = normalize(decodeURIComponent((request.url ?? '/').split('?')[0]!)).replace(/^(\.\.[/\\])+/, '');
      let file = join(this.root, path);
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(this.root, 'index.html'); // SPA fallback
      response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(readFileSync(file));
    });
    return new Promise((resolve) => this.server!.listen(this.port, resolve));
  }

  stop(): Promise<void> {
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }
}
