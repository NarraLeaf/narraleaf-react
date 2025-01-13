import {CommonDisplayableConfig} from "@core/types";
import {LogicAction} from "@core/action/logicAction";
import {Config, ConfigConstructor, MergeConfig} from "@lib/util/config";
import {TransformState} from "@core/elements/transform/transform";
import {EmptyObject} from "./transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {Displayable, DisplayableEventTypes} from "@core/elements/displayable/displayable";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {EventDispatcher} from "@lib/util/data";
import {LayerAction} from "@core/action/actions/layerAction";
import {
    DisplayableActionContentType,
    DisplayableActionTypes,
    LayerActionContentType,
    LayerActionTypes
} from "@core/action/actionTypes";
import {ContentNode} from "@core/action/tree/actionTree";
import {DisplayableAction} from "@core/action/actions/displayableAction";
import {Image} from "@core/elements/displayable/image";
import {Text} from "@core/elements/displayable/text";

export interface ILayerUserConfig extends CommonDisplayableConfig {
    /**
     * The z-index of the layer, higher z-index will be rendered on top of the lower z-index, allows negative values.
     *
     * **Note**: the default background layer has a z-index of -1, and the default displayable layer has a z-index of 0.
     */
    zIndex: number;
}

/**@internal */
type LayerConfig = {
    name: string;
    zIndex: number;
};
/**@internal */
type LayerState = {
    displayables: LogicAction.DisplayableElements[];
    zIndex: number;
};
/**@internal */
type LayerDataRaw = Record<string, any>;
/**@internal */
export type LayerEventTypes = {} & DisplayableEventTypes<any>;

export class Layer
    extends Displayable<LayerDataRaw, Layer, TransformDefinitions.ImageTransformProps>
    implements EventfulDisplayable<any> {

    /**
     * @internal
     * {@link ILayerUserConfig}
     */
    static DefaultUserConfig = new ConfigConstructor<ILayerUserConfig, EmptyObject>({
        zIndex: 0,
        ...TransformState.DefaultTransformState.getDefaultConfig(),
        opacity: 1,
    });

    /**
     * @internal
     * {@link LayerConfig}
     */
    static DefaultConfig = new ConfigConstructor<LayerConfig, EmptyObject>({
        name: "(anonymous)",
        zIndex: 0,
    });

    /**
     * @internal
     * {@link LayerState}
     */
    static DefaultState = new ConfigConstructor<LayerState, EmptyObject>({
        displayables: [],
        zIndex: 0,
    });
    /**@internal */
    public config: LayerConfig;
    /**@internal */
    public state: LayerState;
    /**@internal */
    public transformState: TransformState<TransformDefinitions.ImageTransformProps>;
    /**@internal */
    public readonly events: EventDispatcher<LayerEventTypes> = new EventDispatcher();
    /**@internal */
    private userConfig: Config<ILayerUserConfig>;

    constructor(name?: string, config: Partial<ILayerUserConfig> = {}) {
        super();
        const userConfig = Layer.DefaultUserConfig.create(config);
        const layerConfig = Layer.DefaultConfig.create({
            ...userConfig.get(),
            name,
        });

        this.userConfig = userConfig;
        this.config = layerConfig.get();
        this.state = this.getInitialState();
        this.transformState = this.getInitialTransformState();
    }

    /**
     * Include displayables in the layer.
     *
     * Same as {@link Displayable.useLayer}
     */
    public include(elements: (Image | Text)[] | Image | Text): this {
        const e = Array.isArray(elements) ? elements : [elements];
        e.forEach((element) => {
            element.useLayer(this);
        });
        return this;
    }

    /**@internal */
    copy(): Layer {
        return new Layer(this.config.name, this.userConfig.get());
    }

    /**@internal */
    private getInitialState(): MergeConfig<LayerState> {
        return Layer.DefaultState.create({
            zIndex: this.config.zIndex,
        }).get();
    }

    /**@internal */
    private getInitialTransformState(): TransformState<TransformDefinitions.ImageTransformProps> {
        const [transformState] = this.userConfig.extract(TransformState.DefaultTransformState.keys());
        return new TransformState(TransformState.DefaultTransformState.create(transformState.get()).get());
    }

    /**@internal */
    _init(): LogicAction.Actions[] {
        return [
            new LayerAction(this.chain(), LayerActionTypes.action, new ContentNode<LayerActionContentType["layer:action"]>()),
            new DisplayableAction<typeof DisplayableActionTypes.init>(
                this.chain(),
                DisplayableActionTypes.init,
                new ContentNode<DisplayableActionContentType["displayable:init"]>().setContent([
                    null, null, false
                ])
            )
        ];
    }
    /**@internal */
    /**@internal */
}
