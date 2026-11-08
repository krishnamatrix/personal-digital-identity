# Dependency Maintenance

## November 2026 maintenance

Next.js and `eslint-config-next` are aligned at `15.5.29`. React and React DOM remain at `19.1.1`, which satisfies Next.js 15.5.29's React 19 peer range. `pnpm-lock.yaml` was regenerated with pnpm and verified with `pnpm install --frozen-lockfile`.

The project uses ESLint's flat config. ESLint 10 is the currently supported major, but `eslint-config-next@15.5.29` declares an ESLint peer range ending at v9. ESLint was updated to the final v9 release, `9.39.5`, to stay within that supported peer range. Moving to ESLint 10 requires a Next.js ESLint config that accepts v10 or a separately validated config migration; that would require a broader framework/config compatibility change.

The pnpm-only `strict-peer-dependencies` setting was removed from `.npmrc` and set to `strictPeerDependencies: true` in `pnpm-workspace.yaml`. Strict peer checking remains enabled, and npm no longer sees the pnpm setting as an unknown project configuration key.

## Package build scripts

The package scripts were reviewed individually and configured through `allowBuilds` in `pnpm-workspace.yaml`:

| Package              | Decision | Reason                                                                                                                                            |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@tailwindcss/oxide` | Allowed  | Its reviewed `postinstall` selects the native Tailwind engine artifact required by the project's Tailwind PostCSS toolchain.                      |
| `esbuild`            | Allowed  | Its reviewed `postinstall` selects/verifies the platform binary used by Vite/Vitest and build tooling.                                            |
| `sharp`              | Blocked  | Its install script checks/downloads native binaries for optional Next.js image optimization. The application does not currently use `next/image`. |

No blanket build-script approval is configured.
