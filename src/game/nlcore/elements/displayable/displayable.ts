import {Actionable} from "@core/action/actionable";
import {Transform, TransformState} from "@core/elements/transform/transform";
import {DisplayableAction} from "@core/action/actions/displayableAction";
import {DisplayableActionContentType, DisplayableActionTypes} from "@core/action/actionTypes";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/action/logicAction";
import {ContentNode} from "@core/action/tree/actionTree";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {SrcManager} from "@core/action/srcManager";
import type {ImageSrc} from "@core/types";
import {Utils} from "@core/common/Utils";

export abstract class Displayable<
    StateData extends Record<string, any>,
    Self extends Displayable<any, any, any>,
    TransformType extends TransformDefinitions.Types = TransformDefinitions.Types,
>
    extends Actionable<StateData, Self>
    implements EventfulDisplayable {

    /**@internal */
    public readonly srcManager = new SrcManager();

    /**@internal */
    abstract transformState: TransformState<any>;

    /**
     * Set Image Position
     *
     * @param position - The position of the image, expected {@link RawPosition} or {@link IPosition}
     * @param duration - The duration of the position animation
     * @param easing - The easing of the position animation
     * @chainable
     * @example
     * ```ts
     * element.pos({ xalign: 0.3 }, 1000, "linear");
     * ```
     */
    public pos(
        position: TransformDefinitions.ImageTransformProps["position"],
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Self, Chained<LogicAction.Actions>> {
        return this.transform(new Transform<TransformType>({
            position,
        } as TransformType, {
            duration,
            ease: easing,
        }));
    }

    /**
     * Set the zoom of the current staging sequence.
     * @param zoom - The zoom of the transform. use `1` to keep the original size
     * @param duration - Optional duration of the zoom.
     * @param easing - Optional easing function.
     * @example
     * ```ts
     * element.zoom(2, 1000, "linear");
     * ```
     */
    public zoom(
        zoom: number,
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Self, Chained<LogicAction.Actions>> {
        return this.transform(new Transform<TransformType>({
            zoom,
        } as TransformType, {
            duration,
            ease: easing,
        }));
    }

    /**
     * Set the scale of the current staging sequence on x axis.
     * @param scaleX - The scale of the transform on x axis.
     * @example
     * ```ts
     * element.scaleX(1.5, 1000, "easeInOut");
     * ```
     */
    public scaleX(
        scaleX: number,
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Self, Chained<LogicAction.Actions>> {
        return this.transform(new Transform<TransformType>({
            scaleX,
        } as TransformType, {
            duration,
            ease: easing,
        }));
    }

    /**
     * Set the scale of the current staging sequence on y axis.
     * @param scaleY - The scale of the transform on y axis.
     * @example
     * ```ts
     * element.scaleY(0.8, 1000, "easeInOut");
     * ```
     */
    public scaleY(
        scaleY: number,
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Self, Chained<LogicAction.Actions>> {
        return this.transform(new Transform<TransformType>({
            scaleY,
        } as TransformType, {
            duration,
            ease: easing,
        }));
    }

    /**
     * Set the scale of the current staging sequence.
     * @param scaleX - The scale of the transform on x axis. use negative value to invert the scale
     * @param scaleY - The scale of the transform on y axis. use negative value to invert the scale
     * @example
     * ```ts
     * element.scale(1.2, 0.9, 1000, "easeInOut");
     * ```
     */
    public scale(
        scaleX: number,
        scaleY: number,
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Self, Chained<LogicAction.Actions>> {
        return this.transform(new Transform<TransformType>({
            scaleX,
            scaleY,
        } as TransformType, {
            duration,
            ease: easing,
        }));
    }

    /**
     * Set the scale of the current staging sequence on x and y axis.
     * @param scaleX - The scale of the transform on x axis. use negative value to invert the scale
     * @param scaleY - The scale of the transform on y axis. use negative value to invert the scale
     * @alias {@link Displayable.scale}
     * @example
     * ```ts
     * element.scaleXY(1.2, 0.9, 1000, "easeInOut");
     * ```
     */
    public scaleXY(
        scaleX: number,
        scaleY: number,
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Self, Chained<LogicAction.Actions>> {
        return this.scale(scaleX, scaleY, duration, easing);
    }

    /**
     * Set Image Rotation
     * @param rotation - The rotation of the image, in degrees
     * @param duration - The duration of the rotation animation
     * @param easing - The easing of the rotation animation
     * @chainable
     * @example
     * ```ts
     * element.rotate(90, 1000, "easeInOut");
     * ```
     */
    public rotate(
        rotation: number,
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Self, Chained<LogicAction.Actions>> {
        return this.transform(new Transform<TransformType>({
            rotation,
        } as TransformType, {
            duration,
            ease: easing,
        }));
    }

    /**
     * Set Image Opacity
     * @param opacity - The opacity of the image, between 0 and 1
     * @param duration - The duration of the opacity animation
     * @param easing - The easing of the opacity animation
     * @chainable
     * @example
     * ```ts
     * element.opacity(0.5, 1000, "easeInOut");
     * ```
     */
    public opacity(
        opacity: number,
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Self, Chained<LogicAction.Actions>> {
        return this.transform(new Transform<TransformType>({
            opacity,
        } as TransformType, {
            duration,
            ease: easing,
        }));
    }

    /**
     * Apply visual effects to the Displayable.
     *
     * This is the low-level effect entry. Resource-aware helpers such as
     * {@link Displayable.mask} should be preferred when an effect depends on an image source.
     *
     * @chainable
     */
    public effect(
        effect: TransformDefinitions.VisualEffectTransformProps,
        options?: TransformDefinitions.VisualEffectOptions
    ): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        this.registerEffectSrc(effect);

        return this.transform(new Transform<TransformType>(
            effect as TransformType,
            options
        ));
    }

    /**
     * Apply an image mask to the Displayable.
     *
     * The source is registered for image preload and resolved to a CSS `url(...)` mask image.
     *
     * @chainable
     */
    public mask(
        src: ImageSrc,
        options: TransformDefinitions.MaskOptions = {}
    ): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        const imageUrl = Utils.srcToURL(src);
        const {
            maskSize,
            maskPosition,
            maskRepeat,
            maskMode,
            ...transitionOptions
        } = options;

        this.srcManager.registerRawSrc(imageUrl);

        return this.effect({
            maskImage: Displayable.toCSSUrl(imageUrl),
            maskSize,
            maskPosition,
            maskRepeat,
            maskMode,
        }, transitionOptions);
    }

    /**
     * Clear the current CSS mask from the Displayable.
     *
     * @chainable
     */
    public clearMask(
        options?: TransformDefinitions.VisualEffectOptions
    ): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        return this.effect({
            maskImage: "none",
            maskSize: "auto",
            maskPosition: "0% 0%",
            maskRepeat: "repeat",
            maskMode: "match-source",
        }, options);
    }

    /**
     * Apply a CSS clip-path to the Displayable.
     *
     * @chainable
     */
    public clip(
        clipPath: TransformDefinitions.VisualEffectTransformProps["clipPath"],
        options?: TransformDefinitions.VisualEffectOptions
    ): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        return this.effect({clipPath}, options);
    }

    /**
     * Clear the current CSS clip-path from the Displayable.
     *
     * @chainable
     */
    public clearClip(
        options?: TransformDefinitions.VisualEffectOptions
    ): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        return this.effect({clipPath: "none"}, options);
    }

    /**
     * Apply a CSS filter to the Displayable.
     *
     * @chainable
     */
    public filter(
        filter: TransformDefinitions.VisualEffectTransformProps["filter"],
        options?: TransformDefinitions.VisualEffectOptions
    ): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        return this.effect({filter}, options);
    }

    /**
     * Clear the current CSS filter from the Displayable.
     *
     * @chainable
     */
    public clearFilter(
        options?: TransformDefinitions.VisualEffectOptions
    ): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        return this.effect({filter: "none"}, options);
    }

    /**
     * Apply a CSS backdrop-filter to the Displayable.
     *
     * @chainable
     */
    public backdrop(
        backdropFilter: TransformDefinitions.VisualEffectTransformProps["backdropFilter"],
        options?: TransformDefinitions.VisualEffectOptions
    ): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        return this.effect({backdropFilter}, options);
    }

    /**
     * Apply a CSS mix-blend-mode to the Displayable.
     *
     * @chainable
     */
    public blend(
        mixBlendMode: TransformDefinitions.VisualEffectTransformProps["mixBlendMode"],
        options?: TransformDefinitions.VisualEffectOptions
    ): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        return this.effect({mixBlendMode}, options);
    }

    /**
     * Apply a transform to the Displayable
     * @chainable
     * @example
     * ```ts
     * element.transform(new Transform(\/* Transform Definitions *\/));
     * ```
     */
    public transform(transform: Transform<TransformType>): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        const chain: Proxied<Self, Chained<LogicAction.Actions, Self>> = this.chain();
        const action = new DisplayableAction<typeof DisplayableActionTypes.applyTransform, Self>(
            chain,
            DisplayableActionTypes.applyTransform,
            new ContentNode<DisplayableActionContentType["displayable:applyTransform"]>().setContent([
                transform.copy(),
            ])
        );
        return chain.chain(action);
    }

    private registerEffectSrc(effect: TransformDefinitions.VisualEffectTransformProps): void {
        const maskImage = effect.maskImage;

        if (typeof maskImage !== "string") {
            return;
        }

        for (const src of Displayable.extractCSSUrls(maskImage)) {
            this.srcManager.registerRawSrc(src);
        }
    }

    private static toCSSUrl(src: string): string {
        return `url("${src.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}")`;
    }

    private static extractCSSUrls(value: string): string[] {
        const urls: string[] = [];
        const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(value))) {
            const src = match[1] || match[2] || match[3];
            if (src) {
                urls.push(src.trim());
            }
        }

        return urls;
    }

    /**
     * Show the Displayable
     *
     * if options are provided, the displayable will show with the provided transform options
     * @example
     * ```ts
     * text.show({
     *     duration: 1000,
     * });
     * ```
     * @chainable
     */
    public show(): Proxied<Self, Chained<LogicAction.Actions>>;

    public show(options: Transform<TransformType>): Proxied<Self, Chained<LogicAction.Actions>>;

    public show(options: Partial<TransformDefinitions.CommonTransformProps>): Proxied<Self, Chained<LogicAction.Actions>>;

    public show(options?: Transform<TransformType> | Partial<TransformDefinitions.CommonTransformProps>): Proxied<Self, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        const trans =
            (options instanceof Transform) ? options.copy() : new Transform<TransformType>({
                opacity: 1,
            } as TransformType, options);
        const action = new DisplayableAction<typeof DisplayableActionTypes.applyTransform, Self>(
            chain,
            DisplayableActionTypes.applyTransform,
            new ContentNode<DisplayableActionContentType["displayable:applyTransform"]>().setContent([
                trans
            ])
        );
        return chain.chain(action);
    }

    /**
     * Hide the Displayable
     *
     * if options are provided, the displayable will hide with the provided transform options
     * @example
     * ```ts
     * text.hide({
     *     duration: 1000,
     * });
     * ```
     * @chainable
     */
    public hide(): Proxied<Self, Chained<LogicAction.Actions>>;

    public hide(options: Transform<TransformType>): Proxied<Self, Chained<LogicAction.Actions>>;

    public hide(options: Partial<TransformDefinitions.CommonTransformProps>): Proxied<Self, Chained<LogicAction.Actions>>;

    public hide(options?: Transform<TransformType> | Partial<TransformDefinitions.CommonTransformProps>): Proxied<Self, Chained<LogicAction.Actions>> {
        const chain = this.chain();
        const trans =
            (options instanceof Transform) ? options.copy() : new Transform<TransformType>({
                opacity: 0,
            } as TransformType, options);
        const action = new DisplayableAction<typeof DisplayableActionTypes.applyTransform, Self>(
            chain,
            DisplayableActionTypes.applyTransform,
            new ContentNode<DisplayableActionContentType["displayable:applyTransform"]>().setContent([
                trans,
            ])
        );
        return chain.chain(action);
    }
}
