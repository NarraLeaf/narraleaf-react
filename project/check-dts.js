/* eslint-disable no-undef */
/**
 * Typecheck the emitted declarations the way a strict consumer does.
 *
 * `stripInternal` deletes an `@internal` declaration from the `.d.ts` but leaves every
 * reference to it in place, and `tsc-alias` silently gives up on a path alias it cannot
 * resolve in the output. Both produce declaration files that name things they do not
 * declare, and both are invisible under `skipLibCheck: true` -- which is what almost
 * everyone runs. So run the check nobody else will: `skipLibCheck: false` over the
 * declarations that actually ship.
 */
import fs from "fs";
import path from "path";
import process from "process";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const configPath = path.join(root, "tsconfig.dts-check.json");

if (!fs.existsSync(dist)) {
    console.error("check-dts: dist/ not found. Emit declarations first (npm run postbuild).");
    process.exit(1);
}

// `files` in package.json ships dist/ minus the test declarations, so check exactly that.
fs.writeFileSync(configPath, JSON.stringify({
    compilerOptions: {
        noEmit: true,
        skipLibCheck: false,
        strict: true,
        target: "ES6",
        module: "esnext",
        moduleResolution: "node",
        lib: ["dom", "dom.iterable", "esnext"],
        jsx: "preserve",
        esModuleInterop: true,
        resolveJsonModule: true,
        forceConsistentCasingInFileNames: true,
        types: ["node"],
        typeRoots: ["node_modules/@types", "src/types"],
    },
    include: ["dist/**/*.d.ts"],
    exclude: ["dist/**/*.test.d.ts"],
}, null, 4) + "\n");

try {
    execFileSync(
        process.execPath,
        [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", configPath],
        { cwd: root, stdio: "inherit" }
    );
    console.log("check-dts: ok - every shipped declaration typechecks with skipLibCheck disabled.");
} catch {
    console.error("");
    console.error("check-dts: FAILED - dist/**/*.d.ts does not typecheck with skipLibCheck disabled.");
    console.error("A declaration references a name the emitted output does not declare. Usual causes:");
    console.error("  - an @internal type reachable from a public signature (stripInternal deletes the");
    console.error("    declaration, the reference survives) -- drop the @internal marker;");
    console.error("  - a tsconfig `paths` alias tsc-alias could not resolve under dist/, so it left the");
    console.error("    bare alias in the output -- point the alias at an extensionless path.");
    process.exitCode = 1;
} finally {
    fs.rmSync(configPath, { force: true });
}

/**
 * The other half of the same seam, and it fails the opposite way round.
 *
 * built-in.js must keep importing the engine by the package's own name so it loads the sibling
 * main.js instead of inlining a second copy. tsc-alias runs over dist/ and would happily rewrite
 * that import to a relative path with no `.js` beside it -- a bundle that resolves to nothing at
 * runtime, while every declaration still typechecks. `tsc-alias.fileExtensions.inputGlob` in
 * tsconfig.json is what confines it to declarations; this is the assertion that says so out loud.
 */
const bundle = path.join(dist, "built-in.js");
if (!fs.existsSync(bundle)) {
    console.log("check-dts: note - dist/built-in.js absent, skipping the bundle check (declaration-only build).");
} else if (/from\s*["']narraleaf-react["']/.test(fs.readFileSync(bundle, "utf8"))) {
    console.log("check-dts: ok - built-in.js still loads the engine from the package entry.");
} else {
    console.error("");
    console.error("check-dts: FAILED - dist/built-in.js no longer imports \"narraleaf-react\".");
    console.error("Something rewrote the self-reference, almost certainly tsc-alias reaching past the");
    console.error("declarations. Restore `tsc-alias.fileExtensions.inputGlob` in tsconfig.json.");
    process.exitCode = 1;
}
