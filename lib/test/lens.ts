import { getIndex } from "../api/store.ts";

const lens = getIndex().map((c) => c.paragraphIds.length);
console.log("min", Math.min(...lens), "max", Math.max(...lens));
