# Changelog

## [Unreleased]

### Fixed

- Transitions to a differently-sized image no longer leave the element mispositioned. When a transition settled, the incoming image was promoted to the element that sizes the displayable's container — but the size guard added in 0.13.2 keyed only on the computed size, which had not changed from the incoming image's own point of view, so the promotion notification was swallowed and the container silently kept the *previous* image's dimensions. The element's centering and layout are derived from that container, so the new image jumped at the settle instant and stayed offset until something else resized it. Applying a size and reporting it to the parent are now tracked separately: a size the same callback has already been told about is still skipped (that redundancy was the 0.13.2 render-loop fix), but a *new* sizing callback is always notified.

- Changing a layered image's appearance without a transition paints again. The layered form of `char(tags)` relies on a re-render to hand the element its new layer sources (they are React props, unlike a plain image's imperative `src`), and the memoization added in 0.13.2 stopped the stage-wide update from reaching it — the swap was stored and saved but the old appearance stayed on screen. The action (and the undo/restore repaint pass) now asks the element itself to flush. Swaps with a transition were never affected.

- A transition now genuinely waits for its incoming image to load *and decode* before the animation starts. The pre-transition wait captured its element references synchronously, before React had mounted the transition's elements, so it waited on nothing and the animation raced the image load — a large or not-yet-preloaded image could dissolve in as a blank, pop in mid-animation, or flash at the wrong moment. The wait is now taken in the commit that mounts the transition's elements, which also lets the transition paint its exact start pose (including handing the incoming element its source) before a single animation frame runs. Skipping a transition while it is still waiting settles it as soon as the image is ready instead of being ignored; a source that fails to load no longer wedges the transition.

- A freshly mounted transition image no longer paints one stretched frame at the full stage size before its real size is known. Its width/height now start at zero — painting nothing — until the loaded bitmap's dimensions are applied.

## [0.13.2]

### Fixed

- Advancing the dialogue no longer slows down — or, with several images on screen, risks freezing — as more elements are added to a scene. Every on-stage image re-derived its own size on each render, and doing so could schedule another render, so a single "next" fanned out into repeated re-renders across every image; a busy enough scene reached React's update-depth limit and threw. An image now skips re-applying a size it has already applied, which breaks that loop. How images look and animate is unchanged.

- Advancing now responds on key press rather than release, and holding the advance key no longer runs through several lines at once: the operating system's key auto-repeat is ignored, so one physical press advances once. Applies to both the standard dialog and NVL mode.

### Changed

- `skipDelay` now defaults to `0` (was `500`). Pressing the skip key takes effect immediately by default; set `skipDelay` in preferences to reintroduce a delay between skipped actions.

### Performance

- The image element is memoized, so a stage update — advancing a line, for instance — no longer re-renders every on-stage image. Only an image whose own transform or transition is running repaints. In scenes with several characters this measurably cuts the work done per advance.

## [0.13.1]

### Fixed

- Changing an image's source without a transition now actually shows the new image. `scene.setBackground(src)` and `image.char(src)` updated the image's state and re-rendered, but a plain image's `src` is written to the DOM imperatively rather than passed down as a React prop, and the only things that write it are a running transition and the state sync that the re-render never triggered. The new source was therefore stored, saved, and reported correctly while the old image stayed on screen — the swap only became visible once some later action with a transition happened to repaint the element. Passing a transition was never affected, which is what made the instant form look like it worked everywhere except where it mattered.

- `text.setFontSize(size)` now applies the size instead of storing it. The same imperative write is behind this one: a text's font size reaches its element only when the displayable's props are synced, which re-rendering does not do. Passing a duration animates the size through a transition and was never affected, so — as with images — it was exactly the instant form, the one that reads like it could not fail, that silently did nothing.

- Texts now rescale when the stage does. A text is sized by the stage's scale factor, which is applied to its element as part of the same imperatively-written props, and nothing re-applied them on a resize. A text therefore kept the scale it was mounted at: it stayed the size it was while the stage around it grew or shrank, and only snapped to the correct size if a transition happened to repaint it. Images were never affected, since their dimensions are driven by React state that already follows the stage. The settled props of every displayable are now re-derived on each settled render and on every stage resize — alongside the pose self-healing that already ran there — so anything they are derived from converges instead of sticking at its mounted value.

- Tag-based images now render. An image whose `src` is a `{groups, defaults, resolve}` definition drew nothing at all: the renderer read the image's current source straight out of its state, but for a tag image that state holds the *tags*, not a url, and a tag list is not a source — so it fell back to the empty placeholder. The image was invisible from the moment it was shown, and stayed invisible except during a transition, which carries sources it has already resolved and so painted the right thing until it ended, then reverted to the placeholder. Tags are now resolved through the image's own definition wherever the settled source is read. Layered images and static url/colour images were never affected.

  `image.char(tags)` with no transition was also affected by the imperative-write bug above, and is fixed the same way. Note that preload only predicts an appearance change that names *every* group: after a partial change such as `char(["happy"])` — legal, and the recommended way to change one group — the resolved source is fetched when it is first shown rather than ahead of time, and warns that it was not preloaded. That gap predates this fix and was merely invisible while the image itself was; `scene.preloadImage(src)` registers such sources manually.

## [0.13.0]

### _Feature_

- Added layered images. `Image`'s `src` accepts a `{layers, defaults}` definition that composes a character from one image per part instead of one pre-composited image per combination, which turns an N×M asset explosion into N+M files:

  ```ts
  const yuko = new Image({
      src: {
          // bottom to top
          layers: [
              "yuko/body.png",                                          // constant layer
              {uniform: "yuko/uniform.png", casual: "yuko/casual.png"}, // mutually exclusive variants
              {happy: "yuko/happy.png", sad: "yuko/sad.png"},
              {noHat: null, straw: "yuko/straw_hat.png"},               // null draws nothing
              (tags) => tags.has("sad") ? "yuko/tears.png" : null,      // derived from other layers
          ],
          defaults: ["uniform", "happy", "noHat"],
      },
  });

  yuko.char(["sad"]);              // only the face layer changes; the outfit is kept
  yuko.char(["casual", "happy"]);  // several layers at once, in any order
  ```

  There is no new method: layered images are driven by the existing `char()`, and tags behave as they already do — a tag replaces the other variants of its own layer and leaves every other layer untouched. Array order is the stacking order. Tags are inferred from the definition, so `char()` rejects a misspelled tag at compile time without an explicit type argument. Saves store tags rather than resolved urls, so a layered image's save format matches a tag-based one.

  Every existing image transition works on a layered image and crossfades the stacks as a whole, the same way `Dissolve` crossfades two plain images:

  ```ts
  yuko.char(["sad"], new Dissolve(300));
  ```

  Effects that apply to an image as a whole — a transition's opacity or mask, `darken`, and transforms such as `opacity()` or `pos()` — are applied to the stack as one unit rather than to each layer, so layers never composite against the background individually and never show through the ones above them.

  Layers of one image are expected to share a canvas and are aligned by centering, matching how art tools export layers; per-layer offsets and per-layer transitions are not supported.

  Every reachable layer src is registered for preload up-front. Because layers are independent this is the sum of the variants rather than their cross product, so a layered image needs no appearance prediction and never warns about an unpredicted source. Sources returned by a resolver layer are opaque and must be registered with `scene.preloadImage` if they are not used by another layer.

### Fixed

- `FadeIn` no longer displaces the image it fades in. The transition positioned its target by writing `transform: translate(-50%, 50%)` — the wrong sign on the y axis, so the incoming image was drawn a full height too low for the length of the fade. On a layered image it also outlived the fade: `transform` overwrites the driven element's base positioning rather than composing with it, and a stack wrapper is positioned purely by `inset: 0`, so nothing in the settled style overwrote the leftover value and the stack stayed parked half its width to the left and half its height down. The offset now rides on the independent CSS `translate` property, which composes additively with the base positioning and is the identity at rest — matching how `Push` already does it.

- A cancelled transition no longer leaves a layered image stuck part-way through it. A stack's settled style is re-applied on its own once a transition ends, so any property it does not name keeps whatever the last animation frame wrote. Completing a transition hid this, because its final frame is the resting value anyway — but `cancel()` stops mid-flight without a final frame, and undoing an action while its transition is still running does exactly that. A layered image could therefore stay permanently half-faded (`Dissolve`, `BlurDissolve`, `ThroughColor`), half-swept behind a mask (`SoftWipe`, `Blinds`, `SoftIris`), or partly clipped (`MaskTransition`). The settled style now names every property a transition can write to a stack — `opacity`, `clipPath`, `maskImage`, `transform`, and `translate` alongside the existing `filter` — so a stack always converges back to a known pose.

- Loading a saved game no longer corrupts every stored value. Values are tagged with their type on the way into a save so that `Date` survives JSON, but the read paths assigned the raw tagged form straight back into the namespace instead of untagging it. Every value therefore came back as its `{type, data}` wrapper rather than the value itself: a saved number never compared equal to a number, a `Date` came back as an object holding a string, and — worst of the three — a saved `false` came back as an object, which is truthy, so a load could silently flip a false story flag to true and take the opposite branch. This affected `Persistent` namespaces, `scene.local`, and the scene snapshots behind undo, all of which shared the same faulty path.

  Saves written by earlier versions read correctly again, with one exception: a save produced by *saving after loading* on an affected version had its values tagged twice on disk, and that second tag cannot be told apart from a value the game legitimately stored. Such saves are not repaired.

- Authored defaults now survive loading a save. Restoring a save rebuilt each namespace out of the save data alone, which discarded the defaults passed to `Persistent`. As a result `reset()` restored the save's contents instead of the author's defaults, and any key added to a `Persistent` after a save was written read back as `undefined` rather than its default. Saves are now layered over freshly initialized namespaces, so a key the save predates keeps its default and `reset()` means what it says.

- `SavedGame`'s `store` field is now typed as what it actually holds. It was declared as unwrapped `StorableData` while carrying the tagged form, and that mismatch is what let the missing untag step type-check. The tagged shape is now public as `WrappedStorableData` / `SerializedNamespaceData`, since it is part of the save format rather than an implementation detail.

- `image.darken(darkness, duration)` now animates over the duration instead of jumping. The animation was gated on an easing being passed as well, so the natural call — a duration and nothing else — silently discarded the duration and applied the new darkness instantly, with no warning. Easing was never required: the underlying transition and animator both accept an undefined easing and fall back to their own default, which is what every other timed method (`setFontSize`, `transform`, `pos`, …) already relied on. Passing an easing continues to work unchanged; only the duration-without-easing case is affected, and it now behaves the way the signature reads.

- Undoing while an animation is still playing no longer strands the action that was playing. Actions run through `Control.all` / `any` / `doAsync` / `allAsync` execute on their own stack, and that stack waited on the running action in a way that only a *completed* action could satisfy — aborting one (which is what undo does to an animation in flight) left the stack parked on it forever. The stack was then never released, was written into subsequent saves, and was executed again when such a save was loaded, replaying an animation the player had already rewound past. These stacks now stop when the action they are waiting on is aborted, and the actions queued behind it — which the rewind has made unreachable — no longer run.

## [0.12.3]

### _Feature_

- Added `DevTools.getCurrentDialog(gameState)` and `DevTools.onDialogStateChange(gameState, listener)` for editor / Studio hosts. `getCurrentDialog` reports the dialog line currently presented to the player — its originating say-action id and whether the line has finished displaying — across both ADV and NVL modes (`null` when no dialog is on screen). `onDialogStateChange` subscribes to changes of that line (creation, typing completion, advance) and returns a cancellable token. Together they let a host implement "text read" / already-seen tracking without reaching into player-layer internals.
- Added ADV dialog line tracking in `GameState` (`beginAdvDialog` / `completeAdvDialogTyping` / `settleAdvDialog`) and a new `event:state.dialog.change` event, mirroring the existing NVL state so the currently displayed ADV line is queryable from the core layer. The tracking is transient (not serialized) and rebuilds naturally after load/undo when the pending say action re-executes.

## [0.12.2]

### Fixed

- Images and texts no longer jump mid-animation or settle at the wrong position when the page re-renders (e.g. on a window resize or when a transition starts or ends) while a transform animation is playing. Layout projection no longer competes with the animation for the element's transform, which previously could also leave the element permanently misplaced after an interrupted animation.
- Revealing a large image through a transition no longer flashes a blank first frame. Preloaded images are now decoded ahead of time instead of merely fetched, and transitions wait for the incoming image to be fully decoded — not just loaded — before starting. If decoding is unavailable or fails, the previous load-only behavior is used, so playback never stalls. Source changes applied without a transition are outside the scope of this gating.

## [0.12.1]

### Update

- Added some NarraLeaf Studio Support

## [0.12.0]

### Update

- Added six built-in image transitions, exported from the main entry alongside `Dissolve`/`FadeIn`/`MaskTransition`:
  - `SoftWipe` — feathered directional wipe (the soft-edged counterpart of `MaskTransition.wipe`).
  - `SoftIris` — feathered circular reveal (the soft-edged counterpart of `MaskTransition.circle`).
  - `Blinds` — venetian slats reveal, with `orientation` and `slats`.
  - `BlurDissolve` — a blurred crossfade for flashback / dream states.
  - `Push` — directional push/slide (both images translate).
  - `ThroughColor` — a colour-hold engine created via `ThroughColor.fade` / `.wipe` / `.blinds` / `.iris`: covers the frame with a solid colour, holds, then uncovers on the target, so the target only appears after the colour frame (fade-to-black/white, soft wipe through black, blinds black hold, iris to black, flash via `hold: 0`).
- Exported the accompanying option types (`SoftWipeOptions`, `BlindsOptions`, `SoftIrisOptions`, `BlurDissolveOptions`, `PushOptions`, `ThroughColorFadeOptions`, `ThroughColorWipeOptions`, `ThroughColorBlindsOptions`, `ThroughColorIrisOptions`) and `BlindsOrientation`.

## [0.11.0]

### _Incompatible Changes_

- Displayable position offsets (`xoffset`/`yoffset`) and pixel coordinates are now resolved relative to the game's design resolution (`GameConfig.width`/`height`) instead of the rendered, window-fitted size. Positions are therefore resolution-independent and consistent across window sizes. Games that relied on offsets being raw on-screen pixels may need to adjust their values.

### Fixed

- An align position that also carries offsets (e.g. `{xalign, yalign, xoffset, yoffset}`) is no longer misdetected as a coordinate position, which previously dropped the alignment back to the stage default and only applied the offsets.
- Animated positions now interpolate their alignment. Offsets are folded into a single percentage, so `motion` can animate the whole position; previously the percentage (alignment) component of a mixed `calc(% + px)` value was left at its base and only the pixel offset animated.

## [0.10.1]

### Fixed

- Exported `useUIMenuContext` and type `ChoiceEvaluated`

## [0.10.0]

### _Incompatible Changes_

- Removed dialog text appearance defaults from `GameConfig`. `defaultTextColor`, `fontSize`, `fontWeight`, `fontWeightBold`, and `fontFamily` are no longer configured globally for dialog text; pass them to `Texts`, `RawTexts`, `TextsPreview`, or `Item` instead.
- Removed `GameConfig.defaultNametagColor`; pass `color`, `name`, `children`, `style`, or `className` to `Nametag` to control the name tag.
- Removed `GameConfig.defaultMenuChoiceColor`; custom menu components should control menu choice text through `Item` props or inherited CSS.

### Update

- Added exported `NametagProps`, `TextAppearanceProps`, `TextsProps`, `RawTextsProps`, `EntryTextsProps`, and `ItemProps` types for custom dialog and menu components.
- `Nametag` now renders component-provided content when `children` or `name` is provided, while still falling back to the current dialog character name.
- `Texts`, `RawTexts`, `TextsPreview`, and `Item` now allow component-level defaults for text color, font size, family, and weights while preserving `Sentence` and `Word` inline style overrides.

## [0.9.1]

### _Feature_

- Added `Sentence.getMetadata` to get the metadata of a sentence
- Added dialog avatar APIs for character avatars, portrait-based avatar resolution, and the default dialog avatar display
- Added animation support for dialog box
- Added static action IDs through `DevTools.setStaticId` for editor and studio integration
- Added visual effect APIs for displayables, including masks, clip paths, filters, backdrop filters, and blend modes

### Update

- Improved action type imports to reduce runtime module cycles

### Fixed

- Preserve NVL transition options when exiting NVL mode so configured hide transitions can complete correctly

## [0.9.0]

### _Feature_

- Added `Control.whileLoop(condition, actions)` for condition-based loops
- Added `Control.breakLoop()` to exit loops prematurely
- Repeat loops now save their execution state in save files
- Added `Sound.mute` and `Sound.unmute` to mute and unmute a sound
- Added `GamePreference.voiceEndMode` to control how to end voice playback at the end of a sentence
- Added `Namespace.has`, `Namespace.keys`, `Namespace.values`, `Namespace.entries`
- Added `Storable.createNamespace`
- Added `beforeRestore` and `afterRestore` hooks for plugin system
- Added `LiveGame.playSound` to play a sound immediately and return the SoundToken
- Added `useVoiceState` hook to access the voice state
- Added `FixedAspectRatioContainer` Helper Component to create a container with a fixed aspect ratio
- Added NVL Dialog Mode API
- Added `Control.waitForClick`

### _Incompatible Changes_

- `JumpConfig.unloadScene` is removed

### Update

- Enhanced StackModel to support loop state serialization, replacing the previous repeat implementation
- Added `DevTools` interface to access the internal state of the game
- Fixed some type exports
- `Control.repeat` now uses StackModel-based implementation with full serialization support
- Loop conditions (Lambda) are now automatically restored during deserialization

### Fixed

- Voice is not configured correctly when using `character.say`

## [0.8.7] - 2026/1/4

### Fixed

- Refactored Sound System: fixed offset handling and playback management.

## [0.8.6] - 2025/9/10

### Fixed

- Incorrect behavior of `Menu.enableWhen` and `Menu.showWhen`

## [0.8.5] - 2025/9/10

### Fixed

- Incorrect signature of `Menu.enableWhen` and `Menu.showWhen`

## [0.8.4] - 2025/9/10

### _Feature_

- `Persistent.equals`, `Persistent.notEquals` now support lambda or lambda handler as argument
- Added `ScriptCtx.$` to get the namespace
- Added `Script.execute` to execute a script

### Fixed

- Script element is not executed correctly

## [0.8.3] - 2025/9/9

### _Feature_

- `Persistent.equals`, `Persistent.notEquals`, `Persistent.assign` now support function evaluator as argument
- Added `hidden` and `disabled` config to `Menu` choice
- Added `Menu.hideIf` and `Menu.disableIf` magic methods
- Added `Menu.enableWhen` and `Menu.showWhen`

## [0.8.2] - 2025/9/9

### Fixed

- Incorrect behavior of `Scene.setBackground`
- Removed deprecated method `Story.registerScene`
- Condition actions are not executed correctly
- Null action execution can cause infinite loop

## [0.8.1] - 2025/9/6

### Fixed

- Default value of `Transform.propToCSSTransform#optional` is not respected
- Fixed an issue where the top-of-stack action might be executed repeatedly during undo operations.

## [0.8.0] - 2025/9/6

### _Feature_

- Added `Displayable.scaleXY`, `Displayable.scaleX`, `Displayable.scaleY`, `Displayable.zoom`
- Built-in Gallery Service

### _Incompatible Changes_

- `Displayable.scale` is changed. The scale now is separated into `scaleX` and `scaleY`. To zoom the image, use `Displayable.zoom` instead

### Fixed

- Background image using hex color is not showing

## [0.7.0] - 2025/7/6

### _Feature_

- `LayoutRouter` creates a new way to manage complex page structures and transitions
- Use `Layout` to create a layout group
- Use Player prop `onError` to handle errors
- `game.keyMap` allows you to manage key bindings and announce key changes across the player

### _Incompatible Changes_

- `Router` is deprecated, use `LayoutRouter` as a more powerful router
- `Page` is refactored
- `game.config.skipKey` and `game.config.nextKey` are deprecated, use `game.keyMap` instead

## [0.6.0] - 2025/6/9

### _Feature_

- Added `skipDelay` to the game preference
- Added `liveGame.skipDialog` to skip the current dialog
- Use a notification with a null duration to create a notification that will not be automatically removed
- Added `lastSentence` and `lastSpeaker` to the saved game metadata
- Added `liveGame.waitForPageMount` to wait for the page to mount
- Added `story.hash` to get the hash of the story
- Added `skipInterval` to the game preference

### _Incompatible Changes_

- The game has completely transitioned from a single node currentAction to a **StackModel**. The model ensures that: 
  - Awaitable is handled in an explicit way 
  - Support for sub-stack model recursive calls 
  - Full support for serialization/deserialization 
  - Support for scenario operations to break the call stack 
  - Better branching/merging operations 
  - Less prone to state clutter when deserializing and undoing
  - Is a complete solution for nested operations
- `game.config.skipInterval` is deprecated, use `GamePreference.skipInterval` instead

### Fixed

- Notification is not scaled correctly

## [0.5.0] - 2025/5/21

### _Incompatible Changes_

- `game.config.cps` is deprecated, use `GamePreference.cps` instead
- Menu GameElementHistory.`selected` may be null

### _Feature_

- New image transition: `Darkness`
- Added method image.`darken`
- Added method layer.`setZIndex`
- Added `voiceVolume`, `bgmVolume`, `soundVolume`, and `globalVolume` to the game preferences
- Using raw text for narrator instead of using Character instance
- Added `waitForRouterExit` to wait for the page exit animation to complete

### Update

- The skip action will now listen to the window events instead of the player element by default
- Added `isNarrator` to the dialog state

### Fixed

- Background music is not playing
- Visual errors after applying transitions and before the elements are painted
- Transform state is not updated correctly when the transform is skipped
- Abort Events are not propagated correctly
- Incorrect behavior of `router.back`
- The game state is not flushed correctly
- Different behavior between autoForward and user clicking
- Incorrect transform repeat behavior
- Unexpected NaN when converting align to percentage

## [0.4.4] - 2025/5/9

### Fixed

- Unhandled side effects causing performance issues
- False positive of dead cycle

## [0.4.3] - 2025/5/8

### Fixed

- The dialog state is not flushed when the dialog is completed
- The dialog cannot be clicked because of the stage elements
- The behavior of `cps` is incorrect
- The page exit animation is not working

## [0.4.2] - 2025/5/7

### Fixed

- Game stops after transition

### Update

- Refactored the dialog state management
- Moved to ESBuild and reduced the bundle size/build time (2x faster and the bundle size dropped from 835kb to 520kb)
- Added `game.config.defaultMenuChoiceColor` to set the default color for the menu choices
- Hide the menu dialog when the menu has no prompt

## [0.4.1] - 2025/5/1

### _Feature_

- Added key bindings for Menu Item
- Added `useDialog` hook to access the dialog state

### Fixed

- Word properties are not assigned correctly when using `Word` static method
- Some unexpected behaviors when using `autoForward` and `pause` together

### Updated

- Refactored the way to calculate the text styles
- Added `game.config.stage` to modify the default stage

## [0.4.0] - 2025/4/22

### _Incompatible Changes_

- `game.config.elements.say.textInterval` is deprecated, use `game.config.elements.say.cps` instead
- `game.config` has been refactored, see [GameConfig](src/game/nlcore/gameTypes.ts#GameConfig) for more details
  - `game.config.player` is deprecated, use `game.config` instead
  - `game.config.elements` is deprecated, use `game.config` instead
  - `game.config.elementStyles` is deprecated, use `game.config` instead

### _Feature_

- Shorten the way to use `character.say`
- `Video` player
- Customizable components
- Game notification
- Commit-style transform construction
- Game history
- Plugin System

### Updated

- `Player` now doesn't require a `router` prop, the router will be shard across the game
- Added some interfaces for NarraLeaf
- Use Timeline Model instead of Promise All
  - **Interruptible Task Graph Model**: Structured, Cancel-aware, Stateful Async Task Graph
- Added `cps` to `Word` config
- Better text skipping
- Added static method `Menu.prompt` as an alias of `new Menu`
- Use `game.config.defaultTextColor` to set the default text color
- Added `createPersistent` as a shortcut for initializing a persistent
- Added game hooks to `Game`
- Added `Character.config.color` to set the color of the character's name tag
- Added `useLiveGame` hook

### Fixed

- `event:menu.choose` is never triggered
- Element states are incorrect when deserializing
- Transition incorrect when passing a `Transition` instance directly into `scene.jumpTo`
- Showing a displayable with incorrect default duration

## [0.3.0] - 2025/2/16

### _Incompatible Changes_

- NarraLeaf-React now **requires** [React 19](https://react.dev/blog/2024/12/05/react-19) or later
- Image Config has changed:
    - the type of `config.src` should be a tag definition or a string
    - In tag-based image config, `config.src` as a resolver function is moved to `config.src.resolve`
    - Image can't be marked as wearable anymore, use `image.wear` or `image.asWearableOf` instead
- These methods of `Image` has been changed:
    - `setAppearance`, `setTags`, `setSrc` -> `char`
    - `applyTransform` -> `transform`
    - `wear` is a new alias for `addWearable`
    - `asWearableOf` is a new alias for `bindWearable`
    - `init`, `setPosition`, `dispose`, `copy` are removed
    - `IImageTransition` is removed, use `ImageTransition` instead
- These methods of `Text` has been changed:
    - `applyTransform` -> `transform`
    - `applyTransition` is removed, applying transitions are still in planning
    - `ITextTransition` is removed, use `TextTransition` instead
- These methods of `Transform` has been changed:
    - `overwrite` is removed
    - Transformer API is completely deprecated
- These methods/properties of `Scene` has been changed:
    - `activate`, `deactivate` are removed, the game will manage the scene's lifecycle automatically
    - `applyTransform` is removed, use `scene.background.transform` instead
    - `inherit` is removed
    - `requestImagePreload` -> `preloadImage`
- These methods of `Sound` has been changed:
    - use `copy` to create a new sound instance
    - `play`, `stop` and `setVolume` method can receive a `duration` parameter
    - `fade` is removed, use `setVolume` instead
- In displayable elements, the transform states are separated from the element states
- These changes are made to `Sound` config
    - `sync` and `type` are removed
    - use `preload` to use [Howler.js](https://howlerjs.com/)'s preload feature
    - use `seek` property to set the initial seek position
- Scene's config now can't specify the `invertY` and `invertX` properties, use story config `origin` instead
- `Top`, `Center`, `Bottom`, `HBox`, and `VBox` are deprecated, use `PageRouter` API instead
- `ITransition`s are all deprecated, use `Transition` API instead
    - `FontSizeTransition` -> `FontSize`
    - `BaseImageTransition` -> `ImageTransition`
    - `BaseTextTransition` -> `TextTransition`

### _Feature_

- `Service` API: a new way to create custom actions
- Use `liveGame.requestFullScreen` and `liveGame.exitFullScreen` to request full screen on the player element
- Use `liveGame.onPlayerEvent` to listen to the dom events of the player element
- `PageRouter` API: a new way to manage page layers
- `Layer` API: manage layers for displayable elements
- Use `liveGame.capturePng`, `liveGame.captureJpeg`, `liveGame.captureSvg`, and `liveGame.capturePngBlob` to capture the game screen  
The screenshot behavior is provided by [html-to-image](https://github.com/bubkoo/html-to-image)

### Added

- use `Transform.immediate` to apply transformations immediately
- `Text`, `Word`, `Character`, `Scene` background, and `Image`'s color now supports named colors,
  see [MDN: <named-color>](https://developer.mozilla.org/en-US/docs/Web/CSS/named-color) for a list of supported colors.
- use `game.configure` to configure the game instead of constructing a new game instance
- use `ImageConfig.autoFit` to automatically fit the image to the player width
- These methods are added to displayable elements (text, image):
  - `pos`, `scale`, `rotate`, `opacity`
  - `useLayer`
- These methods are added to `Text`:
  - `setFontColor`

### Fixed

- some errors being thrown when initializing the game
- Components reach the React flush limit when applying transitions
- The game stops working when entering scenes that reference each other
- Short black screen between scene transitions
- Color-based background image behaves incorrectly
- Incorrect element states when jumping to the current scene

### Updated

- A better way to serialize/deserialize the element states
- Refactored displayable components
- Refactored the way to play sounds
- Transform now doesn't store its controllers and states, transform states are now stored in the element states
- The game no longer stores the events in the game element, this undermines the abstraction of the game element.  
Use `useExposeState` to expose the component state to the game element. 

## [0.2.3] - 2024/12/27

### _Feature_

- Use `usePreference` to manage preference easier

### Added

- `image.setTags`
- `image.setPosition`
- Utility component: `Full`
- `usePreference` hook

### Updated

- `Player` component now doesn't require a `story` prop

## [0.2.2] - 2024/12/02

### _Feature_

- Game Events
- Use `scene.local` to store temporary data
- Custom cursor

### _Incompatible Changes_

- SceneConfig `invertY` is now `true` by default

### Added

- Event: `event:character.prompt`
- Event: `event:menu.choose`
- Some utility functions for `Persistent` and `Transform`
- Use a handler to set persistent data
- `scene.local` to store temporary data
- Custom cursor and cursor style

### Fixed

- Game `onReady` handler runs twice

## [0.2.0] - 2024/11/29

### _Feature_

- Assign voice using generator or voice map
- Use `image.tag` to manage image src
- Use displayable actions to reorder layers
- Better image preloading
- Scene config inheritance
- Use the scene name to jump between two cross-referenced scenes
- Use `Persistent` to manage persistent data

### _Incompatible Changes_

- Image constructor signature has changed. Now the first argument must be a config object.

### Added

- Voice map generator
- Image tag src management
- Legacy_Displayable actions
- Layer actions
- Disable image auto initialize using image.config
- Quick image preloading only preloads images when needed
- Use `scene.inherit` to inherit scene config
- Use the scene name to jump between two cross-referenced scenes
- `Persistent` data management (storable actions wrapper)

### Updated

- Image preloader now stores images in stack, so the lib can easily control the process of preloading/unloading images
- Better signatures for `Condition`

## [0.1.7] - 2024/11/16

### _Feature_

- Shorthand for `character.say`

### Added

- Tag function signature for `character.say`

### Fixed

- Position utils position incorrect

## [0.1.6] - 2024/11/13

### _Feature_

- Auto-forward mode
- Components Utils

### Added

- Auto-forward mode
- `game.preference`
- Configure text skipping using preference
- Position Utils: use some utility components to position elements.
  For example, you can use `Top.Left` component to create your quick menu
- Use `VBox` and `HBox` to create a vertical or horizontal box of elements

## [0.1.5] - 2024/11/05

### _Feature_

- Wearable API: Now you can add wearable images to an image,
  child image will be rendered relative to the parent image.

### Fixed

- Throw error when deserializing a game state with image state

### Added

- Wearable API

## [0.1.3] - 2024/10/29

### _Feature_

- auto scale for displayable elements
- element inspector

### Fixed

- Menu position incorrect
- image position incorrect when transitioning
- "No scope found" when inspect mode is disabled
- some type errors

### Added

- auto scale for displayable elements
- element inspector

## [0.1.2] - 2024/10/24

### _Incompatible Changes_

- `game.config.player.width` and `game.config.player.height` cannot be string anymore

### Fixed

- Image scale incorrect when resizing the stage

## [0.1.1] - 2024/10/23

### Fixed

- Image transform position incorrect
- throw error when color is not in correct format
- image disappear during transition
- text skipping does not work correctly

## [0.1.0] - 2024/10/23

### _Feature_

- specify the voice of each sentence
- show text on the screen using `Text` element
- use pure color as background
- animate font size and color of text
- dynamic dialogue text evaluation
- newline support for character dialogues
- ruby text support
- pause text when the character is speaking

### Fixed

- Transform Animation does not wait for the previous animation to finish
- Text dialogues cannot have newline

### Changed

- changed constructor signature of `Sound`
- changed signature of `character.say`
- refactored sound management
- changed signature of the constructor of `Sentence`, now it does not require a `Character` instance. If you want to
  specify it, use sentence config instead
- Rename `CommonImage` to `CommonDisplayable`
- Refactor `Image.tsx` and `Text.tsx`.
- Use `IImageTransition` instead of `ITransition`
- `BackgroundTransition.tsx` and `Background` is deprecated

### Added

- Added voice support
- Added lock for `liveGame.next`
- Added `sentence.copy`
- Added `character.setName`
- Added `Text` element
- Added Support of pure color background
- Added `sleep` method to `Control`
- Added transition support for `Text`
- Configurable skipping options
- Evaluate sentence text in runtime
- newline support for `Say`
- more customization for dialogue text
- ruby text support
- [pause](src/game/nlcore/elements/character/pause.ts) text when the character is speaking

### Deprecated

- `ColoredSentence.tsx` is deprecated, use `Sentence.tsx` instead

## [0.0.5] - 2024/10/06

### Fixed

- Image animation does not work correctly when using `yoffset` and `invertY

## [0.0.5-beta.1] - 2024/10/04

### Fixed

- Constructing story will enter cycle and cost unexpected time. See [story.ts](src/game/nlcore/elements/story.ts)
  #Story.prototype.constructStory
- Skipping text does not show the complete text

## [0.0.4] - 2024/10/01

### Fixed

- `liveGame.newGame` does not reset the game state
- deserializing does not trigger repainting
- Some methods in `Control` are working incorrectly
- Some image components cannot update correctly

### Changed

- `scene.backgroundImageState` is deprecated, use `scene.backgroundImage` instead
- Now applying of transformations and transitions are separated, you can now apply both at the same time
- Deprecated `contentNode.initChild`
- `liveGame.newGame`, `liveGame.deserialize` and `liveGame.serialize` now does not require a gameState instance

## [0.0.3] - 2024/10/01

### Added

- Hot reset and hot saved loading

### Changed

- `liveGame.newGame` now required a gameState instance
- Deprecated `GameConfig.version`
- Add some instances to `PlayerEventContext`
- Now player mounted events are called in microtask

### Fixed

- New game does not reset the game state
- Positions cannot handle number 0
- Components does not flush after applying transformations

## [0.0.3-beta.1] - 2024-09-30

### Added

- Webkit style support

### Changed

- Changed some interfaces for sound
- Removed support for id of constructable elements

### Fixed

- Scene background transitions is not working

## [0.0.2] - 2024-09-30

### Added

- Changed some interfaces

## [0.0.1] - 2024-09-29

### Added

- Initial release
