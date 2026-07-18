import { Actionable } from "@core/action/actionable";
import { LogicAction } from "@core/action/logicAction";
import { ContentNode } from "@core/action/tree/actionTree";
import { Chained, Proxied } from "@core/action/chain";
import { SceneAction } from "@core/action/actions/sceneAction";
import { SceneActionContentType, SceneActionTypes } from "@core/action/actionTypes";
import type { TransformDefinitions } from "@core/elements/transform/type";
import type { Scene } from "@core/elements/scene";

type ChainedNVL = Proxied<NVLToken, Chained<LogicAction.Actions>>;

export class NVLToken extends Actionable<null, NVLToken> {
    /**@internal */
    private readonly scene: Scene;

    constructor(scene: Scene) {
        super();
        this.scene = scene;
    }

    /**
     * Show the NVL layer with optional transition
     * @param options - Optional transition properties for showing the NVL layer
     * @chainable
     * @example
     * ```ts
     * nvl.show({ duration: 500 });
     * ```
     */
    public show(options?: Partial<TransformDefinitions.CommonTransformProps>): ChainedNVL {
        const action = new SceneAction<typeof SceneActionTypes.nvlShow>(
            this.scene.chain() as any,
            SceneActionTypes.nvlShow,
            new ContentNode<SceneActionContentType["scene:nvlShow"]>().setContent([options])
        );
        return this.chain(action);
    }

    /**
     * Hide the NVL layer with optional transition
     * Does not exit NVL mode or clear dialogs
     * @param options - Optional transition properties for hiding the NVL layer
     * @chainable
     * @example
     * ```ts
     * nvl.hide({ duration: 500 });
     * ```
     */
    public hide(options?: Partial<TransformDefinitions.CommonTransformProps>): ChainedNVL {
        const action = new SceneAction<typeof SceneActionTypes.nvlHide>(
            this.scene.chain() as any,
            SceneActionTypes.nvlHide,
            new ContentNode<SceneActionContentType["scene:nvlHide"]>().setContent([options])
        );
        return this.chain(action);
    }

    /**
     * Force exit NVL mode immediately
     * Clears all accumulated dialogs and hides the NVL layer
     * @chainable
     * @example
     * ```ts
     * nvl.end();
     * ```
     */
    public end(): ChainedNVL {
        const action = new SceneAction<typeof SceneActionTypes.nvlEnd>(
            this.scene.chain() as any,
            SceneActionTypes.nvlEnd,
            new ContentNode<SceneActionContentType["scene:nvlEnd"]>().setContent([])
        );
        return this.chain(action);
    }
}
