import {describe, expect, it} from "vitest";
import {Utils} from "@core/common/Utils";
import {TransformState} from "@core/elements/transform/transform";
import {Image} from "@core/elements/displayable/image";

/**
 * A save is a file on the player's disk. What it says about where an image comes from, or what a
 * CSS value points at, is only applied when it stays on the host's own ground.
 */
describe("Utils.isSafeRestoredURL", () => {
    it("lets relative paths, the host's schemes, http(s) and image data through", () => {
        for (const url of [
            "assets/bg.png",
            "/assets/bg.png",
            "nlgame://asset/42",
            "https://cdn.example/bg.png",
            "blob:nlgame://runtime/1234",
            "data:image/png;base64,AAAA",
            "#ffffff",
        ]) {
            expect(Utils.isSafeRestoredURL(url), url).toBe(true);
        }
    });

    it("refuses script and local-file schemes, also when spelled with whitespace or case", () => {
        for (const url of [
            "javascript:alert(1)",
            "JavaScript:alert(1)",
            "java\tscript:alert(1)",
            " vbscript:x",
            "file:///etc/passwd",
            "filesystem:https://x/y",
            "data:text/html,<script>1</script>",
        ]) {
            expect(Utils.isSafeRestoredURL(url), url).toBe(false);
        }
    });
});

describe("Utils.isSafeRestoredCSSValue", () => {
    it("checks every url() inside the value", () => {
        expect(Utils.isSafeRestoredCSSValue("blur(2px)")).toBe(true);
        expect(Utils.isSafeRestoredCSSValue("url(\"nlgame://asset/1\") center / cover")).toBe(true);
        expect(Utils.isSafeRestoredCSSValue("url(file:///etc/passwd)")).toBe(false);
        expect(Utils.isSafeRestoredCSSValue("url('a.png'), url('javascript:1')")).toBe(false);
        expect(Utils.isSafeRestoredCSSValue("image-set(\"file:///x\" 1x)")).toBe(false);
    });

    it("refuses CSS escapes, which can spell a scheme a search does not see", () => {
        expect(Utils.isSafeRestoredCSSValue("u\\72l(file:///x)")).toBe(false);
    });
});

describe("restoring from a save", () => {
    it("drops a transform value that points somewhere a save may not send the stage", () => {
        const state = TransformState.deserialize({
            maskImage: "url(file:///secret.png)",
            filter: "blur(2px)",
            opacity: 0.5,
        }).get() as Record<string, unknown>;
        expect(state.maskImage).toBeUndefined();
        expect(state.filter).toBe("blur(2px)");
        expect(state.opacity).toBe(0.5);
    });

    it("keeps an image's authored source when the saved one is unsafe", () => {
        const image = new Image({src: "assets/hero.png"});
        const data = image.toData();
        const tampered = {...data, state: {...data.state, currentSrc: "file:///etc/passwd"}};
        image.fromData(tampered as typeof data);
        expect(image.state.currentSrc).toBe("assets/hero.png");

        const fine = {...data, state: {...data.state, currentSrc: "assets/other.png"}};
        image.fromData(fine as typeof data);
        expect(image.state.currentSrc).toBe("assets/other.png");
    });
});
