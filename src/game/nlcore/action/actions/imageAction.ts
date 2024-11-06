import {ImageActionContentType, ImageActionTypes} from "@core/action/actionTypes";
import {Image} from "@core/elements/image";
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
            if (this.callee.config.isWearable) {
                throw new Error(
                    "Cannot init wearable image with init action" +
                    "\nIt seems like you are trying to init a wearable image with an init action, or use this wearable image without parent."
                );
            }

            const lastScene = state.findElementByDisplayable(this.callee);
            if (lastScene) {
                state.disposeImage(this.callee, lastScene.scene);
            }

            const scene = (this.contentNode as ContentNode<ImageActionContentType["image:init"]>).getContent()[0];
            state.createImage(this.callee, scene);

            return this.resolveAwaitable(async (resolve) => {
                await this.callee.events.any("event:displayable.init");

                resolve(super.executeAction(state));
                state.stage.next();
            });
        } else if (this.type === ImageActionTypes.initWearable) {
            const [image] = (this.contentNode as ContentNode<ImageActionContentType["image:initWearable"]>).getContent();

            return this.resolveAwaitable(async (resolve) => {
                await this.callee.events.any("event:wearable.create", image);
                await image.events.any("event:displayable.init");

                resolve(super.executeAction(state));
                state.stage.next();
            });
        } else if (this.type === ImageActionTypes.setSrc) {
            this.callee.state.src = (this.contentNode as ContentNode<ImageActionContentType["image:setSrc"]>).getContent()[0];
            state.logger.debug("Image - Set Src", this.callee.state.src);

            state.stage.update();
            return super.executeAction(state);
        } else if (([
            ImageActionTypes.show,
            ImageActionTypes.hide,
            ImageActionTypes.applyTransform
        ] as T[]).includes(this.type)) {
            const awaitable =
                new Awaitable<CalledActionResult, CalledActionResult>(v => v)
                    .registerSkipController(new SkipController(() => {
                        if (this.type === ImageActionTypes.hide) {
                            this.callee.state.display = false;
                        }
                        return super.executeAction(state) as CalledActionResult;
                    }));
            const transform =
                (this.contentNode as ContentNode<ImageActionContentType["image:show"]>).getContent()[1];

            if (this.type === ImageActionTypes.show) {
                this.callee.state.display = true;
                state.stage.update();
            }

            state.animateImage(Image.EventTypes["event:displayable.applyTransform"], this.callee, [
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
            const transition =
                (this.contentNode as ContentNode<ImageActionContentType["image:applyTransition"]>).getContent()[0];
            this.callee.events.any("event:displayable.applyTransition", transition).then(() => {
                awaitable.resolve({
                    type: this.type,
                    node: this.contentNode.getChild()
                });
                state.stage.next();
            });
            return awaitable;
        } else if (this.type === ImageActionTypes.flush) {
            // const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v);
            // this.callee.events.any("event:image.flushComponent")
            //     .then(() => {
            //         awaitable.resolve({
            //             type: this.type,
            //             node: this.contentNode.getChild()
            //         });
            //         state.stage.next();
            //     });
            // return awaitable;
            return super.executeAction(state);
        }

        throw super.unknownType();
    }
}