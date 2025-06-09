/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
const process = require("process");
const fs = require("fs-extra");
const path = require("path");

// Read target directory from dev config
const devConfigPath = path.resolve(__dirname, "../dev.json");
let targetRoot;
try {
    const devConfig = JSON.parse(fs.readFileSync(devConfigPath, "utf8"));
    targetRoot = devConfig.targetDir;
    if (!targetRoot) {
        throw new Error("targetDir not found in dev.json");
    }
} catch (err) {
    console.error(`Error reading dev.json: ${err}`);
    process.exit(1);
}

const sourceDir = path.resolve(__dirname, "../dist");
const targetDir = path.join(targetRoot, "dist");

// Ensure target directory exists
fs.ensureDirSync(targetDir);

// Copy files from source to target, overwriting if exists
try {
    fs.copySync(sourceDir, targetDir, { overwrite: true });
    console.log(`Successfully copied build files from ${sourceDir} to ${targetDir}`);
} catch (err) {
    console.error(`Error copying build files: ${err}`);
    process.exit(1);
}





