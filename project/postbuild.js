/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
import process from "process";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceDir = path.resolve(__dirname, "../dist");
const devConfigPath = path.resolve(__dirname, "../dev.json");

/**
 * Collect postbuild target package roots. Each target should contain or receive
 * a `dist/` directory for the built library.
 *
 * Priority:
 * 1. CLI `--target-dir` (repeatable)
 * 2. env `NVL_POSTBUILD_TARGET_DIRS` (comma-separated)
 * 3. local `dev.json`
 */
function collectTargetDirs() {
    const fromCli = [];
    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--target-dir" && argv[i + 1]) {
            fromCli.push(argv[i + 1]);
            i++;
        }
    }
    if (fromCli.length) {
        return fromCli;
    }

    const fromEnv = process.env.NVL_POSTBUILD_TARGET_DIRS;
    if (fromEnv) {
        const parts = fromEnv.split(",").map(s => s.trim()).filter(Boolean);
        if (parts.length) {
            return parts;
        }
    }

    if (fs.existsSync(devConfigPath)) {
        try {
            const devConfig = JSON.parse(fs.readFileSync(devConfigPath, "utf8"));
            if (devConfig.targetDirs && Array.isArray(devConfig.targetDirs)) {
                return devConfig.targetDirs;
            }
            if (devConfig.targetDir) {
                return [devConfig.targetDir];
            }
        } catch (e) {
            console.error(`Error reading dev.json: ${e}`);
            process.exit(1);
        }
    }

    return [];
}

const targetDirs = collectTargetDirs();

if (targetDirs.length === 0) {
    console.log("postbuild: no target directories (set dev.json, NVL_POSTBUILD_TARGET_DIRS, or use --target-dir). Skipping copy.");
    process.exit(0);
}

let successCount = 0;
let errorCount = 0;

for (const targetDir of targetDirs) {
    const fullTargetDir = path.join(targetDir, "dist");

    fs.ensureDirSync(fullTargetDir);

    try {
        fs.copySync(sourceDir, fullTargetDir, { overwrite: true });
        console.log(`Copied build files to ${fullTargetDir}`);
        successCount++;
    } catch (err) {
        console.error(`Error copying build files to ${fullTargetDir}: ${err}`);
        errorCount++;
    }
}

console.log("\nCopy operation completed:");
console.log(`  Success: ${successCount} directories`);
if (errorCount > 0) {
    console.log(`  Errors: ${errorCount} directories`);
    process.exit(1);
}
