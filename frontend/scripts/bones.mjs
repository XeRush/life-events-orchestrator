// Regenerates skeleton bones: starts a throwaway Vite dev server, lets boneyard-js capture every <Bones> fixture on
// the dev-only /__bones page at each breakpoint in boneyard.config.json, writes src/bones/*.bones.json,
// then shuts the server down. Run after changing the layout of any skeleton-wrapped component: `npm run bones`.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { createServer } from "vite";

const PORT = Number(process.env.BONES_PORT ?? 5199);

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: "warn" });
await server.listen();
const url = `http://localhost:${PORT}/__bones`;
console.log(`bones: capturing ${url}`);

const code = await new Promise((resolve) => {
  const child = spawn("npx", ["boneyard-js", "build", url, "--force"], { stdio: "inherit", shell: process.platform === "win32" });
  child.on("exit", (c) => resolve(c ?? 1));
});

await server.close();
// The app loads each skeleton's JSON lazily (src/components/ui/Bones.tsx), so the all-in-one registry is not used.
rmSync(new URL("../src/bones/registry.ts", import.meta.url), { force: true });
process.exit(code);
