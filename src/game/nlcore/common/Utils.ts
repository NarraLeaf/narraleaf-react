import type {Background, color, HexColor, ImageColor, ImageSrc, NextJSStaticImageData} from "@core/types";
import type {Scene} from "@core/elements/scene";
import type {Image} from "@core/elements/displayable/image";
import type {LogicAction} from "@core/action/logicAction";
import {
    ImageActionContentType,
    ImageActionTypes,
    SceneActionContentType,
    SceneActionTypes
} from "@core/action/actionTypes";
import {ContentNode} from "@core/action/tree/actionTree";
import {SceneAction} from "@core/action/actions/sceneAction";
import {ImageAction} from "@core/action/actions/imageAction";
import {toHex, Values} from "@lib/util/data";
import {Action} from "@core/action/action";
import {Story} from "@core/elements/story";

export class RGBColor {
    static isHexString(color: any): color is HexColor {
        if (typeof color !== "string") {
            return false;
        }
        return /^#[0-9A-F]{6}$/i.test(color);
    }

    static fromHex(hex: HexColor) {
        const hexString = hex.slice(1);
        const r = parseInt(hexString.slice(0, 2), 16);
        const g = parseInt(hexString.slice(2, 4), 16);
        const b = parseInt(hexString.slice(4, 6), 16);
        const a = hexString.length === 8 ? parseInt(hexString.slice(6, 8), 16) / 255 : 1;
        return new RGBColor(r, g, b, a);
    }

    public r: number;
    public g: number;
    public b: number;
    public a: number;

    constructor(r: number, g: number, b: number, a: number = 1) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }

    public toString() {
        return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
    }

    public toHex() {
        return "#" + this.r.toString(16) + this.g.toString(16) + this.b.toString(16);
    }

    public toImageColor(): ImageColor {
        return {
            r: this.r,
            g: this.g,
            b: this.b,
            a: this.a,
        };
    }
}

export class Utils {
    static RGBColor = RGBColor;

    public static srcToString(src: string | NextJSStaticImageData): string {
        return typeof src === "string" ? src : src.src;
    }

    public static staticImageDataToSrc(image: NextJSStaticImageData | string): string {
        return typeof image === "string" ? image : image.src;
    }

    public static isStaticImageData(src: any): src is NextJSStaticImageData {
        return src?.src !== undefined && typeof src.src === "string";
    }

    public static backgroundToSrc(background: Background["background"]): string | null {
        return Utils.isStaticImageData(background) ? background.src : (
            (background as any)?.["url"] || null
        );
    }

    public static isExternalSrc(src: string) {
        return src.startsWith("http://") || src.startsWith("https://");
    }

    public static isImageSrc(src: any): src is ImageSrc {
        return (typeof src === "string" && !this.isHexString(src)) || Utils.isStaticImageData(src);
    }

    public static isImageColor(color: any): color is ImageColor {
        return Utils.isHexString(color) || Utils.isPlainColor(color);
    }

    public static isPlainColor(color: any): color is color {
        return color && (typeof color === "string" || (typeof color === "object" && "r" in color && "g" in color && "b" in color));
    }

    static isHexString(color: any): color is HexColor {
        if (typeof color !== "string") {
            return false;
        }
        return /^#([0-9A-F]{6}|[0-9A-F]{3})$/i.test(color);
    }

    public static toBackgroundSrc(src: ImageSrc): string {
        if (typeof src === "string") {
            return src;
        }
        return src.src;
    }

    public static toHex(color: ImageColor): HexColor {
        return toHex(color);
    }
}

export class UseError<T = Record<string, any>> extends Error {
    static isUseError(error: any): error is UseError {
        return error instanceof UseError;
    }

    props: T;

    constructor(message: string, props: T, name = "UseError") {
        super(message);
        this.props = props;
        this.name = name;
    }
}

export class StaticScriptWarning extends UseError<{
    stack?: string;
    info?: any;
}> {
    public static isWarning(error: any): error is StaticScriptWarning {
        return error instanceof StaticScriptWarning;
    }

    constructor(message: string, info?: any) {
        super(message, {info}, "StaticScriptWarning");
    }
}

type ImageState = {
    isDisposed: boolean;
    usedExternalSrc: boolean;
};

export class StaticChecker {
    private readonly scene: Scene;

    constructor(target: Scene) {
        this.scene = target;
    }

    public run(story: Story) {
        const imageStates = new Map<Image, ImageState>();
        const scenes = new Map<string, Scene>();

        const queue: LogicAction.Actions[] = [];
        const seen: Set<Scene> = new Set();

        const sceneActions = this.scene.getAllChildren(story, this.scene.getSceneRoot());

        if (!sceneActions.length) {
            return null;
        }

        queue.push(sceneActions[0]!);
        while (queue.length) {
            const action = queue.shift()!;

            this.checkAction(
                story,
                action,
                {imageStates, scenes},
                seen
            );

            const child = action.contentNode.getChild();
            if (child && child.action) {
                queue.push(child.action);
            }
        }

        return imageStates;
    }

    private checkAction(
        story: Story,
        action: LogicAction.Actions,
        {imageStates, scenes}: { imageStates: Map<Image, ImageState>, scenes: Map<string, Scene> },
        seen: Set<Scene>
    ) {
        if (action instanceof ImageAction) {
            if (!imageStates.has(action.callee)) {
                imageStates.set(action.callee, {
                    isDisposed: false,
                    usedExternalSrc: false,
                });
            }
            this.checkImage(imageStates.get(action.callee)!, action);
        } else if (action instanceof SceneAction) {
            const scene = action.callee;

            if (scenes.has(scene.name)) {
                if (scenes.get(scene.name) !== scene) {
                    const message = `Scene with name: ${scene.name} is duplicated\nScene: ${scene.name}\n\nAt: ${action.__stack}`;
                    throw new StaticScriptWarning(message);
                }
            } else {
                scenes.set(scene.name, scene);
            }

            if (action.type === SceneActionTypes.jumpTo) {
                const targetScene =
                    (action.contentNode as ContentNode<SceneActionContentType["scene:jumpTo"]>).getContent()[0];
                const scene = story.getScene(targetScene, true);
                if (seen.has(scene)) {
                    return;
                } else {
                    seen.add(scene);
                }
            }
        }
    }

    private checkImage(state: ImageState, action: ImageAction) {
        if (action.type === ImageActionTypes.dispose) {
            if (state.isDisposed) {
                const message = `Image is disposed multiple times before action: ${action.type}\nImage: ${action.callee.name}\nAction: ${action.type}\n\nAt: ${action.__stack}`;
                throw new StaticScriptWarning(message);
            }
            state.isDisposed = true;
        } else if (([
            ImageActionTypes.init,
            ImageActionTypes.show,
            ImageActionTypes.hide,
            ImageActionTypes.applyTransform,
            ImageActionTypes.applyTransition,
        ] as Values<typeof ImageActionTypes>[]).includes(action.type)) {
            if (state.isDisposed) {
                const message = `Image is disposed before action: ${action.type}\nImage: ${action.callee.name}\nAction: ${action.type}\n\nAt: ${action.__stack}`;
                throw new StaticScriptWarning(message);
            }
        } else if (action.type === ImageActionTypes.setSrc) {
            const node = (action.contentNode as ContentNode<ImageActionContentType["image:setSrc"]>);
            const src = node.getContent()[0];
            if (Utils.isExternalSrc(src)) {
                state.usedExternalSrc = true;
            }
        }
    }
}

export class RuntimeScriptError extends Error {
    static toMessage(msg: string | string[], trace?: Action | Action[]) {
        const messages: string[] = [];
        messages.push(...(Array.isArray(msg) ? msg : [msg]));
        if (trace) {
            messages.push(...(
                Array.isArray(trace)
                    ? trace.map(RuntimeScriptError.getActionTrace)
                    : [RuntimeScriptError.getActionTrace(trace)]
            ));
        }
        return messages.join("");
    }

    static getActionTrace(action: Action): string {
        return `\nUsing action (id: ${action.getId()})` +
            `\n    at: ${action.__stack}`;
    }

    constructor(message: string | string[], trace?: Action | Action[]) {
        super(RuntimeScriptError.toMessage(message, trace));
        this.name = "RuntimeScriptError";
    }
}

export class RuntimeGameError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RuntimeGameError";
    }
}

