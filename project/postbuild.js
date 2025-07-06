/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
const process = require("process");
const fs = require("fs-extra");
const path = require("path");

// Read target directories from dev config
const devConfigPath = path.resolve(__dirname, "../dev.json");
let targetDirs = [];
try {
    const devConfig = JSON.parse(fs.readFileSync(devConfigPath, "utf8"));
    
    // Support both single targetDir and multiple targetDirs
    if (devConfig.targetDirs && Array.isArray(devConfig.targetDirs)) {
        targetDirs = devConfig.targetDirs;
    } else if (devConfig.targetDir) {
        targetDirs = [devConfig.targetDir];
    } else {
        throw new Error("Neither targetDir nor targetDirs found in dev.json");
    }
    
    if (targetDirs.length === 0) {
        throw new Error("No target directories specified in dev.json");
    }
} catch (err) {
    console.error(`Error reading dev.json: ${err}`);
    process.exit(1);
}

const sourceDir = path.resolve(__dirname, "../dist");

// Copy files to all target directories
let successCount = 0;
let errorCount = 0;

for (const targetDir of targetDirs) {
    const fullTargetDir = path.join(targetDir, "dist");
    
    // Ensure target directory exists
    fs.ensureDirSync(fullTargetDir);
    
    // Copy files from source to target, overwriting if exists
    try {
        fs.copySync(sourceDir, fullTargetDir, { overwrite: true });
        console.log(`✓ Successfully copied build files to ${fullTargetDir}`);
        successCount++;
    } catch (err) {
        console.error(`✗ Error copying build files to ${fullTargetDir}: ${err}`);
        errorCount++;
    }
}

// Summary
console.log(`\nCopy operation completed:`);
console.log(`  Success: ${successCount} directories`);
if (errorCount > 0) {
    console.log(`  Errors: ${errorCount} directories`);
    process.exit(1);
}





