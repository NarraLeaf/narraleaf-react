import {ImageActionContentType, ImageActionTypes} from "@core/action/actionTypes";
import {Image as GameImage, Image} from "@core/elements/image";
import {GameState} from "@player/gameState";
import type {CalledActionResult} from "@core/gameTypes";
import {Awaitable, SkipController} from "@lib/util/data";
import {ContentNode} from "@core/action/tree/actionTree";
import {TypedAction} from "@core/action/actions";

export class ImageAction<T extends typeof ImageActionTypes[keyof typeof ImageActionTypes] = typeof ImageActionTypes[keyof typeof ImageActionTypes]>
    extends TypedAction<ImageActionContentType, T, Image> {
    static ActionTypes = ImageActionTypes;

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === ImageActionTypes.init) {
            const lastScene = state.findElementByImage(this.callee);
            if (lastScene) {
                state.disposeImage(this.callee, lastScene.scene);
            }

            const scene = (this.contentNode as ContentNode<ImageActionContentType["image:init"]>).getContent()[0];
            state.createImage(this.callee, scene);

            const awaitable = new Awaitable<CalledActionResult, any>(v => v);

            this.callee.events.once("event:image.mount", async () => {
                if (!this.callee.getScope()?.current) {
                    await this.callee.events.any(GameImage.EventTypes["event:image.elementLoaded"]);
                }

                await this.callee.events.any("event:image.init");
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
            });
            return awaitable;
        } else if (this.type === ImageActionTypes.setSrc) {
            this.callee.state.src = (this.contentNode as ContentNode<ImageActionContentType["image:setSrc"]>).getContent()[0];
            state.logger.debug("Image - Set Src", this.callee.state.src);

            state.stage.update();
            return super.executeAction(state);
        } else if ([
            ImageActionTypes.show,
            ImageActionTypes.hide,
            ImageActionTypes.applyTransform
        ].includes(this.type)) {
            const awaitable =
                new Awaitable<CalledActionResult, CalledActionResult>(v => v)
                    .registerSkipController(new SkipController(() => {
                        if (this.type === ImageActionTypes.hide) {
                            this.callee.state.display = false;
                        }
                        return super.executeAction(state) as CalledActionResult;
                    }));
            const transform = (this.contentNode as ContentNode<ImageActionContentType["image:show"]>).getContent()[1];

            if (this.type === ImageActionTypes.show) {
                this.callee.state.display = true;
                state.stage.update();
            }

            state.animateImage(Image.EventTypes["event:image.applyTransform"], this.callee, [
                transform
            ], () => {
                if (this.type === ImageActionTypes.hide) {
                    this.callee.state.display = false;
                }
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode?.getChild(),
                });
            });
            return awaitable;
        } else if (this.type === ImageActionTypes.dispose) {
            state.disposeImage(this.callee);
            this.callee._$setDispose();
            return super.executeAction(state);
        } else if (this.type === ImageActionTypes.applyTransition) {
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v)
                .registerSkipController(new SkipController(() => {
                    if (this.type === ImageActionTypes.hide) {
                        this.callee.state.display = false;
                    }
                    return {
                        type: this.type,
                        node: this.contentNode.getChild()
                    };
                }));
            const transition = (this.contentNode as ContentNode<ImageActionContentType["image:applyTransition"]>).getContent()[0];
            this.callee.events.any("event:image.applyTransition", transition).then(() => {
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
            });
            return awaitable;
        } else if (this.type === ImageActionTypes.flush) {
            const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
            this.callee.events.any("event:image.flushComponent")
                .then(() => {
                    awaitable.resolve({
                        type: this.type,
                        node: this.contentNode.getChild()
                    });
                    state.stage.next();
                });
            return awaitable;
        }

        throw super.unknownType();
    }
}