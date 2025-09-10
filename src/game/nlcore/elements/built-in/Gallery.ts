import { Lambda } from "../condition";
import { ScriptCtx } from "../script";
import { Service, ServiceHandlerCtx } from "../service";

type GalleryActions<T extends Record<string, any>> = {
    "add": [name: string, metadata: T | ((ctx: ScriptCtx) => T)];
    "remove": [name: string];
    "clear": [];
};

/**
 * A utility to manage a gallery of items
 * @template Metadata - The metadata of the items
 * @class
 * @example
 * ```ts
 * const gallery = new Gallery<{timestamp: number}>();
 * 
 * scene.action([
 *   gallery.add("item", () => ({
 *     timestamp: Date.now(),
 *   }))
 * ]);
 * 
 * scene.action([
 *   gallery.remove("item")
 * ]);
 * 
 * scene.action([
 *   Condition.If(gallery.has("item"), [
 *     // ...
 *   ])
 * ]);
 * ```
 * 
 * to use this class, you need to register it in the story:  
 * ```ts
 * story.registerService("gallery", gallery);
 * ```
 * 
 * After registering, you can access the gallery using game context:  
 * ```ts
 * const liveGame = useLiveGame();
 * 
 * const gallery = liveGame.story?.getService<Gallery<{timestamp: number}>>("gallery");
 * 
 * if (gallery) {
 *   console.log("All items in the gallery:", gallery.$getAll());
 * }
 * ```
 */
export class Gallery<Metadata extends Record<string, any>> extends Service<GalleryActions<Metadata>> {
    private unlocked: Record<string, Metadata> = {};
 
    constructor() {
        super();
 
        this.setupActions();
    }

    serialize(): Record<string, any> | null {
        return {
            unlocked: this.unlocked
        };
    }

    deserialize(data: Record<string, any>): void {
        this.unlocked = data.unlocked;
    }

    /**
     * Add an item to the gallery
     * @chainable
     * @param name - The name of the item to add
     * @example
     * ```ts
     * scene.action([
     *   gallery.add("item", {
     *     // ...
     *   })
     * ]);
     * 
     * // or
     * 
     * scene.action([
     *   gallery.add("item", (ctx) => {
     *     return {
     *       timestamp: Date.now(),
     *     };
     *   })
     * ]);
     * ```
     */
    public add(name: string, metadata: Metadata | ((ctx: ScriptCtx) => Metadata)) {
        return this.trigger("add", name, metadata);
    }

    /**
     * Check if an item is in the gallery
     * @param name - The name of the item to check
     * @returns A lambda that returns true if the item is in the gallery, false otherwise
     * @example
     * ```ts
     * Condition.If(gallery.has("item"), [
     *     // ...
     * ])
     * ```
     */
    public has(name: string): Lambda<boolean> {
        return new Lambda(() => {
            return this.unlocked[name] !== undefined;
        });
    }

    /**
     * Remove an item from the gallery
     * @chainable
     * @param name - The name of the item to remove
     * @example
     * ```ts
     * scene.action([
     *   gallery
     *     .remove("item")
     *     .remove("item2"),
     * ]);
     * ```
     */
    public remove(name: string) {
        return this.trigger("remove", name);
    }

    /**
     * Clear the gallery
     * @chainable
     * @example
     * ```ts
     * scene.action([
     *   gallery.clear()
     * ]);
     * ```
     */
    public clear() {
        return this.trigger("clear");
    }

    /**
     * Remove an item from the gallery INSTANTLY
     * @param name - The name of the item to remove
     */
    public $remove(name: string) {
        delete this.unlocked[name];
    }

    /**
     * Clear the gallery
     * 
     * After calling this method, the gallery will be empty INSTANTLY
     */
    public $clear() {
        this.unlocked = {};
    }

    /**
     * Get the metadata of an item
     * @param name - The name of the item to get the metadata of
     * @returns The metadata of the item
     */
    public $get(name: string): Metadata | undefined {
        return this.unlocked[name];
    }

    /**
     * Set the metadata of an item
     * @param name - The name of the item to set the metadata of
     * @param metadata - The metadata of the item to set
     */
    public $set(name: string, metadata: Metadata) {
        this.unlocked[name] = metadata;
    }

    /**
     * Get all the items in the gallery
     * @returns All the items in the gallery
     */
    public $getAll(): Record<string, Metadata> {
        return this.unlocked;
    }

    /**
     * Check if an item is in the gallery
     * @param name - The name of the item to check
     * @returns True if the item is in the gallery, false otherwise
     */
    public $has(name: string): boolean {
        return this.unlocked[name] !== undefined;
    }

    /**@internal */
    private setupActions() {
        this.on("add", (ctx: ServiceHandlerCtx, name: string, metadata: Metadata | ((ctx: ScriptCtx) => Metadata)) => {
            const context: ScriptCtx = {
                gameState: ctx.gameState,
                game: ctx.game,
                liveGame: ctx.liveGame,
                storable: ctx.storable,
                $: ctx.$,
            };
            const parsedMetadata = typeof metadata === "function" ? metadata(context) : metadata;
            this.unlocked[name] = parsedMetadata;
        });
        this.on("remove", (_ctx: ServiceHandlerCtx, name: string) => {
            delete this.unlocked[name];
        });
        this.on("clear", (_ctx: ServiceHandlerCtx) => {
            this.$clear();
        });
    }
}