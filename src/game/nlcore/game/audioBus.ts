import { EventDispatcher } from "@lib/util/data";

/**
 * The buses the engine seeds for every game, whatever the host declares.
 *
 * Their ids are the values of {@link import("@core/elements/sound").SoundType} — deliberately, and
 * a test asserts the two never drift apart. Content written before buses existed, and every save
 * ever written, references these three strings; they have to keep meaning what they meant.
 */
export const DefaultAudioBusIds = {
    bgm: "bgm",
    sound: "sound",
    voice: "voice",
} as const;

/**
 * How deep a declared tree may nest, counting the bus itself.
 *
 * Generous on purpose: `voice → cast → alice → alice-shouting` is four, and nothing sane needs
 * eight. The cap exists so a malformed declaration fails at boot with a legible message instead
 * of walking a chain nobody meant to build.
 */
export const MaxAudioBusDepth = 8;

/**
 * One bus, as a host declares it.
 *
 * Only `id` is required. `parentId` omitted (or `null`) hangs the bus directly off the master
 * output; `volume` omitted is full.
 */
export type AudioBusDeclaration = {
    /**
     * Stable, unique across the whole tree, and the string a {@link import("@core/elements/sound").Sound}'s
     * `type` names. Two buses may not share an id even under different parents — the engine
     * addresses buses by id alone.
     */
    id: string;
    /**
     * The bus this one feeds into, or `null`/omitted for the master output.
     */
    parentId?: string | null;
    /**
     * **The author's mix position for this bus**, 0..1 — where it sits relative to the others
     * before any player has touched anything. "SFX sits 40% down in my mix" is `volume: 0.6`.
     *
     * It is not the volume a clip plays at and it is not the player's slider. A player's control
     * is a *separate* number that multiplies on top of this one and defaults to 1, so a player who
     * has changed nothing hears the mix the author built, and a player who pushes a slider to
     * maximum gets the author's intent rather than a bus at full gain. See
     * {@link AudioBusMixer.getVolume}.
     * @default 1
     */
    volume?: number;
};

/**
 * A bus after the tree has been resolved: parent settled, depth known.
 */
export type AudioBusNode = {
    id: string;
    parentId: string | null;
    /**
     * The author's mix position, straight off the declaration. Fixed for the life of the game —
     * what a player moves is a separate number on the mixer.
     */
    volume: number;
    /**
     * 1 for a bus directly under the master output.
     */
    depth: number;
};

/**
 * A bus and both of its numbers.
 *
 * The two are kept apart on purpose. One gain node was being asked to be two things at once — the
 * author's mix position and the player's slider — and whichever was written last silently erased
 * the other. Splitting them makes the layering total and unambiguous:
 * **declared × player = what is on the node**, and neither can overwrite the other.
 */
export type AudioBusState = {
    id: string;
    parentId: string | null;
    /**
     * The player's control, 0..1, default 1. **This is the one to persist** — it is the only half
     * a player owns, and restoring it lets an author re-mix a shipped game without a returning
     * player's saved settings pinning the old mix forever.
     */
    volume: number;
    /**
     * The author's mix position, from {@link AudioBusDeclaration.volume}. Comes from the game, not
     * from storage; persisting it would be persisting the game's own content.
     */
    declaredVolume: number;
    /**
     * `declaredVolume * volume` — what is actually on the gain node.
     */
    effectiveVolume: number;
};

/**
 * A declared bus tree that cannot be realized.
 *
 * Always the host's declaration at fault — an unknown parent, a cycle, a duplicate id, a chain
 * past {@link MaxAudioBusDepth}. The audio backend cannot produce any of these by construction:
 * it builds a child *from* its parent, so its graph is a tree or it does not exist. Everything
 * that can go wrong goes wrong one layer up, here, which is why the validation is here too.
 */
export class AudioBusError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AudioBusError";
    }
}

function normalizeVolume(volume: number | undefined): number {
    if (volume === undefined || !Number.isFinite(volume)) {
        return 1;
    }
    return Math.min(1, Math.max(0, volume));
}

/**
 * The resolved bus graph: every declared bus, in an order a consumer can walk front-to-back
 * knowing each bus's parent has already been seen.
 *
 * Immutable. A tree is realized into audio channels once, at boot, and never re-shaped — removing
 * a channel stops every sound in its subtree, so live re-parenting would cut the music off mid-bar.
 */
export class AudioBusTree {
    /**
     * Resolve a host declaration into a tree, seeding `bgm`/`sound`/`voice` first.
     *
     * A declaration may re-state a seeded id to move it or change its volume; it may not remove
     * one. Forward references are fine — the whole declaration is collected before anything is
     * validated, so `{id: "alice", parentId: "cast"}` may precede `{id: "cast", parentId: "voice"}`.
     *
     * @throws {AudioBusError} on a duplicate id, an unknown parent, a cycle, or a chain deeper
     * than {@link MaxAudioBusDepth}.
     */
    public static resolve(declarations: readonly AudioBusDeclaration[] = []): AudioBusTree {
        const declared = new Map<string, { id: string; parentId: string | null; volume: number }>();

        const put = (declaration: AudioBusDeclaration) => {
            declared.set(declaration.id, {
                id: declaration.id,
                parentId: declaration.parentId ?? null,
                volume: normalizeVolume(declaration.volume),
            });
        };

        Object.values(DefaultAudioBusIds).forEach(id => put({ id }));

        const fromHost = new Set<string>();
        declarations.forEach(declaration => {
            const id = declaration?.id;
            if (typeof id !== "string" || id.trim().length === 0) {
                throw new AudioBusError(`Audio bus id must be a non-empty string, got ${JSON.stringify(id)}.`);
            }
            if (fromHost.has(id)) {
                throw new AudioBusError(`Audio bus "${id}" is declared more than once.`);
            }
            fromHost.add(id);
            put(declaration);
        });

        AudioBusTree.assertResolvable(declared);

        const nodes: AudioBusNode[] = [];
        const index = new Map<string, AudioBusNode>();
        const emit = (id: string): AudioBusNode => {
            const existing = index.get(id);
            if (existing) {
                return existing;
            }
            const raw = declared.get(id)!;
            const parent = raw.parentId === null ? null : emit(raw.parentId);
            const node: AudioBusNode = {
                id: raw.id,
                parentId: raw.parentId,
                volume: raw.volume,
                depth: parent ? parent.depth + 1 : 1,
            };
            index.set(id, node);
            nodes.push(node);
            return node;
        };
        declared.forEach(raw => emit(raw.id));

        return new AudioBusTree(nodes, index);
    }

    /**
     * Whether an id is one the engine seeds itself.
     */
    public static isSeeded(id: string): boolean {
        return (Object.values(DefaultAudioBusIds) as string[]).includes(id);
    }

    /**
     * Everything that can be wrong with a declaration, checked before a single node is built.
     *
     * Walking up from each bus with a visited set catches every shape of cycle at once — a bus
     * parented to itself, a mutual pair, and a longer ring — because a tree walk that revisits a
     * bus it has already stood on cannot terminate.
     */
    private static assertResolvable(
        declared: Map<string, { id: string; parentId: string | null }>,
    ): void {
        declared.forEach(node => {
            const path = [node.id];
            const seen = new Set<string>([node.id]);
            let cursor = node;
            while (cursor.parentId !== null) {
                const parent = declared.get(cursor.parentId);
                if (!parent) {
                    throw new AudioBusError(
                        `Audio bus "${cursor.id}" names an unknown parent "${cursor.parentId}".`,
                    );
                }
                if (seen.has(parent.id)) {
                    throw new AudioBusError(
                        `Audio bus tree has a cycle: ${[...path, parent.id].join(" -> ")}.`,
                    );
                }
                seen.add(parent.id);
                path.push(parent.id);
                if (path.length > MaxAudioBusDepth) {
                    throw new AudioBusError(
                        `Audio bus "${node.id}" nests deeper than ${MaxAudioBusDepth}: ${path.join(" -> ")}.`,
                    );
                }
                cursor = parent;
            }
        });
    }

    private constructor(
        private readonly nodes: readonly AudioBusNode[],
        private readonly index: ReadonlyMap<string, AudioBusNode>,
    ) {
    }

    /**
     * Every bus, parents before their children. Realize channels by walking this front to back.
     */
    public getNodes(): readonly AudioBusNode[] {
        return this.nodes;
    }

    public get(id: string): AudioBusNode | null {
        return this.index.get(id) ?? null;
    }

    public has(id: string): boolean {
        return this.index.has(id);
    }

    /**
     * Whether `id` is `ancestorId` or feeds into it, however many buses down.
     *
     * Inclusive at the top on purpose: a clip on `voice` itself has always been a voice, and this
     * replaces an equality test that said exactly that.
     */
    public isUnder(id: string, ancestorId: string): boolean {
        let cursor = this.index.get(id);
        let steps = 0;
        while (cursor && steps <= MaxAudioBusDepth) {
            if (cursor.id === ancestorId) {
                return true;
            }
            cursor = cursor.parentId === null ? undefined : this.index.get(cursor.parentId);
            steps++;
        }
        return false;
    }
}

/**
 * The tree the story-definition-time checks consult.
 *
 * {@link import("@core/elements/scene").Scene} validates a voice clip's bus while the story is
 * being *built*, which in every real game happens at module scope — possibly before any `Game`
 * exists, certainly before any audio context does. There is nothing to hand a tree to at that
 * point, so the last tree any mixer resolved is kept here and the checks read it.
 *
 * Two consequences, both deliberate:
 *
 * - Before a `Game` resolves anything this holds only the seeded three, which is why
 *   `Sound.bgm()` in a voice slot is still caught in every possible ordering.
 * - With more than one `Game` alive the last one to resolve wins. That only ever affects an
 *   advisory check on ids neither game seeded; playback routing never reads this.
 */
let activeTree: AudioBusTree = AudioBusTree.resolve();

/**@internal */
export function publishAudioBusTree(tree: AudioBusTree): void {
    activeTree = tree;
}

/**
 * The bus tree the last {@link AudioBusMixer} to resolve produced.
 */
export function getActiveAudioBusTree(): AudioBusTree {
    return activeTree;
}

/**
 * Whether a clip on bus `busId` is allowed in a slot that accepts `ancestorIds` and their
 * descendants.
 *
 * **An id the registry has never heard of is accepted.** The alternative is worse than the bug it
 * would catch: a story module usually constructs its scenes before the host constructs its `Game`,
 * so at check time a perfectly valid custom bus is routinely not yet declared. Rejecting unknown
 * ids would fail story compile for correct games depending on module evaluation order, which is
 * not something an author can see or control. What the check is actually for — catching
 * `Sound.bgm()` dropped into a voice slot — still works in every ordering, because the three
 * seeded ids are known from the moment this module loads.
 *
 * A misspelled bus is therefore caught later and more cheaply: at play time, where the manager
 * warns once and routes the clip somewhere audible.
 */
export function acceptsAudioBus(busId: string, ancestorIds: readonly string[]): boolean {
    const tree = activeTree;
    if (!tree.has(busId)) {
        return true;
    }
    return ancestorIds.some(ancestorId => tree.isUnder(busId, ancestorId));
}

type AudioBusEvents = {
    "event:audioBus.volumeChange": [string, number, number];
};

/**
 * Somewhere other than the mixer that already stores a bus's player volume.
 *
 * There is exactly one of these in the engine: the three volume preferences. `voiceVolume` is not
 * a number that gets *copied* onto the voice bus, it **is** the voice bus's player volume, reached
 * through this. A bus with an alias has no entry in the mixer's own map at all, so there is one
 * store and one writer and nothing can overwrite anything.
 *
 * Structural on purpose - `audioBus.ts` stays free of imports, and a test can hand it a real
 * `Preference` and exercise exactly what `Game` wires up.
 */
export type AudioBusAlias = {
    get(): number;
    set(volume: number): void;
    /** Fires when the backing store changes by any route, including one that bypasses the mixer. */
    subscribe(listener: (volume: number) => void): { cancel: () => void };
};

/**
 * The preference key that *is* each seeded bus's player volume.
 */
export const SeededBusPreferenceKeys = {
    [DefaultAudioBusIds.bgm]: "bgmVolume",
    [DefaultAudioBusIds.sound]: "soundVolume",
    [DefaultAudioBusIds.voice]: "voiceVolume",
} as const;

/** The slice of `Preference` an alias needs. */
type PreferenceLike = {
    getPreference(key: string): unknown;
    setPreference(key: string, value: never): void;
    onPreferenceChange(key: string, listener: (value: never) => void): { cancel: () => void };
};

/**
 * Bind the three seeded buses to the three volume preferences.
 *
 * This is the whole of the alias, and it is deliberately an identity rather than a copy. Copying
 * is what broke twice: an init-time `preference -> bus` write clobbered the author's declared mix
 * (because the preferences default to 1), and then clobbered a player override the host had just
 * restored (for the same reason). With one store there is no write to mis-order, and therefore no
 * ordering rule a host has to know.
 * @internal
 */
export function createPreferenceBusAliases(
    preference: PreferenceLike,
): Record<string, AudioBusAlias> {
    const aliases: Record<string, AudioBusAlias> = {};
    Object.entries(SeededBusPreferenceKeys).forEach(([busId, key]) => {
        aliases[busId] = {
            get: () => normalizeVolume(preference.getPreference(key) as number),
            set: (volume: number) => preference.setPreference(key, volume as never),
            subscribe: (listener) => preference.onPreferenceChange(key, listener as never),
        };
    });
    return aliases;
}

/**
 * The per-game mixer: the declared tree, plus what the player has done to it.
 *
 * **Every bus carries two numbers, and they never overwrite each other.** The declaration holds
 * the author's mix — where a bus sits relative to the others in the game as shipped. The mixer
 * holds the player's control, which starts at 1 and means "leave the author's mix alone". What
 * reaches the gain node is the product. There is exactly one gain node per bus, because two gain
 * stages in series compute the same product a multiplication does.
 *
 * That split is what makes the layering total: declared value → persisted player override → live
 * changes, each a strictly later writer of a *different* number, so none of them can silently
 * erase the one before. It also means an author can re-mix a shipped game and the new mix reaches
 * players who already have settings saved, which a single conflated number cannot do.
 *
 * It lives on {@link import("@core/game").Game} rather than on the audio manager because a player's
 * bus volumes are a setting, not game state — they exist before the audio context unlocks, they
 * survive an unmount, and a host restores them out of its own storage at whatever point it likes.
 * Setting a volume before the tree has been realized is normal and is not an error: the value is
 * recorded and applied the moment the channels exist.
 */
export class AudioBusMixer {
    static EventTypes = {
        "event:audioBus.volumeChange": "event:audioBus.volumeChange",
    } as const;

    public readonly events: EventDispatcher<AudioBusEvents> = new EventDispatcher();

    /**
     * The player's half, for buses that do not have an alias. Absent means "untouched", which is
     * 1 — not 0, and not the declaration.
     */
    private readonly overrides: Map<string, number> = new Map();
    private readonly aliases: Record<string, AudioBusAlias>;
    private readonly aliasTokens: Array<{ cancel: () => void }> = [];
    private tree: AudioBusTree | null = null;

    /**
     * @param declarations - Read lazily, so a host that calls `configure()` between constructing
     * the `Game` and mounting the player still gets the tree it declared.
     * @param aliases - Buses whose player volume is stored somewhere else, by bus id. See
     * {@link AudioBusAlias}; in the engine this is the three volume preferences and nothing else.
     */
    constructor(
        private readonly declarations: () => readonly AudioBusDeclaration[],
        aliases: Record<string, AudioBusAlias> = {},
    ) {
        this.events.setMaxListeners(64);
        this.aliases = aliases;
        // An aliased bus can be written without going through this mixer at all - a host's settings
        // screen calling `setPreference("voiceVolume", ...)` is the normal case. Subscribing is what
        // lets the audio graph hear about it, and it is why nothing needs to copy the value anywhere.
        Object.entries(aliases).forEach(([id, alias]) => {
            this.aliasTokens.push(alias.subscribe(volume => {
                this.announce(id, normalizeVolume(volume));
            }));
        });
    }

    /**@internal */
    public dispose(): void {
        this.aliasTokens.forEach(token => token.cancel());
        this.aliasTokens.length = 0;
    }

    private announce(id: string, volume: number): void {
        let effective = volume;
        try {
            effective = this.getEffectiveVolume(id);
        } catch {
            // Reading the effective value resolves the declaration, which throws on a malformed
            // tree. That fault belongs to boot and is reported there; it must not come back out of
            // a volume slider. The only subscriber attaches after the tree is realized, so this
            // fallback is never the value anything acts on.
        }
        this.events.emit(AudioBusMixer.EventTypes["event:audioBus.volumeChange"], id, volume, effective);
    }

    /**
     * The resolved tree, resolving it on first use and caching it afterwards.
     *
     * @throws {AudioBusError} if the declaration cannot be resolved.
     */
    public getTree(): AudioBusTree {
        if (!this.tree) {
            this.tree = AudioBusTree.resolve(this.declarations() ?? []);
            publishAudioBusTree(this.tree);
        }
        return this.tree;
    }

    /**
     * Drop the cached tree so the next {@link getTree} re-reads the declaration.
     *
     * Player overrides are kept: a bus that survives the re-read keeps what the player set on it,
     * and picks up whatever the author now declares.
     * This does **not** re-shape channels that have already been realized — see
     * {@link import("@player/lib/AudioManager").AudioManager}.
     * @internal
     */
    public invalidate(): this {
        this.tree = null;
        return this;
    }

    /**
     * Whether the tree has been resolved yet. Reading it is what resolves it, so this exists for
     * callers that must not trigger validation as a side effect.
     */
    public isResolved(): boolean {
        return this.tree !== null;
    }

    /**
     * Set **the player's** volume for a bus, 0..1. This is what a slider writes.
     *
     * 1 means "leave the author's mix alone" and is the value every bus starts at, so a game whose
     * author put SFX at 0.6 plays SFX at 0.6 until a player says otherwise, and a player who drags
     * the slider to maximum gets 0.6 back rather than a bus at full gain. The author's half is
     * {@link getDeclaredVolume} and this cannot overwrite it.
     *
     * Applies to sounds that are **already playing**: a bus is a gain node every clip beneath it
     * is routed through, so the change reaches them without touching a single token.
     */
    public setVolume(id: string, volume: number): this {
        const next = normalizeVolume(volume);
        const alias = this.aliases[id];
        if (alias) {
            // The alias is the store, not a mirror of one. Writing it comes back through the
            // subscription, which is what announces the change - announcing here as well would
            // make this two writers again, which is the bug this shape exists to remove.
            alias.set(next);
            return this;
        }
        this.overrides.set(id, next);
        this.announce(id, next);
        return this;
    }

    /**
     * Set many player volumes at once — what a host calls when restoring its saved mixer state.
     * Ids the tree does not contain are recorded anyway, so restoring before the tree is resolved
     * is safe.
     */
    public setVolumes(volumes: Readonly<Record<string, number>>): this {
        Object.entries(volumes).forEach(([id, volume]) => this.setVolume(id, volume));
        return this;
    }

    /**
     * The player's volume for a bus — what was last set, else 1.
     *
     * Deliberately **not** the declared volume and deliberately **not** what is on the gain node.
     * A bus the player has never touched reads 1 whatever the author declared, which is what makes
     * a slider bound to this sit at maximum on a fresh install and what makes the persisted value
     * mean "what the player did" rather than "what the game shipped with".
     *
     * For the three seeded buses this reads the corresponding volume preference, because that
     * preference *is* this number. `mixer.getVolume("voice")` and `getPreference("voiceVolume")`
     * cannot disagree; there is only one of them.
     */
    public getVolume(id: string): number {
        const alias = this.aliases[id];
        if (alias) {
            return normalizeVolume(alias.get());
        }
        return this.overrides.get(id) ?? 1;
    }

    /**
     * The author's mix position for a bus, from the declaration. Never written at runtime.
     */
    public getDeclaredVolume(id: string): number {
        return this.getTree().get(id)?.volume ?? 1;
    }

    /**
     * What is actually on the bus's gain node: the author's mix times the player's control.
     */
    public getEffectiveVolume(id: string): number {
        return normalizeVolume(this.getDeclaredVolume(id) * this.getVolume(id));
    }

    /**
     * Every bus with both of its numbers, parents first — the whole mixer.
     */
    public list(): AudioBusState[] {
        return this.getTree().getNodes().map(node => ({
            id: node.id,
            parentId: node.parentId,
            volume: this.getVolume(node.id),
            declaredVolume: node.volume,
            effectiveVolume: this.getEffectiveVolume(node.id),
        }));
    }

    /**
     * Just the player's volumes, keyed by bus id — **the half a host persists**, and the shape
     * {@link setVolumes} takes back. The author's mix is game content and comes back with the game.
     */
    public getVolumes(): Record<string, number> {
        const volumes: Record<string, number> = {};
        this.list().forEach(bus => {
            volumes[bus.id] = bus.volume;
        });
        return volumes;
    }

    public onVolumeChange(listener: (id: string, volume: number, effectiveVolume: number) => void) {
        return this.events.on(AudioBusMixer.EventTypes["event:audioBus.volumeChange"], listener);
    }
}
