import type {Scene} from "@core/elements/scene";
import type {Sound} from "@core/elements/sound";
import type {Story} from "@core/elements/story";
import type {Video} from "@core/elements/video";

/**
 * The preload seam: what the player warms, when it warms it, and where the bytes come from.
 *
 * ## Why this is a seam and not a policy
 *
 * The player used to answer three questions on its own. *What will be needed* it guessed, by
 * walking the action tree of the scene about to paint and of every scene reachable from it. *When*
 * followed from that walk: one pass per scene, split into a first frame, the scene's whole
 * registered set, and a look-ahead. *How* was fixed: fetch the bytes, mint an object url, decode
 * the image off-screen, hold the bitmap under a budget.
 *
 * All three answers are wrong for a host that knows more than the walk can see. A tool that
 * compiled the story knows exactly which row shows which asset, in which order, and how big each
 * one is; the walk only knows what a scene mentions anywhere in it, which on a real project is
 * most of the library - so the pass fetched and decoded a chapter's artwork in order to paint one
 * background. A host serving assets off local disk has no use for the object url either: the file
 * is already there, and copying it into a blob costs that memory a second time.
 *
 * So the player now asks instead of deciding. A {@link PreloadStrategy} answers *what* and *when*
 * as a {@link PreloadPlan}, and may answer *how* as well through
 * {@link PreloadStrategy.acquire}. Everything the player still owns - the cache, its budgets, what
 * a mounted element pins, and the url an element is finally pointed at - is unchanged, which is
 * what lets a strategy replace the plan without replacing the player.
 *
 * A game that supplies no strategy gets the built-in one, which reproduces the walk and the tiers
 * exactly as they were, driven by the same `preload*` fields of `GameConfig`.
 */

/**
 * What kind of thing a preload resource names.
 *
 * Only images are named this way in a plan's {@link PreloadPlan.entries}: they are the resources
 * the player fetches, caches and decodes, so a url is the whole of what it needs to know. Audio and
 * video are named by element instead ({@link PreloadPlan.audio}, {@link PreloadPlan.video}),
 * because what warming them means is a property of the element and not of the url. `video` survives
 * here for {@link PreloadStrategy.onMissing} and {@link PreloadStrategy.acquire}, which speak about
 * a resource rather than about a plan.
 */
export type PreloadResourceType = "image" | "video";

/** One thing a plan can ask for, named by the url the stage will show. */
export type PreloadResource = {
    type: PreloadResourceType;
    /**
     * The url the stage points an element at, which is also the key the cache stores it under.
     *
     * A strategy that rewrites urls - a host serving through its own protocol, say - must name the
     * resource by the url the *stage* will use and do the rewriting inside
     * {@link PreloadStrategy.acquire}. The two are the same string for every ordinary game.
     */
    src: string;
};

/**
 * How urgently a resource is wanted. One axis, three points, and only the first of them blocks.
 *
 * - `gate` - the frame is not allowed to paint until this has landed. That is the loading screen's
 *   whole meaning, so a plan that puts a chapter in this band is a plan that opens late.
 * - `soon` - start now, at full speed, but nothing waits on it: what the player is a click away
 *   from needing.
 * - `idle` - speculative. Paced by `GameConfig.preloadDelay`, run after the other two, and
 *   abandoned without ceremony when the moment is superseded.
 */
export type PreloadBand = "gate" | "soon" | "idle";

export type PreloadEntry = {
    /**
     * Always an image.
     *
     * Video used to be nameable here, and warming it meant reading the bytes once and dropping
     * them, in the hope that whatever served them kept a copy. That hope is unfounded on the hosts
     * that matter - a game serving assets through its own protocol has no cache to warm - so it
     * reported warming that had not happened. {@link PreloadPlan.video} is the answer that works.
     */
    type: "image";
    src: string;
    band: PreloadBand;
    /**
     * Whether to decode the image off-screen before anything shows it, and hold the bitmap.
     *
     * A decode is what lets an image paint on the frame it is revealed on rather than a frame or
     * two later, and it is the expensive half of warming one: measured over a real library,
     * fetching every image took 473 ms and fetching *and* decoding them took 2,140 ms, with each
     * retained bitmap costing width x height x 4 bytes for as long as it is held. So it is worth
     * paying for what is about to be revealed and wasteful for what merely might be.
     *
     * Defaults to true on the `gate` and `soon` bands and false on `idle`.
     */
    decode?: boolean;
};

/**
 * What should be warm at one moment in the story, and what may be forgotten.
 *
 * A plan is complete: it replaces the previous one rather than adding to it. That is what makes
 * {@link PreloadPlan.keep} meaningful - a scene the story has left keeps nothing, and its artwork
 * is released as soon as no element is still showing it.
 */
export type PreloadPlan = {
    /** Every image and video this moment wants, in the order each band should warm them. */
    readonly entries: readonly PreloadEntry[];
    /**
     * Sounds the audio cache should hold for this moment, and only these.
     *
     * Separate from {@link PreloadPlan.entries}, and named by element rather than by url, because
     * audio is warmed by a different cache with a different budget, and whether a clip is decoded
     * into memory or streamed as it plays is a property of the sound rather than of its url. It is
     * also never gated on: the audio context stays locked until the page has been interacted with,
     * so a loading screen that waited for a clip could wait for ever.
     */
    readonly audio?: readonly Sound[];
    /**
     * Clips this moment wants buffering, nearest first, and only these.
     *
     * Named by element for the same reason audio is, only more so: warming a video means putting
     * its element in the document and letting the browser buffer into it, and the element that
     * buffered has to be the one that plays or nothing was gained. There is no video cache in the
     * player, and there is no url-shaped way to fill one.
     *
     * The order is a statement of what is coming first. The player admits the clips one at a time
     * and starts the next when the current one reports it can play, so how many are really being
     * fetched at once follows the connection rather than the length of this list - which is why
     * there is no setting for it and no number for a host to choose. A clip the story has already
     * declared is left alone: it is on the stage on the author's own instruction.
     *
     * Never gated on. A clip can take arbitrarily long to buffer, and a loading screen that waited
     * for one would be a download bar wearing a story's clothes. Omit the field to leave the warm
     * set as it is; an empty array releases it.
     */
    readonly video?: readonly Video[];
    /**
     * Every url the image cache may keep, which is normally the plan's own entries.
     *
     * Anything outside this set is released at once if nothing is showing it, and the moment its
     * last element unmounts otherwise. Omit it to leave what the cache holds alone - which is what
     * a plan that only adds to a scene's warm set wants.
     */
    readonly keep?: readonly string[];
    /**
     * Urls no budget may release, whatever else happens - normally the opening frame.
     *
     * Whatever a mounted element is showing is protected separately and does not need naming here.
     */
    readonly pin?: readonly string[];
};

/** Why the player is asking. A strategy may answer only the moments it cares about. */
export type PreloadMoment = {
    /** A scene is about to paint, or has just been entered. */
    kind: "scene";
    scene: Scene;
    story: Story | null;
} | {
    /**
     * The story advanced. Sent for every action, so a strategy that plans row by row answers here
     * and one that plans per scene returns null.
     */
    kind: "advance";
    actionId: string | null;
    scene: Scene | null;
    story: Story | null;
};

/**
 * Where the bytes for one resource came from, and what keeping them costs.
 *
 * Returned by {@link PreloadStrategy.acquire}. A host that serves assets from local disk should
 * hand back the url it was given with `bytes: 0` and no `release`: the browser then fetches and
 * caches the file once, the way it would for any other url on the page, and the player holds no
 * second copy of it in the renderer's heap.
 */
export type PreloadAcquisition = {
    /** The url an element should be pointed at. May be the resource's own url. */
    url: string;
    /**
     * What holding this costs the player's fetched-bytes budget. Zero when the host owns the
     * memory, which is the honest answer for a url the player copied nothing for.
     */
    bytes?: number;
    /** Called once when the player lets the entry go, for a url the host has to clean up. */
    release?: () => void;
};

/**
 * The host's answer to what the player should warm, and optionally to how.
 *
 * Supplied as `GameConfig.preload`. Every method is asked on the player's own schedule; none may
 * assume it is called in order, and all may be called again for the same moment after a reload.
 */
export interface PreloadStrategy {
    /**
     * What should be warm at this moment, or null to leave the previous plan in force.
     *
     * May be asynchronous: a host that has to ask another process what a scene uses answers when it
     * knows. The player will not paint a gated frame until the plan has arrived and its `gate` band
     * has landed, so a strategy that takes its time is a strategy that opens late - the same trade
     * the built-in one makes, only visible.
     */
    plan(moment: PreloadMoment): PreloadPlan | null | Promise<PreloadPlan | null>;
    /**
     * Obtain the url for one resource, replacing the player's own fetch.
     *
     * Omit it and the player fetches the resource itself and mints an object url, which is what it
     * has always done. Return null to say "nothing to warm, show it directly": the player then
     * points the element at the resource's own url and caches nothing for it.
     */
    acquire?(resource: PreloadResource, signal: AbortSignal): Promise<PreloadAcquisition | null>;
    /**
     * Told when the stage shows something no plan named.
     *
     * This is the case the player used to report by asking the author, in a console warning, to
     * register the image by hand. A host that plans from a compiled story can say something far
     * more useful - which row shows it - so the player hands the fact over rather than guessing at
     * the remedy. Called at most once per url.
     */
    onMissing?(resource: PreloadResource): void;
}
