import {Actionable} from "@core/action/actionable";
import {Transform, TransformState} from "@core/elements/transform/transform";
import {DisplayableAction} from "@core/action/actions/displayableAction";
import {DisplayableActionContentType, DisplayableActionTypes} from "@core/action/actionTypes";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/action/logicAction";
import {ContentNode} from "@core/action/tree/actionTree";
import {DisplayableLoopBinding, EventfulDisplayable} from "@player/elements/displayable/type";
import type {TransformDefinitions} from "@core/elements/transform/type";
import {SrcManager} from "@core/action/srcManager";
import type {ImageSrc} from "@core/types";
import {Utils} from "@core/common/Utils";
import {Control} from "@core/elements/control";

/**
 * A looping transform as it goes into a save.
 *
 * The transform itself is **not** here, and cannot be: its easing may be a function, and a function
 * does not survive a round trip through JSON. What is stored instead is the id of the action that
 * started the loop — the transform is authored data hanging off that action's content node, so the
 * story itself still holds it, and loading resolves the id back to it through the same action map
 * the stack model is restored with. A save whose action the story no longer has simply loses the
 * loop rather than failing to load.
 *
 * Public, unlike the rest of the loop plumbing, because every displayable's `*DataRaw` names it and
 * those are public. An internal-tagged type reached from a public signature is deleted from the
 * emitted declarations while the signature that uses it stays behind naming something that is no
 * longer declared, and only the consumer's `skipLibCheck` hides the result.
 *
 * (Do not write that tag in prose here: `stripInternal` matches it anywhere in the comment, so
 * merely describing the hazard is enough to cause it.)
 */
export type DisplayableLoopRaw = {
    actionId: string;
    options: TransformDefinitions.LoopOptions;
};

export abstract class Displayable<
    StateData extends Record<string, any>,
    Self extends Displayable<any, any, any>,
    TransformType extends TransformDefinitions.Types = TransformDefinitions.Types,
>
    extends Actionable<StateData, Self>
    implements EventfulDisplayable {

    /**@internal */
    public readonly srcManager = new SrcManager();

    /**
     * The element's live prop bag: where it sits, how big, how it is filtered.
     *
     * **One object for the element's whole life.** `readonly` is the point of this declaration, not a
     * detail of it: a mounted host binds a displayable once and keeps the *reference* it captured
     * then, animating and repainting that object for as long as it stays mounted. Handing the
     * element a replacement leaves the host driving an orphan — the animation writes one object
     * while the settled repaint reads another — and nothing reports it, because both objects are
     * perfectly valid on their own.
     *
     * So the contents may be changed or emptied at any time ({@link TransformState.resetTo} is what
     * `reset()` and `fromData()` use); the object may not be swapped. Only the constructor assigns
     * it, which is what `readonly` still allows and the only moment no host can be holding it.
     * @internal
     */
    abstract readonly transformState: TransformState<any>;

    /**
     * The looping transform this element declares, and the action that declared it.
     *
     * Kept apart from {@link transformState} on purpose. A loop is not a pose — it is a motion
     * *around* one — so the state keeps the pose the element had when the loop started, and the
     * loop is what a host plays on top of it. Everything that reads a settled pose (the save, the
     * repaint that heals a corrupted transform, the transform that interrupts the loop) therefore
     * reads a stable value rather than whatever frame the oscillation was on.
     * @internal
     */
    private loopTransform: Transform | null = null;
    /**@internal */
    private loopOptions: TransformDefinitions.LoopOptions = {};
    /**@internal */
    private loopActionId: string | null = null;

    /**@internal */
    public _getLoop(): DisplayableLoopBinding | null {
        return this.loopTransform
            ? {transform: this.loopTransform, options: this.loopOptions}
            : null;
    }

    /**@internal */
    public _setLoop(transform: Transform | null, options: TransformDefinitions.LoopOptions, actionId: string | null): this {
        this.loopTransform = transform;
        this.loopOptions = transform ? options : {};
        this.loopActionId = transform ? actionId : null;
        return this;
    }

    /**@internal */
    public _getLoopActionId(): string | null {
        return this.loopActionId;
    }

    /**@internal */
    public _serializeLoop(): DisplayableLoopRaw | null {
        // The anchor, not the transform: between a load and {@link _rebindLoop} the transform is
        // legitimately still unresolved, and a save taken from that window has to carry the loop
        // rather than quietly drop it.
        if (!this.loopActionId) {
            return null;
        }
        return {
            actionId: this.loopActionId,
            options: {...this.loopOptions},
        };
    }

    /**
     * Take the loop's anchor out of a save. The transform stays unresolved until
     * {@link _rebindLoop} is given the action map — see {@link DisplayableLoopRaw}.
     * @internal
     */
    public _deserializeLoop(raw: DisplayableLoopRaw | null | undefined): this {
        this.loopTransform = null;
        this.loopOptions = raw ? {...raw.options} : {};
        this.loopActionId = raw ? raw.actionId : null;
        return this;
    }

    /**
     * Resolve a deserialized loop anchor back to the transform the story holds.
     * @internal
     */
    public _rebindLoop(actionMap: Map<string, LogicAction.Actions>): this {
        if (!this.loopActionId || this.loopTransform) {
            return this;
        }
        const action = actionMap.get(this.loopActionId);
        const content = action?.contentNode?.getContent();
        const transform = Array.isArray(content) ? content[0] : undefined;
        if (!(transform instanceof Transform)) {
            // The save names an action this story no longer has (or no longer starts a loop with).
            // Dropping the loop is the only honest outcome; the pose is unaffected either way.
            return this._setLoop(null, {}, null);
        }
        this.loopTransform = transform;
        return this;
    }

    /**@internal */
    override reset() {
        super.reset();
        this._setLoop(null, {}, null);
    }

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
     * Reveal the Displayable with an animated circular clip-path.
     *
     * @chainable
     */
    public circleReveal(
        options: TransformDefinitions.CircleRevealOptions = {}
    ): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        const {
            center = "50% 50%",
            from = 0,
            to = 150,
            clearClip = true,
            duration = 600,
            ease = "easeInOut",
            ...transitionOptions
        } = options;
        const animationOptions = {duration, ease, ...transitionOptions};

        const transform = Displayable.createClipPathTransform<TransformType>([
            [Displayable.circleClipPath(from, center), {duration: 0}],
            [Displayable.circleClipPath(to, center), animationOptions],
        ]);

        if (!clearClip) {
            return this.transform(transform);
        }

        return this.combineActions(new Control(), chain =>
            chain
                .transform(transform)
                .clearClip({duration: 0})
        );
    }

    /**
     * Close the Displayable with an animated circular clip-path.
     *
     * @chainable
     */
    public circleClose(
        options: TransformDefinitions.CircleCloseOptions = {}
    ): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        const {
            center = "50% 50%",
            from = 150,
            to = 0,
            clearClip = false,
            duration = 600,
            ease = "easeInOut",
            ...transitionOptions
        } = options;
        const animationOptions = {duration, ease, ...transitionOptions};

        const transform = Displayable.createClipPathTransform<TransformType>([
            [Displayable.circleClipPath(from, center), {duration: 0}],
            [Displayable.circleClipPath(to, center), animationOptions],
        ]);

        if (!clearClip) {
            return this.transform(transform);
        }

        return this.combineActions(new Control(), chain =>
            chain
                .transform(transform)
                .clearClip({duration: 0})
        );
    }

    /**
     * Reveal or close the Displayable with an animated directional wipe.
     *
     * @chainable
     */
    public wipe(
        options: TransformDefinitions.WipeOptions = {}
    ): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        const {
            direction = "left",
            reverse = false,
            clearClip = !reverse,
            duration = 600,
            ease = "easeInOut",
            ...transitionOptions
        } = options;
        const animationOptions = {duration, ease, ...transitionOptions};
        const hidden = Displayable.wipeClipPath(direction, 100);
        const visible = Displayable.wipeClipPath(direction, 0);

        const transform = Displayable.createClipPathTransform<TransformType>([
            [reverse ? visible : hidden, {duration: 0}],
            [reverse ? hidden : visible, animationOptions],
        ]);

        if (!clearClip) {
            return this.transform(transform);
        }

        return this.combineActions(new Control(), chain =>
            chain
                .transform(transform)
                .clearClip({duration: 0})
        );
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

    /**
     * Play a transform on this element over and over until something stops it.
     *
     * **The line does not wait.** This is the one difference from {@link Displayable.transform}, and
     * the only one worth remembering: `transform()` is a step of the story and the next line waits
     * for it to finish, while `loop()` is a property the element carries — it is set, the story
     * moves on, and the motion keeps running underneath everything that follows.
     *
     * An element carries **one** transform at a time, so anything else applied to it takes the
     * element back: `transform()`, `pos()`, `zoom()`, `show()`, `hide()` and the rest all end the
     * loop and move on from wherever it had got to. What does *not* end it: the player skipping or
     * fast-forwarding, a transition changing the picture, changing scene, or saving and loading —
     * a loaded save puts the loop back.
     *
     * The pose the element had when the loop started is what it returns to, and the only thing a
     * save records; the frames in between are never written down.
     *
     * The transform has to be committed, exactly as for {@link Displayable.transform} — a staged
     * change that was never `commit()`ed is not part of it.
     *
     * @param transform - The motion to repeat. For anything that should not snap on each repeat,
     * either bring it back to where it started or pass `{repeatType: "mirror"}`.
     * @param options - See {@link TransformDefinitions.LoopOptions}.
     * @chainable
     * @example
     * ```ts
     * const breathe = Transform.create()
     *     .scaleY(1.015)
     *     .commit({ duration: 1900, ease: "easeInOut" });
     *
     * scene.action([
     *     yuko.loop(breathe, { repeatType: "mirror" }),
     *     yuko.say`...`,                  // plays while she keeps breathing
     *     yuko.stopLoop({ duration: 300 }),
     * ]);
     * ```
     */
    public loop(
        transform: Transform<TransformType>,
        options?: TransformDefinitions.LoopOptions
    ): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        const chain: Proxied<Self, Chained<LogicAction.Actions, Self>> = this.chain();
        const action = new DisplayableAction<typeof DisplayableActionTypes.applyLoop, Self>(
            chain,
            DisplayableActionTypes.applyLoop,
            new ContentNode<DisplayableActionContentType["displayable:applyLoop"]>().setContent([
                transform.copy(),
                options,
            ])
        );
        return chain.chain(action);
    }

    /**
     * End the element's looping transform and put it back to the pose it had before the loop
     * started.
     *
     * Unlike {@link Displayable.loop}, this **is** something the line waits for — there is a
     * definite end to wait for. With no duration the element is back in place on the same frame.
     *
     * A no-op on an element that is not looping.
     *
     * @chainable
     * @example
     * ```ts
     * yuko.stopLoop({ duration: 300, ease: "easeOut" });
     * ```
     */
    public stopLoop(
        options?: TransformDefinitions.LoopStopOptions
    ): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        const chain: Proxied<Self, Chained<LogicAction.Actions, Self>> = this.chain();
        const action = new DisplayableAction<typeof DisplayableActionTypes.stopLoop, Self>(
            chain,
            DisplayableActionTypes.stopLoop,
            new ContentNode<DisplayableActionContentType["displayable:stopLoop"]>().setContent([
                options,
            ])
        );
        return chain.chain(action);
    }

    /**
     * Bring the Displayable to the front of the layer it is on.
     *
     * Within one layer the order elements are shown in is the order they were added in, so the one
     * added last is drawn over the others. This moves the element to the end of that order, and
     * nothing else about it changes — it stays on the same layer, keeps its transform, and the move
     * is instant.
     *
     * Depth *between* layers is a separate thing, decided by each layer's z-index; this cannot lift
     * an element above one that sits on a higher layer.
     *
     * The new order is part of the saved game, so a save taken afterwards restores it.
     *
     * @chainable
     * @example
     * ```ts
     * scene.action([
     *     yukoSprite.bringToFront(),
     *     yuko.say`It was me, all along.`,
     * ]);
     * ```
     */
    public bringToFront(): Proxied<Self, Chained<LogicAction.Actions, Self>> {
        const chain: Proxied<Self, Chained<LogicAction.Actions, Self>> = this.chain();
        const action = new DisplayableAction<typeof DisplayableActionTypes.bringToFront, Self>(
            chain,
            DisplayableActionTypes.bringToFront,
            new ContentNode<DisplayableActionContentType["displayable:bringToFront"]>().setContent([])
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

    private static createClipPathTransform<T extends TransformDefinitions.Types>(
        frames: readonly (readonly [
            TransformDefinitions.VisualEffectTransformProps["clipPath"],
            TransformDefinitions.VisualEffectOptions
        ])[]
    ): Transform<T> {
        return new Transform<T>(frames.map(([clipPath, options]) => ({
            props: {clipPath} as Partial<T>,
            options,
        })));
    }

    private static circleClipPath(radius: number, center: string): string {
        return `circle(${radius}% at ${center})`;
    }

    private static wipeClipPath(
        direction: TransformDefinitions.WipeDirection,
        amount: number
    ): string {
        switch (direction) {
            case "right":
                return `inset(0 0 0 ${amount}%)`;
            case "top":
                return `inset(0 0 ${amount}% 0)`;
            case "bottom":
                return `inset(${amount}% 0 0 0)`;
            case "left":
            default:
                return `inset(0 ${amount}% 0 0)`;
        }
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
