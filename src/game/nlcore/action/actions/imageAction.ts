import {ImageActionContentType, ImageActionTypes} from "@core/action/actionTypes";
import {Image} from "@core/elements/displayable/image";
import {GameState} from "@player/gameState";
import type {CalledActionResult} from "@core/gameTypes";
import {Awaitable, SkipController} from "@lib/util/data";
import {ContentNode} from "@core/action/tree/actionTree";
import {TypedAction} from "@core/action/actions";
import {RuntimeScriptError, Utils} from "@core/common/Utils";
import {Color, RGBAColor, StaticImageData} from "@core/types";
import {ExposedStateType} from "@player/type";
import { Darkness } from "@core/elements/transition/transitions/image/darkness";
import { ActionExecutionInjection, ExecutedActionResult } from "@core/action/action";
import { LogicAction } from "@core/action/logicAction";
import { Story } from "@core/elements/story";

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

    public executeAction(state: GameState, injection: ActionExecutionInjection): ExecutedActionResult {
        if (this.type === ImageActionTypes.initWearable) {
            const [wearable] = (this.contentNode as ContentNode<ImageActionContentType["image:initWearable"]>).getContent();
            const exposed = state.getExposedStateForce<ExposedStateType.image>(this.callee);
            const awaitable = new Awaitable<CalledActionResult>(v => v);

            exposed.createWearable(wearable);
            state.getExposedStateAsync<ExposedStateType.image>(wearable, (wearableState) => {
                wearableState.initDisplayable(() => {
                    awaitable.resolve(super.executeAction(state, injection) as CalledActionResult);
                });
            });
            state.actionHistory.push<[Image]>({
                action: this,
                stackModel: injection.stackModel
            }, (wearable) => {
                exposed.disposeWearable(wearable);
            }, [wearable]);

            return awaitable;
        } else if (this.type === ImageActionTypes.setSrc) {
            const src = (this.contentNode as ContentNode<ImageActionContentType["image:setSrc"]>).getContent()[0];
            if (Utils.isColor(src) && !this.callee.config.isBackground) {
                throw new RuntimeScriptError("Color src is not allowed for non-background image");
            }

            const oldSrc: string | [] | StaticImageData | RGBAColor = this.callee.state.currentSrc;
            this.callee.state.currentSrc = src;
            state.logger.debug("Image Set Src", src);

            state.actionHistory.push<[string | [] | StaticImageData | RGBAColor]>({
                action: this,
                stackModel: injection.stackModel
            }, (oldSrc) => {
                this.callee.state.currentSrc = oldSrc;
            }, [oldSrc]);

            state.stage.update();
            return super.executeAction(state, injection);
        } else if (this.type === ImageActionTypes.flush) {
            return super.executeAction(state, injection);
        } else if (this.type === ImageActionTypes.setAppearance) {
            const [tags, transition] =
                (this.contentNode as ContentNode<ImageActionContentType["image:setAppearance"]>).getContent();
            if (!Image.isTagSrc(this.callee)) {
                throw this.callee._mixedSrcError();
            }

            const oldTags = this.callee.state.currentSrc as string[];
            const newTags = this.callee.resolveTags(oldTags, tags);
            const oldSrc = [...oldTags];
            const newSrc = Image.getSrcFromTags(newTags, this.callee.config.src.resolve);
            const handleUndo = () => {
                this.callee.state.currentSrc = oldSrc as [];
            };

            state.logger.debug("Image - Set Appearance", newTags, newSrc);

            if (transition) {
                const awaitable = new Awaitable<CalledActionResult, CalledActionResult>(v => v)
                    .registerSkipController(new SkipController(() => super.executeAction(state, injection) as CalledActionResult));
                transition
                    ._setPrevSrc(ImageAction.resolveCurrentSrc(this.callee))
                    ._setTargetSrc(newSrc);

                const exposed = state.getExposedStateForce<ExposedStateType.image>(this.callee);
                const task = exposed.applyTransition(transition, () => {
                    this.callee.state.currentSrc = newTags as [];
                    awaitable.resolve(super.executeAction(state, injection) as CalledActionResult);
                });
                const timeline = state.timelines
                    .attachTimeline(awaitable)
                    .attachChild(task);
                state.actionHistory.push({
                    action: this,
                    stackModel: injection.stackModel,
                    timeline
                }, handleUndo, []);

                return awaitable;
            }
            this.callee.state.currentSrc = newTags as [];
            state.actionHistory.push({
                action: this,
                stackModel: injection.stackModel
            }, handleUndo);

            return super.executeAction(state, injection);
        } else if (this.type === ImageActionTypes.setDarkness) {
            const [darkness, duration, easing] = (this.contentNode as ContentNode<ImageActionContentType["image:setDarkness"]>).getContent();
            const oldDarkness = this.callee.state.darkness;
            const handleUndo = () => {
                this.callee.state.darkness = oldDarkness;
            };
            const exposed = state.getExposedStateForce<ExposedStateType.image>(this.callee);

            if (duration && easing) {
                const imageSrc= ImageAction.resolveCurrentSrc(this.callee);
                const awaitable = new Awaitable<CalledActionResult>(v => v);
                const transition = new Darkness(oldDarkness, darkness, duration, easing)
                    ._setPrevSrc(imageSrc)
                    ._setTargetSrc(imageSrc);
                
                const task = exposed.applyTransition(transition, () => {
                    this.callee.state.darkness = darkness;
                    awaitable.resolve(super.executeAction(state, injection) as CalledActionResult);
                });

                const timeline = state.timelines
                    .attachTimeline(awaitable)
                    .attachChild(task);
                state.actionHistory.push({
                    action: this,
                    stackModel: injection.stackModel,
                    timeline
                }, () => {
                    if (!awaitable.isSettled()) {
                        awaitable.abort();
                    }
                    task.abort();
                    handleUndo();
                });

                return awaitable;
            }

            this.callee.state.darkness = darkness;
            state.actionHistory.push({
                action: this,
                stackModel: injection.stackModel
            }, handleUndo);

            exposed.updateStyleSync();
            return super.executeAction(state, injection);
        }

        throw super.unknownTypeError();
    }

    stringify(_story: Story, _seen: Set<LogicAction.Actions>, _strict: boolean): string {
        return super.stringifyWithName("ImageAction");
    }
}