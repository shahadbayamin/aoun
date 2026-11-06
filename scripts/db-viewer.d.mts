export function createDbViewerListener(opts: {
  connectionString?: string;
  port?: number;
  log?: (...a: unknown[]) => void;
  checkOrigin?: boolean;
  poolMax?: number;
}): Promise<{ listener: (req: unknown, res: unknown) => Promise<void>; pool: { end(): Promise<void> } }>;
export function startDbViewer(opts: { connectionString?: string; port?: number; log?: (...a: unknown[]) => void }): Promise<{ close(): void }>;
