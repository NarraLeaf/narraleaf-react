import type {
    Color,
    HexColor,
    ImageSrc, Length,
    NamedColor,
    NextJSStaticImageData, RelativeLength,
    RGBAColor,
    StaticImageData
} from "@core/types";
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
import {isNamedColor} from "@lib/util/data";
import {Action} from "@core/action/action";
import {Story} from "@core/elements/story";
import {Word} from "@core/elements/character/word";
import {CSSProps} from "@core/elements/transition/type";

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
}

/**@internal */
export class Utils {
    static RGBColor = RGBColor;

    public static srcToURL(src: string | NextJSStaticImageData): string {
        return typeof src === "string" ? src : src.src;
    }

    /**
     * @deprecated Use {@link srcToURL} instead
     */
    public static staticImageDataToSrc(image: NextJSStaticImageData | string): string {
        return typeof image === "string" ? image : image.src;
    }

    /**
     * Accepts: {@link StaticImageData}
     * @param src
     */
    public static isStaticImageData(src: any): src is StaticImageData {
        return src?.src !== undefined && typeof src.src === "string";
    }

    public static isExternalSrc(src: string) {
        return src.startsWith("http://") || src.startsWith("https://");
    }

    /**
     * Accepts: {@link ImageSrc}
     */
    public static isImageSrc(src: any): src is ImageSrc {
        return (typeof src === "string" && !this.isColor(src)) || Utils.isStaticImageData(src);
    }

    /**
     * Accepts: {@link string}
     */
    public static isImageURL(src: any): src is string {
        return typeof src === "string" && !this.isColor(src);
    }

    /**
     * Accepts: {@link Color}
     */
    public static isColor(color: any): color is Color {
        return Utils.isHexString(color) || Utils.isNamedColor(color) || Utils.isRGBAColor(color);
    }

    public static isNamedColor(color: any): color is NamedColor {
        return isNamedColor(color);
    }

    public static isRGBAColor(color: any): color is RGBAColor {
        return color && typeof color === "object" && "r" in color && "g" in color && "b" in color;
    }

    public static RGBAColorToHex(color: RGBAColor): HexColor {
        const r = color.r.toString(16).padStart(2, "0");
        const g = color.g.toString(16).padStart(2, "0");
        const b = color.b.toString(16).padStart(2, "0");
        const a = color.a ? (Math.round(color.a * 255)).toString(16).padStart(2, "0") : "";
        return `#${r}${g}${b}${a}`;
    }

    public static colorToString(color: Color): string {
        if (Utils.isHexString(color)) {
            return color;
        } else if (Utils.isNamedColor(color)) {
            return color;
        } else if (Utils.isRGBAColor(color)) {
            return Utils.RGBAColorToHex(color);
        }
        throw new Error("Unknown color type");
    }

    static isHexString(color: any): color is HexColor {
        if (typeof color !== "string") {
            return false;
        }
        return /^#([0-9A-F]{3}|[0-9A-F]{6}|[0-9A-F]{4}|[0-9A-F]{8})$/i.test(color);
    }

    /**
     * @deprecated Use {@link srcToURL} instead
     */
    public static toBackgroundSrc(src: ImageSrc): string {
        if (typeof src === "string") {
            return src;
        }
        return src.src;
    }

    public static isDataURI(src: string) {
        return src.startsWith("data:");
    }

    /**
     * Whether `src` already carries its own bytes, so there is nothing for a preloader to fetch.
     *
     * A data URI, or an object URL - which is what {@link ImageCacheManager} now hands back for
     * everything it has cached. The cached form used to be a data URI, so a resolved src that came
     * back around was recognised by the check above; an object URL has to be recognised here or the
     * cache's own output reads as an image nobody preloaded.
     */
    public static isInlineSrc(src: string) {
        return Utils.isDataURI(src) || src.startsWith("blob:");
    }

    public static offset(
        ori: [xOri: string, yOri: string],
        offset: [xOffset: number, yOffset: number],
        invert: {invertX: boolean, invertY: boolean} = {invertX: false, invertY: false}
    ): CSSProps {
        const [xOri, yOri] = ori;
        const [xOffset, yOffset] = offset;

        const posX = this.calc(xOri, xOffset);
        const posY = this.calc(yOri, yOffset);
        const xRes = invert.invertX ? {right: posX} : {left: posX};
        const yRes = invert.invertY ? {bottom: posY} : {top: posY};

        return {
            left: "auto",
            right: "auto",
            top: "auto",
            bottom: "auto",
            ...xRes,
            ...yRes,
        };
    }

    public static calc(a: string | number, b?: string | number): string {
        const aStr = typeof a === "string" ? a : `${a}px`;

        if (b === undefined) {
            return `calc(${aStr} + 0px)`;
        }
        const sign = typeof b === "string" ? "+" : (b < 0 ? "-" : "+");
        const bStr = typeof b === "string" ? b : `${Math.abs(b)}px`;

        return `calc(${aStr} ${sign} ${bStr})`;
    }

    public static formatLength(length: RelativeLength): string {
        return typeof length === "number" ? `${length}px` : length;
    }

    public static toPixel(length: Length): number {
        return typeof length === "number" ? length : parseFloat(length);
    }
}

/**@internal */
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

/**@internal */
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

/**@internal */
type ImageState = {
    /**@deprecated */
    isDisposed: boolean;
    usedExternalSrc: boolean;
};

/**@internal */
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

            if (scenes.has(scene.config.name)) {
                if (scenes.get(scene.config.name) !== scene) {
                    const message = `Scene with name: ${scene.config.name} is duplicated\nScene: ${scene.config.name}\n\nAt: ${action.__stack}`;
                    throw new StaticScriptWarning(message);
                }
            } else {
                scenes.set(scene.config.name, scene);
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
        if (action.type === ImageActionTypes.setSrc) {
            const node = (action.contentNode as ContentNode<ImageActionContentType["image:setSrc"]>);
            const src = node.getContent()[0];
            if (Utils.isImageURL(src) && Utils.isExternalSrc(src)) {
                state.usedExternalSrc = true;
            }
        }
    }
}

/**
 * The action a {@link RuntimeScriptError} is about, reduced to what a host can put on screen:
 * which action it was, and what kind of action it was.
 */
export type RuntimeScriptErrorAction = {
    /** The action's id, as {@link Action.getId} reports it. */
    id: string;
    /** The action's type, e.g. `scene:preSuspend`. */
    type: string;
};

/**@internal */
export class RuntimeScriptError extends Error {
    /**
     * The one spelling of the trace that follows the sentence.
     *
     * The throw sites used to each write their own tail, in two different wordings, so a host
     * wanting to show the sentence on its own had to guess which one it was looking at and would
     * silently do nothing for the other. Every trace is now written here.
     */
    static describeAction(action: RuntimeScriptErrorAction, actionStack?: string): string {
        return `\nAction: (id: ${action.id}) ${action.type}`
            + (actionStack ? `\nAt: ${actionStack}` : "");
    }

    static getActionTrace(action: Action): string {
        return RuntimeScriptError.describeAction(
            {id: action.getId(), type: String(action.type)},
            action.__stack
        );
    }

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

    /**
     * The action the failure is about, when the throw site has one to name. Absent when it has
     * not: an element whose config is wrong fails before any action exists to blame.
     */
    readonly action?: RuntimeScriptErrorAction;
    /**
     * Where the offending action was written - the call stack captured when the story script
     * constructed it. A field of its own rather than part of `message`, because a host that shows
     * the failure to an author already has somewhere to put a stack, and printing it above the
     * sentence buries the one thing the author needs to read.
     */
    readonly actionStack?: string;
    /** Everything `message` used to carry after the sentence. Empty when there is no trace. */
    private readonly traceTail: string;

    constructor(message: string | string[], trace?: Action | Action[]) {
        // The sentence alone. Whatever the throw site knows about the offending action is carried
        // as fields instead, and composed back together on demand.
        super(Array.isArray(message) ? message.join("") : message);
        this.name = "RuntimeScriptError";

        const actions = trace === undefined ? [] : (Array.isArray(trace) ? trace : [trace]);
        const offending: Action | undefined = actions[0];
        if (offending) {
            this.action = {id: offending.getId(), type: String(offending.type)};
            this.actionStack = offending.__stack;
        }
        this.traceTail = actions.map(RuntimeScriptError.getActionTrace).join("");

        // `Error.stack` is what `console.error(err)` prints, and an engine builds it from the
        // message handed to `super`. The trace is no longer in that message, so put it back here:
        // anything that logs the error object still sees everything it used to, while a host
        // reading `.message` gets the sentence on its own.
        if (this.traceTail && typeof this.stack === "string") {
            const at = this.stack.indexOf(this.message);
            this.stack = at === -1
                // Engines that put no `name: message` header on the stack at all.
                ? `${this.name}: ${this.composedMessage}\n${this.stack}`
                : this.stack.slice(0, at) + this.composedMessage + this.stack.slice(at + this.message.length);
        }
    }

    /**
     * The sentence with the trace appended - the form `message` itself used to take. For anything
     * that wants the whole failure as one string, such as a console line.
     */
    get composedMessage(): string {
        return this.message + this.traceTail;
    }
}

/**@internal */
export class RuntimeGameError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RuntimeGameError";
    }
}

/**@internal */
export class RuntimeInternalError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RuntimeInternalError";
    }
}

/**
 * Alias for {@link Word.color}
 */
export function c(text: string | Word, color: Color): Word {
    return Word.color(text, color);
}

/**
 * Alias for {@link Word.bold}
 */
export function b(text: string | Word): Word {
    return Word.bold(text);
}

/**
 * Alias for {@link Word.italic}
 */
export function i(text: string | Word): Word {
    return Word.italic(text);
}

