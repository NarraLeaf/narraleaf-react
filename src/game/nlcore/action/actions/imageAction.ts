import {ImageActionContentType, ImageActionTypes} from "@core/action/actionTypes";
import {Image} from "@core/elements/displayable/image";
import {GameState} from "@player/gameState";
import type {CalledActionResult} from "@core/gameTypes";
import {Awaitable, SkipController} from "@lib/util/data";
import {ContentNode} from "@core/action/tree/actionTree";
import {TypedAction} from "@core/action/actions";
import {RuntimeScriptError, Utils} from "@core/common/Utils";
import {Color} from "@core/types";
import {ExposedStateType} from "@player/type";

export class ImageAction<T extends typeof ImageActionTypes[keyof typeof ImageActionTypes] = typeof ImageActionTypes[keyof typeof ImageActionTypes]>
    extends TypedAction<ImageActionContentType, T, Image> {
    static ActionTypes = ImageActionTypes;

    public static resolveTagSrc(image: Image, tags: string[]) {
        if (!Image.isTagSrc(image)) {
            throw image._mixedSrcError();
        }

        const oldTags = image.state.currentSrc as string[];
        const newTags = image.resolveTags(oldTags, tags);
        return Image.getSrcFromTags(newTags, image.config.src.resolve);
    }

    public static resolveCurrentSrc(image: Image): string | Color {
        if (Image.isStaticSrc(image)) {
            return Utils.isImageSrc(image.state.currentSrc)
                ? Utils.srcToURL(image.state.currentSrc)
                : image.state.currentSrc;
        } else if (Image.isTagSrc(image)) {
            return Image.getSrcFromTags(image.state.currentSrc as string[], image.config.src.resolve);
        }

        throw image._mixedSrcError();
    }

    declare type: T;
    declare contentNode: ContentNode<ImageActionContentType[T]>;

    public executeAction(state: GameState): CalledActionResult | Awaitable<CalledActionResult, any> {
        if (this.type === ImageActionTypes.initWearable) {
            const [wearable] = (this.contentNode as ContentNode<ImageActionContentType["image:initWearable"]>).getContent();
            const exposed = state.getExposedStateForce<ExposedStateType.image>(this.callee);
            const awaitable = new Awaitable<CalledActionResult>(v => v);

            exposed.createWearable(wearable);
            state.getExposedStateAsync<ExposedStateType.image>(wearable, (wearableState) => {
                wearableState.initDisplayable(() => {
                    awaitable.resolve(super.executeAction(state) as CalledActionResult);
                    state.stage.next();
                });
            });

            return awaitable;
        } else if (this.type === ImageActionTypes.setSrc) {
            const src = (this.contentNode as ContentNode<ImageActionContentType["image:setSrc"]>).getContent()[0];
            if (Utils.isColor(src) && !this.callee.config.isBackground) {
                throw new RuntimeScriptError("Color src is not allowed for non-background image");
            }

            this.callee.state.currentSrc = src;
            state.logger.debug("Image Set Src", src);

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
                transition
                    ._setPrevSrc(ImageAction.resolveCurrentSrc(this.callee))
                    ._setTargetSrc(newSrc);

                const exposed = state.getExposedStateForce<ExposedStateType.image>(this.callee);
                exposed.applyTransition(transition, () => {
                    this.callee.state.currentSrc = newTags as [];
                    awaitable.resolve(super.executeAction(state) as CalledActionResult);
                    state.stage.next();
                });
                state.timelines.attachTimeline(awaitable);

                return awaitable;
            }
            this.callee.state.currentSrc = newTags as [];
            return super.executeAction(state);
        }

        throw super.unknownTypeError();
    }
}