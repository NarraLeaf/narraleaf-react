import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
    resolve: {
        alias: {
            "@core": path.resolve(__dirname, "src/game/nlcore"),
            "@player": path.resolve(__dirname, "src/game/player"),
            "@lib": path.resolve(__dirname, "src"),
        },
    },
});
