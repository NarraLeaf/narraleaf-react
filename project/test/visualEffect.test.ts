import { describe, expect, it } from "vitest";
import { Chained } from "../../src/game/nlcore/action/chain";
import { ControlActionTypes, DisplayableActionTypes } from "../../src/game/nlcore/action/actionTypes";
import { Image } from "../../src/game/nlcore/elements/displayable/image";
import { Layer } from "../../src/game/nlcore/elements/layer";
import { Scene } from "../../src/game/nlcore/elements/scene";
import { Story } from "../../src/game/nlcore/elements/story";
import { Mask } from "../../src/game/nlcore/elements/transition/transitions/image/mask";
import { Reveal } from "../../src/game/nlcore/elements/transition/transitions/image/reveal";
import { Transform } from "../../src/game/nlcore/elements/transform/transform";
import { blink, effectLayer, vignette } from "../../src/built-in";

const gameState = {
    getStory() {
        return {
            getInversionConfig() {
                return {
                    invertX: false,
                    invertY: false,
                };
            },
        };
    },
} as any;

function getTransform(actionLike: any): Transform<any> {
    const actions = Chained.toActions([actionLike]);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe(DisplayableActionTypes.applyTransform);

    return actions[0].contentNode.getContent()[0] as Transform<any>;
}

function getAnimation(transform: Transform<any>, image: Image) {
    return transform.constructAnimation({
        gameState,
        transformState: image.transformState,
        current: {} as Element,
    });
}

function resolveTransition(resolver: any, progress: number) {
    return typeof resolver === "function"
        ? resolver(progress)
        : resolver.resolver(progress);
}

function collectActions(actionLike: any) {
    const story = new Story("collect actions");
    const seen = new Set<any>();
    const queue = Chained.toActions([actionLike]);
    const actions: any[] = [];

    while (queue.length) {
        const action = queue.shift()!;
        if (seen.has(action)) {
            continue;
        }
        seen.add(action);
        actions.push(action);
        queue.push(...action.getFutureActions(story, {}));
    }

    return actions;
}

describe("visual effect transform", () => {
    it("maps visual effect fields to standard and webkit DOM styles", () => {
        const style = Transform.constructStyle(gameState, {
            maskImage: "url(\"/mask.png\")",
            maskSize: "cover",
            maskPosition: "center",
            maskRepeat: "no-repeat",
            maskMode: "alpha",
            clipPath: "circle(50% at 50% 50%)",
            filter: "blur(2px)",
            backdropFilter: "blur(4px)",
            mixBlendMode: "screen",
        });

        expect(style).toMatchObject({
            maskImage: "url(\"/mask.png\")",
            WebkitMaskImage: "url(\"/mask.png\")",
            maskSize: "cover",
            WebkitMaskSize: "cover",
            maskPosition: "center",
            WebkitMaskPosition: "center",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskMode: "alpha",
            WebkitMaskMode: "alpha",
            clipPath: "circle(50% at 50% 50%)",
            filter: "blur(2px)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            mixBlendMode: "screen",
        });
    });

    it("keeps visual effect fields in transform state serialization", () => {
        const image = new Image({
            src: "/image.png",
            maskImage: "url(\"/initial-mask.png\")",
            maskSize: "100% 100%",
            clipPath: "circle(40%)",
            filter: "grayscale(1)",
            mixBlendMode: "screen",
        });

        const raw = image.toData();

        expect(raw.transformState).toMatchObject({
            maskImage: "url(\"/initial-mask.png\")",
            maskSize: "100% 100%",
            clipPath: "circle(40%)",
            filter: "grayscale(1)",
            mixBlendMode: "screen",
        });
    });

    it("keeps layer visual effect fields through serialization restore", () => {
        const layer = new Layer("effect layer", {
            filter: "blur(8px)",
            backdropFilter: "brightness(0.8)",
            mixBlendMode: "screen",
        });

        const restored = new Layer("effect layer");
        restored.fromData(layer.toData()!);

        expect(restored.transformState.get()).toMatchObject({
            filter: "blur(8px)",
            backdropFilter: "brightness(0.8)",
            mixBlendMode: "screen",
        });
    });

    it("registers mask helper and raw url effect sources for preload", () => {
        const image = new Image({src: "/image.png"});

        image.mask("/mask.png", {
            maskSize: "cover",
            maskRepeat: "no-repeat",
        });
        image.effect({
            maskImage: "linear-gradient(black, transparent), url(\"/raw-mask.png\")",
        });

        const src = image.srcManager.getSrc().map(entry => `${entry.type}:${entry.src}`);

        expect(src).toContain("image:/image.png");
        expect(src).toContain("image:/mask.png");
        expect(src).toContain("image:/raw-mask.png");
    });

    it("uses explicit reset values for clear helpers", () => {
        const style = Transform.constructStyle(gameState, {
            maskImage: "none",
            maskSize: "auto",
            maskPosition: "0% 0%",
            maskRepeat: "repeat",
            maskMode: "match-source",
            clipPath: "none",
            filter: "none",
            mixBlendMode: "normal",
        });

        expect(style).toMatchObject({
            maskImage: "none",
            WebkitMaskImage: "none",
            maskSize: "auto",
            WebkitMaskSize: "auto",
            maskPosition: "0% 0%",
            WebkitMaskPosition: "0% 0%",
            maskRepeat: "repeat",
            WebkitMaskRepeat: "repeat",
            maskMode: "match-source",
            WebkitMaskMode: "match-source",
            clipPath: "none",
            filter: "none",
            mixBlendMode: "normal",
        });
    });

    it("builds circle reveal and close clip-path sequences", () => {
        const revealImage = new Image({src: "/image.png"});
        const reveal = getAnimation(getTransform(revealImage.circleReveal({
            duration: 500,
            clearClip: false,
        })), revealImage);

        expect(reveal.sequences.map(sequence => sequence[1].clipPath)).toEqual([
            "circle(0% at 50% 50%)",
            "circle(150% at 50% 50%)",
        ]);
        expect(reveal.finalState.get().clipPath).toBe("circle(150% at 50% 50%)");

        const closeImage = new Image({src: "/image.png"});
        const close = getAnimation(getTransform(closeImage.circleClose({
            duration: 500,
        })), closeImage);

        expect(close.sequences.map(sequence => sequence[1].clipPath)).toEqual([
            "circle(150% at 50% 50%)",
            "circle(0% at 50% 50%)",
        ]);
        expect(close.finalState.get().clipPath).toBe("circle(0% at 50% 50%)");
    });

    it("clears default reveal and wipe clips with a sequential action", () => {
        const revealActions = collectActions(new Image({src: "/image.png"}).circleReveal({
            duration: 500,
        }));
        const revealTransforms = revealActions.filter(action => action.type === DisplayableActionTypes.applyTransform);

        expect(revealActions[0].type).toBe(ControlActionTypes.do);
        expect(revealTransforms).toHaveLength(2);
        expect(revealTransforms[1].contentNode.getContent()[0]).toBeInstanceOf(Transform);

        const wipeActions = collectActions(new Image({src: "/image.png"}).wipe({
            duration: 500,
        }));
        const wipeTransforms = wipeActions.filter(action => action.type === DisplayableActionTypes.applyTransform);

        expect(wipeActions[0].type).toBe(ControlActionTypes.do);
        expect(wipeTransforms).toHaveLength(2);
    });

    it("builds directional wipe clip-path sequences", () => {
        const image = new Image({src: "/image.png"});
        const reveal = getAnimation(getTransform(image.wipe({
            direction: "top",
            duration: 400,
            clearClip: false,
        })), image);

        expect(reveal.sequences.map(sequence => sequence[1].clipPath)).toEqual([
            "inset(0 0 100% 0)",
            "inset(0 0 0% 0)",
        ]);
        expect(reveal.finalState.get().clipPath).toBe("inset(0 0 0% 0)");

        const reverseImage = new Image({src: "/image.png"});
        const reverse = getAnimation(getTransform(reverseImage.wipe({
            direction: "right",
            reverse: true,
            duration: 400,
        })), reverseImage);

        expect(reverse.sequences.map(sequence => sequence[1].clipPath)).toEqual([
            "inset(0 0 0 0%)",
            "inset(0 0 0 100%)",
        ]);
        expect(reverse.finalState.get().clipPath).toBe("inset(0 0 0 100%)");
    });

    it("applies hard-edged reveal masks to the target image", () => {
        const circle = new Reveal({duration: 800, pattern: Mask.iris({feather: 0})})
            ._setPrevSrc("/prev.png")
            ._setTargetSrc("/next.png");
        const circleTask = circle.createTask();
        const circlePrev = resolveTransition(circleTask.resolve[0], 0.5);
        const circleTarget = resolveTransition(circleTask.resolve[1], 0.5);

        expect(circlePrev.src).toBe("/prev.png");
        expect(circleTarget.src).toBe("/next.png");
        expect(circleTarget.style.maskImage).toBe("radial-gradient(circle at 50% 50%, #000 75%, transparent 75%)");

        const wipe = new Reveal({
            duration: 800,
            pattern: Mask.wipe({direction: "bottom", feather: 0}),
        })._setPrevSrc("/prev.png")._setTargetSrc("/next.png");
        const wipeTask = wipe.createTask();
        const wipeTarget = resolveTransition(wipeTask.resolve[1], 0.25);

        expect(wipeTarget.style.maskImage).toBe("linear-gradient(to bottom, #000 25%, transparent 25%)");
    });

    it("creates a reusable scene effect layer", () => {
        const scene = new Scene("scope test");
        const initialLayerCount = scene.config.layers.length;
        const layer = effectLayer(scene);

        expect(effectLayer(scene)).toBe(layer);
        expect(scene.config.layers.filter(item => item === layer)).toHaveLength(1);
        expect(scene.config.layers).toHaveLength(initialLayerCount + 1);
        expect(layer.config.zIndex).toBe(1000);
    });

    it("builds built-in blink and vignette actions on the scene effect layer", () => {
        const scene = new Scene("screen effects");
        const layer = effectLayer(scene);
        const story = new Story("screen effects test");
        const blinkActions = Chained.toActions([blink(scene)]);
        const blinkElements = scene.getAllChildrenElements(story, blinkActions);
        const blinkImages = blinkElements.filter((element): element is Image => element instanceof Image);

        expect(blinkImages).toHaveLength(2);
        expect(blinkImages.every(image => image.config.layer === layer)).toBe(true);

        const vignetteActions = Chained.toActions([vignette(scene)]);
        const vignetteElements = scene.getAllChildrenElements(story, vignetteActions);
        const vignetteImages = vignetteElements.filter((element): element is Image => element instanceof Image);

        expect(vignetteImages).toHaveLength(1);
        expect(vignetteImages[0].config.layer).toBe(layer);
    });
});
