import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export class FileLogSink {
  private bytesWritten = 0;
  private disabled = false;

  constructor(private readonly filePath: string, private readonly maxBytes = DEFAULT_MAX_BYTES) {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, "");
    } catch {
      this.disabled = true;
    }
  }

  write(line: string): void {
    if (this.disabled) return;
    const bytes = Buffer.byteLength(line, "utf8");
    if (this.bytesWritten + bytes > this.maxBytes) this.rotate();
    try {
      appendFileSync(this.filePath, line);
      this.bytesWritten += bytes;
    } catch {
      this.disabled = true;
    }
  }

  private rotate(): void {
    try {
      const rotated = rotatedPath(this.filePath);
      if (existsSync(rotated)) rmSync(rotated, { force: true });
      renameSync(this.filePath, rotated);
      writeFileSync(this.filePath, "");
      this.bytesWritten = 0;
    } catch {
      this.disabled = true;
    }
  }
}

function rotatedPath(filePath: string): string {
  return filePath.endsWith(".ndjson") ? `${filePath.slice(0, -".ndjson".length)}.1.ndjson` : `${filePath}.1`;
}
