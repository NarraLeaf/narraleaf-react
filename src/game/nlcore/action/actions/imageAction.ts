import {ImageActionContentType, ImageActionTypes} from "@core/action/actionTypes";
import {Image} from "@core/elements/displayable/image";
import {GameState} from "@player/gameState";
import type {CalledActionResult} from "@core/gameTypes";
import {Awaitable, SkipController} from "@lib/util/data";
import {ContentNode} from "@core/action/tree/actionTree";
import {TypedAction} from "@core/action/actions";
import {Displayable} from "@core/elements/displayable/displayable";

export class ImageAction<T extends typeof ImageActionTypes[keyof typeof ImageActionTypes] = typeof ImageActionTypes[keyof typeof ImageActionTypes]>
    extends TypedAction<ImageActionContentType, T, Image> {
    static ActionTypes = ImageActionTypes;

    declare type: T;
    declare contentNode: ContentNode<ImageActionContentType[T]>;

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === ImageActionTypes.initWearable) {
            const [image] = (this.contentNode as ContentNode<ImageActionContentType["image:initWearable"]>).getContent();

            return this.resolveAwaitable((resolve) => {
                this.callee.events.any("event:wearable.create", image).then(() => {
                    this.callee.events.emit(Displayable.EventTypes["event:displayable.init"], () => {
                        resolve(super.executeAction(state) as CalledActionResult);
                        state.stage.next();
                    });
                });
            });
        } else if (this.type === ImageActionTypes.setSrc) {
            this.callee.state.currentSrc =
                (this.contentNode as ContentNode<ImageActionContentType["image:setSrc"]>).getContent()[0];
            state.logger.debug("Image Set Src", this.callee.state.currentSrc);

            state.stage.update();
            return super.executeAction(state);
        } else if (this.type === ImageActionTypes.flush) {
            return super.executeAction(state);
        } else if (this.type === ImageActionTypes.setAppearance) {
            const [tags, transition] =
                (this.contentNode as ContentNode<ImageActionContentType["image:setAppearance"]>).getContent();
            if (!Image.isTagSrc(this.callee)) {
                throw this.callee._mixedSrcError();
            }

            const oldTags = this.callee.state.currentSrc as string[];
            const newTags = this.callee.resolveTags(oldTags, tags);
            const newSrc = Image.getSrcFromTags(newTags, this.callee.config.src.resolve);

            state.logger.debug("Image - Set Appearance", newTags, newSrc);

            if (transition) {
                const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v)
                    .registerSkipController(new SkipController(() => super.executeAction(state) as CalledActionResult));
                transition.setSrc(newSrc);
                this.callee.events.emit("event:displayable.applyTransition", transition, () => {
                    this.callee.state.currentSrc = newTags;
                    awaitable.resolve(super.executeAction(state) as CalledActionResult);
                    state.stage.next();
                });
                return awaitable;
            }
            this.callee.state.currentSrc = newTags;
            return super.executeAction(state);
        }

        throw super.unknownTypeError();
    }
}