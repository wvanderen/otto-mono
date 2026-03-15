import { copyFileSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const sourcePath = resolve(rootDir, "packages/otto/src/otto.ts");
const targetPath = resolve(rootDir, "examples/pi-extension/otto.ts");
const projectLocalTargetPath = resolve(rootDir, ".pi/extensions/otto.ts");
const sourceCoreDir = resolve(rootDir, "packages/otto/src/core");
const targetCoreDir = resolve(rootDir, "examples/pi-extension/core");
const projectLocalCoreDir = resolve(rootDir, ".pi/extensions/core");
const sourceRuntimeDir = resolve(rootDir, "packages/otto/src/runtime");
const targetRuntimeDir = resolve(rootDir, "examples/pi-extension/runtime");
const projectLocalRuntimeDir = resolve(rootDir, ".pi/extensions/runtime");
const sourcePiAdapterDir = resolve(rootDir, "packages/otto/src/pi-adapter");
const targetPiAdapterDir = resolve(rootDir, "examples/pi-extension/pi-adapter");
const projectLocalPiAdapterDir = resolve(rootDir, ".pi/extensions/pi-adapter");
const resultHelperSourcePath = resolve(
  rootDir,
  "packages/otto/src/otto-result.mjs",
);
const resultHelperTargetPath = resolve(
  rootDir,
  "examples/pi-extension/otto-result.mjs",
);
const projectLocalResultHelperTargetPath = resolve(
  rootDir,
  ".pi/extensions/otto-result.mjs",
);
const skillSourcePath = resolve(rootDir, "packages/otto/skills/otto/SKILL.md");
const skillTargetPath = resolve(
  rootDir,
  "examples/pi-extension/skills/otto/SKILL.md",
);

copyFileSync(sourcePath, targetPath);
mkdirSync(resolve(projectLocalTargetPath, ".."), { recursive: true });
copyFileSync(sourcePath, projectLocalTargetPath);

rmSync(targetCoreDir, { force: true, recursive: true });
rmSync(projectLocalCoreDir, { force: true, recursive: true });
cpSync(sourceCoreDir, targetCoreDir, { recursive: true });
cpSync(sourceCoreDir, projectLocalCoreDir, { recursive: true });

rmSync(targetRuntimeDir, { force: true, recursive: true });
rmSync(projectLocalRuntimeDir, { force: true, recursive: true });
cpSync(sourceRuntimeDir, targetRuntimeDir, { recursive: true });
cpSync(sourceRuntimeDir, projectLocalRuntimeDir, { recursive: true });

rmSync(targetPiAdapterDir, { force: true, recursive: true });
rmSync(projectLocalPiAdapterDir, { force: true, recursive: true });
cpSync(sourcePiAdapterDir, targetPiAdapterDir, { recursive: true });
cpSync(sourcePiAdapterDir, projectLocalPiAdapterDir, { recursive: true });

copyFileSync(resultHelperSourcePath, resultHelperTargetPath);
copyFileSync(resultHelperSourcePath, projectLocalResultHelperTargetPath);
mkdirSync(resolve(skillTargetPath, ".."), { recursive: true });
copyFileSync(skillSourcePath, skillTargetPath);
