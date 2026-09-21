import * as fs from "fs";
import path from "path";

/**
 * writeFileSync truncates the target before writing, so an interrupted write
 * would leave the 21 MB index corrupted. Write to a temp file next to it and
 * rename: on the same filesystem that is atomic — old content or new, never
 * a partial state.
 */
export function writeJsonAtomic(
  relativePath: string,
  data: unknown,
  space?: number,
): void {
  const target = path.join(process.cwd(), relativePath);
  const temp = `${target}.tmp-${process.pid}`;

  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.writeFileSync(temp, JSON.stringify(data, null, space));
    fs.renameSync(temp, target);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

export function readJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8"),
  ) as T;
}
