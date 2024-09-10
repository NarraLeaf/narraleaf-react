import type {Background, NextJSStaticImageData} from "@core/types";
import type {Scene} from "@core/elements/scene";
import type {Image} from "@core/elements/image";
import type {LogicAction} from "@core/action/logicAction";
import {ImageAction, SceneAction} from "@core/action/actions";
import {
    ImageActionContentType,
    ImageActionTypes,
    SceneActionContentType,
    SceneActionTypes
} from "@core/action/actionTypes";
import {ContentNode} from "@core/action/tree/actionTree";

export class Utils {
    public static srcToString(src: string | NextJSStaticImageData): string {
        return typeof src === "string" ? src : src.src;
    }

    public static staticImageDataToSrc(image: NextJSStaticImageData | string): string {
        return typeof image === "string" ? image : image.src;
    }

    public static isStaticImageData(src: any): src is NextJSStaticImageData {
        return src.src !== undefined;
    }

    public static backgroundToSrc(background: Background["background"]) {
        return Utils.isStaticImageData(background) ? background.src : (
            (background as any)?.["url"] || null
        );
    }

    public static isExternalSrc(src: string) {
        return src.startsWith("http://") || src.startsWith("https://");
    }
}

export class UseError<T = Record<string, any>> extends Error {
    private props: T;

    constructor(message: string, props: T, name = "UseError") {
        super(message);
        this.props = props;
        this.name = name;
    }

    static isUseError(error: any): error is UseError {
        return error instanceof UseError;
    }
}

export class StaticScriptWarning extends UseError<{
    stack?: string;
}> {
    public static isWarning(error: any): error is StaticScriptWarning {
        return error instanceof StaticScriptWarning;
    }

    constructor(message: string) {
        super(message, {}, "StaticScriptWarning");
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

    public start() {
        const imageStates = new Map<Image, ImageState>();

        const queue: LogicAction.Actions[] = [];
        const seen: Set<Scene> = new Set();

        if (!this.scene.getAllActions().length) {
            return null;
        }

        queue.push(this.scene.getAllActions()[0]);
        while (queue.length) {
            const action = queue.shift()!;

            this.checkAction(action, imageStates, seen);

            const child = action.contentNode.child;
            if (child && child.action) {
                queue.push(child.action);
            }
        }

        return imageStates;
    }

    private checkAction(action: LogicAction.Actions, imageStates: Map<Image, ImageState>, seen: Set<Scene>) {
        if (action instanceof ImageAction) {
            if (!imageStates.has(action.callee)) {
                imageStates.set(action.callee, {
                    isDisposed: false,
                    usedExternalSrc: false,
                });
            }
            this.checkImage(imageStates.get(action.callee)!, action);
        } else if (action instanceof SceneAction) {
            if (action.type === SceneActionTypes.jumpTo) {
                const scene =
                    (action.contentNode as ContentNode<SceneActionContentType["scene:jumpTo"]>).getContent()[0];
                if (!seen.has(scene)) {
                    seen.add(scene);
                } else {
                    return;
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
        } else if ([
            ImageActionTypes.init,
            ImageActionTypes.show,
            ImageActionTypes.hide,
            ImageActionTypes.applyTransform,
            ImageActionTypes.applyTransition,
        ].includes(action.type)) {
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

