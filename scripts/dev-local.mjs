import { accessSync, constants, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localEnvFile = path.join(repositoryRoot, ".env.local");

try {
  if (!statSync(localEnvFile).isFile()) {
    throw new Error("not a file");
  }
  accessSync(localEnvFile, constants.R_OK);
} catch {
  console.error(
    "Local development needs a readable .env.local in the repository root. Create it from .env.example, then run npm run dev:local again.",
  );
  process.exit(1);
}

const nextCli = path.join(repositoryRoot, "node_modules", "next", "dist", "bin", "next");
const server = spawn(process.execPath, [nextCli, "dev"], {
  cwd: repositoryRoot,
  env: process.env,
  stdio: "inherit",
});

let receivedSignal;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    receivedSignal = signal;
    server.kill(signal);
  });
}

server.on("error", () => {
  console.error(
    "Could not start the local development server. Install the project dependencies and try again.",
  );
  process.exitCode = 1;
});

server.on("exit", (code) => {
  if (receivedSignal) {
    process.exitCode = receivedSignal === "SIGINT" ? 130 : 143;
    return;
  }
  process.exitCode = code ?? 1;
});
