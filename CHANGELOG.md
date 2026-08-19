# Changelog

## [0.31.3]

### _Change_

- **A displayable's `transformState` is `readonly`.** The object was never meant to be swapped after
  construction, and 0.31.2 fixed the two lifecycle hooks that were doing it. This makes the rule one
  the compiler holds rather than one the next change has to remember: a mounted host binds a
  displayable once and keeps animating and repainting the object it captured then, so replacing it
  leaves the host driving an orphan, and neither object is invalid on its own so nothing reports the
  split.

  Contents are unaffected. `reset()` and `fromData()` still empty and refill the state through
  `TransformState.resetTo`, and every prop setter works as before. Only code that assigned the field
  outright is affected, which the engine itself only ever did in the constructors `readonly` still
  permits.

## [0.31.2]

### _Fixed_

- **A camera lens effect written after a new game was drawn and then wiped.** `story.camera.vignette(0.72)`
  (and `shutter`, and the same channels set through `Camera.lens()` or a plain `Camera.transform()`)
  reached the plates for a frame and then went back to nothing, so a story that dimmed the corners
  measured `opacity: 0` once it settled. The two strengths were the visible half of a wider defect:
  every displayable's `reset()` and `fromData()` lifecycle hooks **replaced** the element's
  `TransformState` object rather than emptying it, and `LiveGame.newGame()` calls `reset()` on every
  element while the player is already mounted. A mounted host binds a displayable once and keeps
  both animating and repainting the object it captured, so from that point the animation wrote one
  object while the settled repaint read another. On the wrapper element the split is invisible —
  `motion`'s layout projection puts the wrapper's own transform back after the repaint has cleared
  it, which is why a camera `zoom` in the same row appeared to work — but the lens plates are painted
  only from the settled state and had nothing to restore them. Both hooks now empty the state in
  place through the new internal `TransformState.resetTo`, which also releases a lock left over from
  an interrupted animation; a stale lock would otherwise make the next transform on that element
  throw. Saves, serialization and the authoring API are unchanged.

## [0.31.1]

### _Deprecated_

- **`blink` and `vignette` from `narraleaf-react/built-in` now carry `@deprecated`.** 0.31.0 said
  they were superseded but marked nothing, so an editor gave no hint and the note was only findable
  by reading the release. Both still work and are still exported; the tag names
  `Camera.shutter()` / `Camera.vignette()` as the replacement and says why — the helpers draw into a
  scene-level layer, which sits inside the camera transform and is tied to a scene rather than to
  the story.

### _Fixed_

- **Documentation for `Camera.lens()`.** The 0.31.0 notes did not say that it takes its timing as an
  options object, `lens(props, {duration, ease})`, where `shutter()` and `vignette()` take
  positional arguments — nor that the key inside it is `ease`, not `easing`. They also described it
  as setting only the colour and falloff when it accepts the two strengths as well, and did not
  mention that both strengths are clamped to `0`–`1` with a non-finite value read as `0`. No code
  changed; the 0.31.0 entry now says all of it.

## [0.31.0]

### _Add_

- **The camera has a lens: `shutter` and `vignette`.** Two continuous channels on `Camera`,
  animated like a pan or a zoom and combinable with them.

  ```ts
  scene.action([
      story.camera.shutter(1, 180, "easeInOut"),   // eyes close
      story.camera.shutter(0, 220, "easeInOut"),   // and open — that is a blink
      story.camera.vignette(0.72, 300),            // the corners darken
      jS`Everything narrowed to the middle of the room.`,
      story.camera.vignette(0, 300),
  ]);
  ```

  `shutter` is coverage, `0` open and `1` shut: two blades close symmetrically from the top and
  bottom of the frame and meet in the middle. Because it is a value rather than a routine, it holds
  — `story.camera.shutter(0.12)` is a cinematic matte for as long as you leave it, and a blink is
  just the value driven up and back at whatever pace the moment wants.

  `vignette` is strength, `0` to `1`, faded in and out the same way.

  **Why these belong to the camera and not to the scene.** They are things a lens does, not things
  in the scene, so they are drawn by an overlay pinned to the viewport, *outside* the camera's
  transform. A vignette therefore holds still while the stage zooms, pans and rotates underneath
  it. This is also the fix for a real defect: the previous screen-effect helpers drew into a
  scene-level layer, which sat inside the camera transform, so a vignette scaled and rotated with
  the camera — reading as a dark shape stuck to the picture rather than as the edge of the view.
  Their depth is unchanged: the lens covers the scenes, stage transitions, videos and vfx, and
  still sits below the dialog box, menus and the NVL layer.

  Being state rather than a routine is the other half of it. The channels are saved and restored
  with the rest of the camera pose, they combine with `zoom`/`pan`/`darken` in one transform, they
  settle correctly when the player skips, and `resetCamera` clears them.

- **`Camera.lens()` — the colour and falloff the two channels are drawn with.**

  ```ts
  scene.action([
      story.camera.lens({vignetteColor: "#1a0b2e", vignetteInner: "20%", vignetteOuter: "95%"}),
      story.camera.vignette(0.9, 400),
  ]);
  ```

  `vignetteInner` is where the darkening begins and `vignetteOuter` where it reaches full strength,
  both as CSS lengths or percentages of the frame; `shutterColor` and `vignetteColor` are the
  plates' colours. The defaults — `44%`, `78%`, and black — are the values the old helpers used, so
  turning a channel up without touching these gives the picture they gave.

  These take effect the next time the strength they belong to is above `0`, so set them as a cut
  before fading the effect in rather than during it.

  `lens()` also accepts `shutter` and `vignette` themselves, so a single call can set a strength and
  the geometry it is drawn with; `shutter()` and `vignette()` are the shorthand for the strength
  alone.

  **Its timing is spelled differently from the other two, and the difference is easy to trip on.**
  `shutter()` and `vignette()` take positional arguments, `(value, duration?, easing?)`. `lens()`
  takes the props and then an options object, `lens(props, {duration, ease})` — an object rather
  than positions because it sets any number of fields at once, and the key inside it is `ease`, not
  `easing`.

  ```ts
  story.camera.vignette(0.9, 400, "easeInOut");                 // positional
  story.camera.lens({vignette: 0.9}, {duration: 400, ease: "easeInOut"});   // equivalent
  ```

  The same fields are available on a `Transform` via `Transform.lens()`, and to `new Camera({...})`
  as an initial pose, both typed as `TransformDefinitions.CameraLensProps`. A camera's transform
  props are now `TransformDefinitions.CameraTransformProps` — everything an image accepts, plus
  these.

  Both strengths are clamped at the authoring end: a value outside `0`–`1` is pulled into range, and
  a non-finite one reads as `0`. They land in a CSS `inset()` and an opacity, where an out-of-range
  number makes the browser drop the whole declaration — the effect would go inert rather than
  saturate, so the clamp happens before it can.

### _Change_

- **`Camera.resetCamera()` now opens the shutter and lifts the vignette too.** It already returned
  the pose and dropped the filter; it now neutralises the lens as well, which matters because a
  closed shutter is otherwise only openable by the line that closed it. The strengths ease back
  over the duration given, along with the pose. The colour and falloff are cut back to their
  defaults in a final zero-duration step — after the fade rather than with it, because snapping the
  falloff radius while the vignette is still visible would show as a jump, whereas once the
  strength has reached `0` the geometry is inert.

  ```ts
  scene.action([
      story.camera.shutter(1, 180),
      story.camera.resetCamera(600),  // the eyes open again
  ]);
  ```

- **Old saves load unchanged.** A camera state written before this release carries no lens keys;
  they read as neutral, and nothing about the saved format changed.

### _Deprecated_

- **The `narraleaf-react/built-in` screen effects `blink` and `vignette` are superseded.** They
  still work and are still exported. They were assembled out of public API — a scene-level layer
  holding full-screen plates — and carry the two problems that entails: they are tied to a scene
  while the camera is tied to the story, and they render inside the camera transform, so a vignette
  scales and rotates with it. Prefer `story.camera.shutter()` and `story.camera.vignette()`.

## [0.30.0]

### _Add_

- **`Displayable.bringToFront()` — raise one sprite over the others sharing its layer.** Three
  characters on stage, and the one talking is the one behind: until now there was nothing to call.
  Depth between layers has always been `Layer`'s z-index, but *within* a layer the order was fixed
  at the moment each element was added and never moved again, so the only way to change it was to
  hide the element and show it again — which loses its transform, restarts whatever transition it
  was shown with, and reads as a flicker.

  ```ts
  scene.action([
      yukoSprite.bringToFront(),
      yuko.say`It was me, all along.`,
  ]);
  ```

  It is available on every `Displayable` — `Image`, `Text` and `Puppet` — and it is a chainable
  action like any other, so it takes its turn in a `scene.action` list and steps back with the rest
  of the line on undo. Nothing about the element itself changes: same layer, same transform, same
  src. The move is instant and has no options; there is no animation of depth to tween.

  Two things worth knowing before reaching for it:

  - It cannot lift an element above one on a *higher layer*. Layers are composited by z-index and
    that comparison happens first, so an element on the background layer brought to the front of it
    is still behind everything on the layer above. Use `Layer.setZIndex` for that.
  - Two `Displayable` subclasses refuse it: `Layer` and `Camera`. Neither is an element inside a
    layer, so neither has a front to be moved to — see below.
  - The order it leaves behind is part of the saved game. A save taken afterwards restores the same
    front-to-back order, which is also why this needed no new save field and why old saves load
    unchanged.

  There is no `sendToBack`. Repeatedly fronting the elements you want in front, in order, arranges a
  whole group and is the only ordering primitive at present.

- **`Layer.bringToFront()` and `Camera.bringToFront()` throw instead of quietly doing nothing.**
  Both are `Displayable`s, so both inherit the method and both appear to offer it — and for both the
  inherited behaviour would be a no-op. A layer is not an entry in any layer's list; it *is* one of
  the lists. A camera is not in a list either; it is what the lists are viewed through, and every
  layer of every scene moves with it as one unit, so there is nothing it could be in front of.

  Each raises a `RuntimeGameError` naming what to reach for instead, and each does so while the
  story is being built rather than mid-playback, so a script that confuses the two depth models
  fails at once rather than playing as though the line were not there.

  ```ts
  layer.setZIndex(10);          // this is how a layer moves forward
  layer.bringToFront();         // RuntimeGameError

  story.camera.zoom(2, 800);    // this is how the camera changes what is in view
  story.camera.bringToFront();  // RuntimeGameError
  ```
- **`RuleReveal` — transitions driven by a rule image.** A rule image is a greyscale picture that
  says *when* each point of the frame changes over: dark first, bright last. Paint a spiral and the
  scene wipes as a spiral; paint a brush stroke and it wipes as a brush stroke. This is the form
  transition packs are authored in, and the engine now plays any of them.

  ```ts
  scene.jumpTo(next, new RuleReveal({duration: 1200, rule: "/rules/spiral.png"}));

  // A crisper edge, running from the bright end of the rule instead of the dark.
  scene.jumpTo(next, new RuleReveal({duration: 900, rule: spiral, feather: 0.03, inverted: true}));
  ```

  `feather` is the width of the soft edge as a fraction of the rule's tonal range — `0.12` by
  default, which keeps roughly an eighth of the rule in transition at any moment. `0` is not
  available on purpose: an infinitely hard edge aliases against whatever resolution the rule was
  painted at, and the floor is low enough (`0.002`) to read as hard.

  **Why this is its own engine rather than another `Mask` pattern.** `Reveal` takes a `MaskPattern`,
  which is a CSS gradient — so it can play any shape that can be *described* (a wipe, an iris, a
  clock hand, slats, dots) and no shape that cannot. A rule image is per-pixel data with no
  description, so it needs a different mechanism underneath: the sweep is computed by an SVG filter
  rather than a mask image. Everything above that is the same — same `duration`/`easing`, same
  behaviour under skip and undo, and it drives a whole-scene change (`Scene.jumpTo`) and a single
  image alike.

  The rule is stretched to the element it plays on, so paint it at the stage's aspect ratio. Rules
  are low-frequency by nature and do not need to be large: 960×540 is ample for a 1080p stage, and a
  smaller rule is a smaller decode.

## [0.29.1]

### _Fix_

- **Resetting the camera no longer walks the picture through colours nobody asked for.**
  `Camera.resetCamera` returned the pose and cleared the filter in one transform, so the filter was
  eased along with the pan and the zoom. That is fine for a `brightness()` from `darken`, and wrong
  for anything carrying a `hue-rotate`: easing
  `grayscale(1) sepia(1) hue-rotate(185deg) saturate(4) brightness(0.55)` toward `"none"` unwinds the
  angle through 185 degrees of the colour wheel while `grayscale` simultaneously lets the source's
  own hues back in, so the midpoint is not a paler grade but a different colour outright. Measured
  frame by frame coming out of a moonlit grade, the stage went blue, then cyan, then green, then
  olive before arriving — with skin tones green for most of it.

  The reset now runs as two sequences: the filter is dropped in a zero-duration step, then the pose
  eases over the duration given. Only the filter is lifted out — position, zoom, scale, rotation and
  opacity all interpolate perfectly well and still move the way they did.

  ```ts
  scene.action([
      story.camera.filter("grayscale(1) sepia(1) hue-rotate(185deg) saturate(4) brightness(0.55)"),
      jS`Everything looked like it did that night.`,
      story.camera.resetCamera(600),  // the grade goes at once; the framing still glides back
  ]);
  ```

  Worth knowing while authoring: this is a property of CSS filters, not of the camera. A filter
  interpolates cleanly only between two chains built from the same functions, so any *change* of
  grade — one `hue-rotate` look swapped for another over a duration — has the same problem, and a
  grade is best applied as a cut rather than a fade.

## [0.29.0]

### _Fix_

- **A Latin word inside a CJK line is no longer cut in half.** Every horizontal dialogue box was set
  with `word-break: break-all`, which was there to wrap CJK — and does, but it means what it says.
  An English word in a Japanese or Chinese line was broken wherever the line ran out, with no hyphen
  and at no particular place: `NarraLe / af-React`, `E / nglish`, `verylongun / breakableword`.

  Horizontal text is now set the way vertical text always was: `word-break: normal`, which breaks
  between CJK characters on its own and never needed help with that, and `overflow-wrap: break-word`,
  so a run that fits nowhere — a URL, a long unspaced word in a narrow box — still breaks rather
  than overflowing.

- **Both writing modes are typeset to the strict kinsoku rules.** The prohibitions a reader would
  name first — a line may not begin with 、 。 」 ？ ！, nor end with 「 （ — are applied by the
  browser whatever `word-break` says, and were being honoured all along. The strict set was not: the
  small kana and the prolonged sound mark may open a line under the default, so `った` was split
  after `た` and the next line opened on `っ`. `line-break: strict` is now set on horizontal and
  vertical text alike, which is what a printed book is set to. Measured over 301 container sizes, っ
  opened a line in 20 of them set horizontally and a column in 18 set vertically, and none at all
  afterwards. Tate-chu-yoko is unaffected: a combined `12` measures the same either way.

  This has one prerequisite outside the engine: `line-break: strict` is a no-op unless the document
  declares a language. Any `lang` will do — `en` is enough, and a shell built by NarraLeaf Studio
  already carries one — but a host page with no `lang` on it gets the default rules.

  Lines wrap in different places than they did. No story needs editing for this, but a Latin word
  that used to be split now moves to the next line whole, so a box measured against the old wrapping
  can come out one line taller.


## [0.28.0]

### _Add_

- **`Exposure` — a transition that burns the frame out instead of covering it.** The outgoing frame
  is driven up in stops until it clips to white, the images change hands inside that white window,
  and the incoming frame comes back down to a normal exposure.

  This is not a white plate faded over the picture. A plate moves every colour toward white at one
  rate, so nothing arrives before anything else and no colour changes hue on the way. Exposure
  multiplies, and each channel clips on its own: the highlights are gone almost at once, a saturated
  colour passes through a shift as its leading channel tops out — a red goes coral, then cream — and
  the shadows are the last thing left standing. `ThroughColor` with a white colour remains the plate
  version; both are worth having.

  ```ts
  scene.jumpTo(nextScene, new Exposure({duration: 1200, ev: 4.6}));
  ```

  `ev` is the peak exposure in stops, so the frame is driven to a gain of `2 ** ev`. `hold` holds the
  blown-out frame for a fraction of the duration, the way it does on `ThroughColor`.

  `lift` is the one option worth reading about before changing it. Gain alone never whitens pure
  black — multiplying zero leaves zero — so with no lift a night scene finishes its burn as a black
  silhouette against white. The lift is the flare a real lens adds, mixed in ahead of the gain and
  ramped in with it, which carries the shadows up too. It defaults to `0.04` and does not touch a
  frame at rest.

  Like every other built-in, this drives an `<img>` and a whole scene root alike, so it is available
  to `setBackground`, to a character's portrait, and to `jumpTo`.

  | Option | Type | Default | |
  | --- | --- | --- | --- |
  | `duration` | `number` | required | Duration in milliseconds. |
  | `ev` | `number` | `4.6` | Peak exposure in stops; the frame is driven to a gain of `2 ** ev`. |
  | `lift` | `number` | `0.04` | Shadow lift (0–1) applied ahead of the gain. |
  | `hold` | `number` | `0` | Fraction (0–1) of the duration spent fully blown out. |
  | `easing` | `EasingDefinition` | — | Easing applied across the whole run. |

  Documented at [Exposure](https://narraleaf.com/docs/narraleaf-react/core/animation/transition/exposure).

## [0.27.0]

### _Add_

- **`Word.custom` — a word rendered by a component of yours.** Colour and weight are all a word
  could ever say about itself. A glossary term that opens its definition where the player tapped it,
  a name that leads into an in-game encyclopedia, a number that reads out of a variable and glows
  when it changes — none of that fits in a config object, and until now the only way to reach it was
  to replace the dialog component wholesale and lose the typewriter with it.

  A custom word is an ordinary text word wearing a component. It is typed out character by
  character like any other, it reaches the backlog, the read-text record and the voice pipeline as
  its plain text, and it is never serialised — the renderer is re-attached when the line is
  evaluated again, so a save carries no trace of it.

  ```tsx
  function GlossaryTerm({children, revealed, data}: WordRenderProps<{entry: string}>) {
      const [open, setOpen] = useState(false);
      useSuspendAdvance(open);

      return (
          <span className="underline decoration-dotted"
                onClick={() => revealed && setOpen(value => !value)}>
              {children}
              {open && <span className="absolute">{glossary[data.entry]}</span>}
          </span>
      );
  }

  character.say([
      "今天的",
      Word.custom("以太浓度", GlossaryTerm, {data: {entry: "aether"}}),
      "高得反常。",
  ]);
  ```

  The renderer is given the word's text as `children` **already laid out** — ruby, vertical writing
  mode and tate-chu-yoko applied — so rendering `{children}` keeps all three without knowing they
  exist. Rendering `text` instead silently drops them. Alongside it come `text` (what has been
  revealed so far), `fullText`, `revealed`, `done` (whether the whole line has finished), the
  resolved `style`, the word's `config`, and the `data` payload.

  It renders *inside* the element the engine styles, so the style chain — engine defaults, then the
  dialog's text props, then the sentence, then the word — already applies to it, and anything the
  renderer sets wins by being last. `Word.custom` composes with the other factories in either
  direction: `Word.bold(Word.custom(...))` and `Word.custom(Word.color(...), Term)` both keep
  everything.

  Clicks behave the way a player would expect without the renderer doing anything about it. While
  the word is still being typed, clicking it advances the line as clicking anywhere else does. Once
  revealed, the word takes its own clicks and the line does not advance behind it.

  A custom word carrying a line break is drawn as one wrapper per line, since the break sits
  between them and belongs to neither; only the last of them reports `revealed`. Keep line breaks
  in the words around it, not inside it.

  The overlay described below is a feature of the ADV dialog box. In NVL mode a custom word renders
  and behaves the same, but `useDialogOverlay` has nowhere to draw and reports no container, so a
  popup there has to render inline.

- **`registerWordRenderer` — name a renderer that a word can ask for by id.** A word built in code
  can hold a component. A word that arrives as data — compiled from a story file, contributed by a
  plugin — can only hold a name, so `render` accepts a string as well and resolves it at render
  time. An id nothing answers to renders as plain text and reports itself once, rather than taking
  the scene down with it.

  ```tsx
  registerWordRenderer("glossary", GlossaryTerm);
  new Word("以太浓度", {render: "glossary", data: {entry: "aether"}});
  ```

  `unregisterWordRenderer` and `getWordRenderer` are exported alongside it; registering an id again
  replaces it, and lines already on screen pick the new component up on their next render.

- **`useSuspendAdvance` — hold the line while something of yours is open.** A popup drawn over a
  line has to stop the line advancing underneath it, or the space bar meant to dismiss the popup
  skips to the next line instead. Pass `true` while it is open and the stage click, the advance key
  and the skip key all stop reaching the dialog; the hold is released on `false` and on unmount, so
  a popup that disappears cannot leave the game stuck. Several holds may be out at once and the
  line resumes when the last is released. `GameState.suspendAdvance()` is the same thing outside
  React, returning the release as a function.

- **`useDialogOverlay` — somewhere to draw what belongs to a line but does not fit inside it.** An
  inline popup rendered where its word sits is clipped by the text box, and one portalled to
  `document.body` leaves the stage's scale behind and is drawn at a size that no longer matches the
  line it explains. The overlay covers the dialog, inside that same scale, and paints above it.

  ```tsx
  const overlay = useDialogOverlay();
  const rect = overlay.measure(anchorRef.current);

  return rect && (
      <overlay.Portal>
          <div style={{position: "absolute", left: rect.left, top: rect.top, pointerEvents: "auto"}}>
              {definition}
          </div>
      </overlay.Portal>
  );
  ```

  `measure` reports an element's position in the overlay's own coordinates — the dialog at its
  authored size, before the stage scales it — so the result can go straight to `left`/`top` without
  the popup ever knowing what the stage scale is. The overlay lets clicks through everywhere its
  children do not paint; give the popup itself `pointer-events: auto`.

### _Change_

- **A scene transition is played across the stage, not across the background.** `Scene.jumpTo`
  used to hand its transition to the outgoing scene's background image and swap that image's
  source for the incoming scene's. Only the background ever moved: sprites, text and every other
  layer of the scene being left simply vanished at the end of it, and a `Reveal` or a `Push`
  uncovered a background with nothing standing in front of it.

  The two scenes are both on screen for the length of a jump, so the transition now drives them
  as wholes — the outgoing scene plays the transition's outgoing half, the incoming scene its
  incoming half. Nothing about how a transition is written changes, and the same transitions are
  used for both kinds of swap:

  ```typescript
  scene.jumpTo(nextScene, new Reveal({duration: 800, pattern: Mask.iris()}));   // the whole stage
  scene.setBackground("bg/night.png", new Dissolve({duration: 400}));           // the background
  ```

  Three things follow from it:

  - **A transition's geometry is the stage, not the background image.** A `Push` travels the width
    of the stage and a `Mask` is laid over the stage rectangle. With a background that fills the
    stage — the usual case — this is what it already looked like; a background deliberately
    smaller than the stage will now be swept along with everything else rather than being the
    thing swept.
  - **The dialogue box takes no part in it.** It is rendered outside the stage, and it keeps the
    behaviour it has always had: it is simply gone once the scene ends.
  - **Videos and vfx keep their place above the scenes for the whole jump.** They belong to no
    scene and so take no part in a swap between two of them: a vignette or a blink left running
    across a scene change stays visible over both halves. The one exception is a transition whose
    own effect is a full-screen hold — `ThroughColor`'s colour plate — which covers everything the
    camera holds, since a plate the stage paints over is not a plate.

  `JumpConfig.transition` is widened from `ImageTransition` to `Transition`; every built-in
  transition satisfies both, so existing calls are unaffected.

- **`allowSkipSceneTransition` replaces `allowSkipBackgroundTransition`.** The old flag was never
  read by anything — a background transition was skipped under `allowSkipImageTransition` like any
  other image. The new one governs the stage transition a jump plays, and defaults to `true`,
  which is what a jump did before. The old name is gone rather than deprecated, so a config that
  set it stops compiling until it is renamed — which is the point, since what it set was never
  read.

## [0.26.0]

### _Add_

- **Stepping back and stepping forward, as one thing: `LiveGame.undo` and `LiveGame.redo`.** The
  backlog is a timeline with a play head on it. Everything up to the head is what `getHistory()` has
  always returned; everything past it — after stepping back — is a future the player has already
  read, returned by the new `getFuture()`. `undo()` moves the head back
  a line, `redo()` moves it forward, `restoreToHistory(token)` moves it to a named line in either
  direction, and `canUndo()` / `canRedo()` say whether there is anywhere to go.

  All four are one mechanism with two ways of carrying it out. Stepping back to a line this session
  actually played unwinds it in place, running the undo each action registered as it ran: the music
  keeps playing, running transitions are left alone, and the stage is not rebuilt. Every line also
  records a self-contained snapshot as it is reached, and that is what a move restores when the live
  stack cannot reach the line — after a save has been loaded, or further back than the stack's cap.
  Both land in the same state; in debug builds the engine checks that they do and reports it if an
  action's undo turns out not to reverse it.

  ```typescript
  const liveGame = game.getLiveGame();

  liveGame.undo();                       // back a line
  liveGame.redo();                       // forward again
  liveGame.canRedo();                    // is there anything ahead?
  liveGame.getFuture();                  // the lines ahead, if any
  liveGame.restoreToHistory(token);      // straight to a line, from getHistory() or getFuture()
  ```

  Three things follow from it, and they are the point of the change:

  - **Stepping back works after loading a save.** `undo` used to walk a stack of closures and
    nothing else. Closures cannot be written to a file, so loading a save left the player with a
    backlog they could not step back into — the button was there and did nothing. That stack is
    still the preferred route while it can reach the line, precisely because it steps back without
    disturbing anything; the snapshot takes over where it stops, so the boundary is no longer there.
  - **Reading forward again keeps what is ahead.** Stepping back three lines and reading forward
    retraces those lines rather than overwriting them, so the rest of what had been read is still
    ahead. The future is dropped only when the story goes somewhere else — the other side of a
    choice — because that future no longer follows from where the story is.
  - **Saving in the past saves the past.** A save written after stepping back carries the backlog up
    to that line and nothing beyond it. Loading it opens there with nothing to step forward into,
    which is what saving in the past means.

  `undo()` no longer takes an action id; a line is named by its token through `restoreToHistory`.
  Both return `false` rather than throwing when there is nowhere to move. `getHistory()` no longer
  includes lines ahead of the play head — ask `getFuture()` for those. The internal
  `GameHistoryManager.serializeUntil` is gone, its job now done by serializing up to the play head.

- **Vertical text.** `Texts` (and `TextsPreview`) take `writingMode`, `textOrientation`, and
  `tateChuYoko`, so a dialogue box can be set the way a Japanese novel is: glyphs upright in a
  column that reads top to bottom, the next column to the left.

  ```tsx
  <Texts writingMode="vertical-rl" tateChuYoko={2} />
  ```

  The two settings that are not just CSS on the container are about text that is not Japanese, and
  both are handled per word as the typewriter reveals it:

  - **A Latin word stays whole.** The renderer sets each word `word-break: break-all` so that CJK
    wraps anywhere, which in a vertical column splits "Prologue" across two columns one sideways
    glyph at a time. Vertical text uses `word-break: normal` instead, which still breaks between
    CJK characters.
  - **Short runs stand up.** `tateChuYoko` wraps a run of up to N Latin characters or digits in
    `text-combine-upright: all`, so a two-digit number reads across the column instead of lying on
    its side (縦中横). `true` uses two characters, `false` turns it off.

  Both follow the conventions Japanese text layout is specified by. JLREQ 2.3.2 lists three
  orientations for Latin inside vertical text and gives rotation as the one for English words and
  sentences, tate-chu-yoko as the one for two-digit numbers; JIS X 4051 4.8 puts tate-chu-yoko at a
  two-digit numeral or a two-to-three letter combination. Hence the default of two, and hence a
  longer word rotating whole rather than being cut down to fit.

  **Ruby is left to the browser in vertical text and has not been tuned for it.** A word with a
  `ruby` reading renders beside its base characters in the right reading order, but the markup this
  renderer emits - an `inline-block` `ruby` with a block `rt` - sets the reading looser against its
  base than print does.

  `writingMode` defaults to `horizontal-tb`, where all three settings are inert: text that does not
  ask for a vertical box renders exactly as before, down to the same single text node per word.

  The three unions - `TextWritingMode`, `TextGlyphOrientation`, `TateChuYoko` - are exported
  alongside `TextAppearanceProps`, so an application can hold one of these values in its own
  settings object or pass it down through its own props without restating the union.

### _Change_

- **A save carries the elements that differ from the script, not the whole cast (save format v3).** A
  story reaches every element of every scene it can jump to, and `elementStates` listed all of them —
  so a project's entire cast was written into every save, and into every per-line history snapshot
  besides. The cost grew with the size of the project rather than with what was on stage. Played in a
  browser, an eight-scene story of 156 elements now writes 2 of them into a save and 3 into each
  backlog snapshot, and the same save comes to 42 KB where the old serializer would have written
  about 1 MB.

  What differs at any moment is small, because leaving a scene already returns everything that scene
  put on stage to its authored state. A save now lists only the elements whose state no longer
  matches what the script wrote, and loading resets every element before applying the save — so an
  element the save does not name is restored by being reset, rather than left holding whatever the
  running session had put in it. That last part fixes a case that predates this: loading a save
  written before an element existed used to leave that element untouched, which after a `setName`
  meant the renamed character survived the load.

  For an application that saves and loads through `LiveGame`, nothing changes but the size of the
  file. Two things are worth knowing:

  - **Older engines cannot read a v3 save correctly.** They apply the entries and skip the reset, so
    elements the save leaves out keep whatever the session had. Saves written by 0.25.0 and earlier
    load unchanged here.
  - **Element state written from outside the engine's action dispatch is not seen.** An element is
    considered for the save when an action runs against it, which covers everything a story does. A
    host that writes element state directly — an editor moving a sprite — should call the new
    `element.markDirty()`, or the write is skipped and loading brings back what the script wrote.
    `DevTools.setDisplayableTransformProps` now does this for you. In debug builds
    (`app.debug: true`) the engine periodically walks every element and warns, naming any whose state
    has drifted with nothing marking it, and marks them so the next save carries them.

### _Fix_

- **Clicking the stage advances the dialogue.** A click was recognised the whole way through — the
  stage click announcer accepted it and emitted `event:state.player.stageClick` — and then nothing
  moved, because the ADV dialog listened only to the skip key. NVL dialogs have always listened to
  both. So a game whose players click to read, rather than pressing a key, did not advance at all.
  A click now does what one press of the skip key does: it completes the line being typed, and
  advances a line that has finished. Holding the skip key still forces, and a click never does — a
  player who clicks has asked for one line, not for the rest of the scene.

- **A backlog token still names its line after a load or a rewind.** `LiveGame.restoreToHistory`
  takes a token from `getHistory()`, and both loading a save and restoring a line rebuild the backlog
  — which minted fresh tokens for every entry. Every token a caller was holding went stale at that
  moment, silently: a backlog UI's buttons stopped working until it re-read the list, and restoring
  to the same line twice failed the second time, because the token that had just worked no longer
  existed. Tokens are now written into the save and kept when it is read back. Saves written before
  this carry none, and their entries are given fresh tokens as before.

- **`Camera.reset` is now `Camera.resetCamera`, and a new game no longer inherits the last
  playthrough's framing.** Every element carries an internal `reset()` — the hook the engine runs
  over the cast when a new game starts or a save loads, returning each element to the state its
  constructor config describes. `Camera` spent that name on an authoring helper instead: the
  chainable "return to the neutral pose" transform. So when `LiveGame.newGame()` ran its reset pass,
  a camera got the helper, which builds a transform action nobody executes, and `transformState` was
  never restored. A story that panned or zoomed anywhere kept that framing into the next
  playthrough. A save written afterwards carried the pose correctly, so the symptom appeared only on
  New Game.

  The authoring helper keeps its behaviour under the new name:

  ```typescript
  scene.action([
      story.camera.zoom(2, 800),
      story.camera.resetCamera(600),   // was: story.camera.reset(600)
  ]);
  ```

  **Rename any `camera.reset(...)` in your script.** Calling `reset()` on a camera now reaches the
  lifecycle hook: it restores the configured pose at once, animates nothing, and returns the camera
  rather than a chainable action.

- **A layer no longer carries its pose out of the scene that declared it.** `Layer` is mutable at
  runtime — `transform`, `setZIndex` — and serialises both, but it never implemented `reset()`, so
  it inherited the empty default. A layer slid aside or faded out stayed that way for every scene
  that followed, and survived `newGame()` as well. `Layer.reset()` now restores the configured
  z-index and pose, and leaving a scene resets the layers that scene put on stage, not only the
  displayables standing on them. The story camera is deliberately exempt: a story owns exactly one
  and it frames the stage across scene changes.

- **A character's name is saved.** `Character.setName` rewrites a character's name mid-scene — how a
  story shows an unfamiliar speaker as "???" and names them at the reveal — but `Character` never
  implemented `toData()`, and `Story.getAllElementStates` drops any element whose data is empty. So
  no save ever recorded a name change: a player who saved after the reveal came back to "???", in
  the dialog box and in the backlog alike. Characters now serialise their state like every other
  element, and `reset()` hands back the authored name rather than whatever the last playthrough
  left behind.

  Saves written by earlier versions carry no character entry and still load, leaving the authored
  name in place. Because characters now occupy save entries, and a generated element id describes a
  position in the action tree rather than an identity, an application that restores saves should
  name its cast through
  [`DevTools.setElementStaticId`](https://narraleaf.com/docs/narraleaf-react/core/elements/built-in/dev-tools#setelementstaticid),
  the way 0.25.0 describes for displayables.

## [0.25.0]

### _Add_

- **`DevTools.setElementStaticId` — name an element yourself, and keep that name.** Elements
  reachable from a scene's action tree are named `e-0`, `e-1`, ... by their position in a
  breadth-first walk at story construction. A position describes where an element sat, not which
  element it is: add a line ahead of one and its name moves to a different element. A save restoring
  `elementStates` by that name then applies one element's state to another — a layer's pose onto a
  background image — and reports nothing, because the name it asks for still exists.

  Name the elements you build and construction keeps those names instead:

  ```typescript
  const classroom = new Image({src: "bg/classroom.png"});
  const yuko = new Character("Yuko");

  DevTools.setElementStaticId(classroom, "bg:classroom");
  DevTools.setElementStaticId(yuko, "character:yuko");

  // Construction now assigns "bg:classroom" and "character:yuko" rather than e-3 and e-4,
  // and a save written today still resolves both after the script is edited.
  ```

  This differs from [`setElementId`](https://narraleaf.com/docs/narraleaf-react/core/elements/built-in/dev-tools#setelementid),
  which is overwritten at construction for anything the action tree reaches. Pass `null` to drop a
  name and fall back to the generated one.

  Nothing changes for an application that names no elements: generated ids are still assigned, in
  the same order, to everything unnamed.

## [0.24.1]

### _Fix_

- **A scene hands out the same `Sound` for the same voice clip.** `Scene.getVoice` built a new
  `Sound` on every call for a map entry given as a URL string, and `AudioManager` keys a playing
  clip by the instance — so asking "is this line's voice still playing?" produced an object the
  manager had never seen and the answer came back `null` against a clip that was audibly playing.
  Two things depended on that answer and therefore quietly did nothing: **the 0.24.0 auto-forward
  wait**, which only ever waited for takes given as pre-built `Sound`s (per-character buses) and
  never for the ordinary URL case; and `useVoiceState`'s token, so a custom UI could not tell that
  the automatic voice was still going. Replaying a line also layered a second copy over the first
  instead of restarting it. The cache is keyed by resolved src, not by id, so switching dub language
  still yields a different `Sound` for the same id.

- **"Let it play on" no longer stacks voices.** `voiceEndMode: "none"` leaves a clip running past the
  end of its own sentence, which is the point — but nothing cut it when the *next* voiced line
  started, so advancing through voiced dialogue layered every clip over the last and a player
  clicking quickly could have three or four actors talking at once. A new voice now stops the one
  still trailing. An unvoiced line still passes over a trailing clip without touching it, which is
  the behaviour the mode exists for.

## [0.24.0]

### _Fix_

- **Auto mode no longer talks over the cast.** `autoForwardDelay` was counted from the moment the
  text finished typing, and typing finishing has nothing to do with the voice finishing — so on
  every line whose clip outran the delay, auto mode advanced mid-sentence. It now waits for the
  line's voice to end and *then* applies the delay, which is what the delay was always meant to be:
  a pause after the line rather than a race against it. A line with no voice, or one whose clip has
  already ended, schedules exactly as before, so an unvoiced game sees no change at all. Turning
  auto off, advancing by hand, or leaving the dialog while a clip is still playing all drop the
  wait, so a dialog the player has left never advances later.

### _Feature_

- **A backlog entry now carries the line's `voiceId`.** `GameElementHistory` for a `say` entry
  already reported `voice`, but that is a resolved clip URL, and a host addresses audio by id — so
  a backlog replay button could not be built from what the entry gave you. The entry now also
  carries the `voiceId` the line was filed under:

  ```ts
  for (const entry of liveGame.getHistory()) {
      if (entry.element.type === "say" && entry.element.voiceId) {
          // hand the id back to whatever owns your voice table
          replay(entry.element.voiceId);
      }
  }
  ```

  Optional, and `null` on a line voiced through the inline `config.voice` rather than the scene's
  voice map. Entries recorded before this version simply do not have it, so an old save loads
  unchanged.

## [0.23.1]

### _Fix_

- **A player's volume no longer comes back at full after a restart, on the three seeded buses.**
  `setupGroupVolume()` read the three volume preferences and *wrote* them into the buses at init and
  at reset. They default to 1, so anything already there lost — a volume a host had just restored
  most of all. Buses the author declared were never affected, because nothing copies into them, so
  the failure was invisible except on `bgm`, `sound` and `voice`: exactly the three every existing
  game uses. Patching the copy to run earlier or skip conditionally would have kept two stores for
  one number, so the copy is gone.

  **`bgmVolume`, `soundVolume` and `voiceVolume` no longer *drive* the seeded buses — they ARE the
  player's half of them.** Reading either surface reads one number: `game.audioBuses.getVolume("voice")`
  and `game.preference.getPreference("voiceVolume")` cannot disagree, and writing either one drives
  the audio graph immediately, whether or not a player is mounted. Nothing is copied at init, so
  there is no ordering rule: a host may restore volumes at any point after `new Game(...)`, on
  seeded and declared buses alike. A settings UI that writes `voiceVolume` today is unaffected and
  gets two things it did not have — its slider reflects a volume restored through the mixer or
  loaded from a save instead of sitting at 1, and a write made while the player is unmounted is no
  longer dropped. On a fresh install these still read `1`, meaning "no further attenuation"; the
  author's declared mix is a separate number underneath and is never reported here.

- **A voice may live anywhere under `voice`, and background music anywhere under `bgm`.** `Scene`'s
  two checks were equality tests that threw, so a voice on a per-character bus failed story compile
  before a sample was ever loaded. They are descendant checks now. A bus id the engine has not been
  told about is accepted, because scenes are routinely constructed before the host constructs its
  `Game` — a misspelled bus is caught at play time instead, where the manager warns once and routes
  the clip to the sfx bus rather than going silent.

### _Fix_

- **Two `Game`s no longer share one settings object.** `Preference` kept the defaults object it was
  handed and wrote straight into it, and `Game` hands it the module-level `Game.DefaultPreference` —
  so every `Game` in the process shared one settings object, a second game started at the first
  player's volume, and moving a slider permanently rewrote the framework's own defaults for the rest
  of the process. `Preference` now copies what it is given.

- **A volume slider no longer zippers.** A bus volume was written as a bare `gain.value` assignment,
  so dragging a slider arrived as a staircase of discontinuities. Bus volume changes are now ramped
  over ~20ms, with the exact target pinned afterwards so a long drag accumulates no drift.

- **The channel budget can no longer be reached by a large cast.** The audio backend caps channels
  at 128 including the master and throws outright at the cap; the engine now asks for a ceiling a
  bus-per-character game cannot walk into.

## [0.23.0]

### _Feature_

- **Audio is a mixer now, not three fixed channels.** `GameConfig.audioBuses` lets the host declare
  a tree of buses at boot — `{id, parentId, volume}` — and the engine realizes it into the audio
  graph, so a bus's gain cascades onto everything beneath it:

  ```ts
  new Game({
      audioBuses: [
          {id: "cast", parentId: "voice"},
          {id: "alice", parentId: "cast", volume: 0.8},
      ],
  });
  Sound.voice({src: "alice-01.mp3", type: "alice"});
  ```

  This is what per-character voice volume needs and what the engine could not express: a player can
  turn one character down or off without touching the rest of the cast. `bgm`, `sound` and `voice`
  are seeded whether or not they are declared, so a game that says nothing behaves exactly as
  before, and every save ever written still restores — those three ids are still those three buses.

- **`Sound.config.type` accepts any declared bus id.** `SoundType` is unchanged and still exported,
  and its three values still mean what they meant; the type is now `SoundBusId`, which is
  `SoundType | (string & {})` so the built-ins still autocomplete. `Sound.voice()`, `Sound.bgm()`
  and `Sound.sound()` now *default* `type` rather than overwriting it, so
  `Sound.voice({src, type: "alice"})` puts the line on `alice` instead of silently ignoring it.

- **Per-bus volume, live, through `game.audioBuses`.** `setVolume(id, volume)`, `getVolume(id)`,
  `getDeclaredVolume(id)`, `getEffectiveVolume(id)`, `setVolumes(map)`, `getVolumes()`, `list()` and
  `onVolumeChange(listener)`. Changing a bus applies to sounds that are **already playing** — a bus
  is a gain node the clip is routed through, so nothing is stopped, found or restarted. The mixer
  lives on `Game`, not on the audio manager, so a host can restore its saved volumes at any point
  after `new Game(...)`, before the audio context has unlocked or the player has mounted; values set
  early are applied when the channels exist.

  **A bus carries two numbers, and they do not overwrite each other.** `AudioBusDeclaration.volume`
  is the *author's* mix position — where a bus sits relative to the others in the game as shipped.
  `mixer.setVolume`/`getVolume` is the *player's* control, which starts at 1 and means "leave the
  author's mix alone". What reaches the gain node is the product (`getEffectiveVolume`). So a game
  declaring `{id: "sound", volume: 0.6}` plays SFX at 0.6 for a player who has touched nothing, and
  a player who drags the SFX slider to maximum gets 0.6 back rather than a bus at full gain. Persist
  `getVolumes()` — the player's half only; the author's mix is game content and returns with the
  game, so re-mixing a shipped title still reaches players who already have settings saved. One gain
  node per bus either way: two gain stages in series compute exactly what one multiplication does.

  `bgmVolume`, `soundVolume` and `voiceVolume` continue to govern the three seeded buses.

## [0.22.0]

### _Feature_

- **A looping clip can repeat from somewhere other than where it started.** `ISoundUserConfig` gains
  `loopStart` — the point each repeat returns to, as opposed to `seek`, which stays the point the
  *first* pass begins at:

  ```ts
  Sound.bgm({src: "theme.mp3", loop: true, seek: 0, loopStart: 12, endTime: 90});
  ```

  That is the standard shape of background music with an intro: play the opening once from the top,
  then repeat only the body forever. Until now `seek` had to be both things at once, so the intro
  could only be had by giving it up on every later pass. Omitting `loopStart` keeps the old
  behaviour exactly — each repeat returns to `seek`. A value outside `[seek, endTime)` describes no
  playable region and falls back to `seek` rather than producing a silent zero-length loop.

- **A bgm-typed sound can be played with `Sound.play()`.** It used to throw `StaticScriptWarning`,
  which failed the whole story at chain-build time rather than the one line responsible. The guard
  was protecting nothing: `SoundType` selects which volume slider governs a clip and does not do
  anything else anywhere in the engine, `LiveGame.playSound` has always played bgm-typed clips
  through the very same manager path with no check, and a scene's background music is a separate
  reference that `play()` cannot reach or disturb. Meanwhile the combination it forbade is one
  authors legitimately want — an ambience track on the music bus, so the player's music slider
  governs it, played from an ordinary line. It is now a `console.warn` that names the one real
  difference: a clip played this way is not in the scene's background-music slot, so leaving the
  scene will not stop it and nothing cross-fades it. Clips on the other two buses say nothing.
  (`Scene`'s own check — that its configured `backgroundMusic` *is* a bgm — is unchanged.)

### _Fix_

- **A loop region actually loops.** `Sound.bgm({loop: true, seek, endTime})` shipped in 0.21.0 and
  has never repeated: it played its region once and then stopped dead, which sounds like a truncated
  asset. The audio backend turns `endTime` into a timer that stops the token after one pass, and it
  arms that timer without ever consulting `loop` — so the very option that was supposed to make the
  clip repeat was also what killed it. The engine now withholds `endTime` from a looping clip's play
  options and sets the region on the Web Audio node itself, which is where the sample-accurate
  repeat was always going to come from. A one-shot with an `endTime` is unchanged: there the
  backend's timer *is* the out point.

- **`Scene.setBackgroundMusic` cross-fades instead of leaving a gap.** It is documented as a
  cross-fade and its `fade` argument is documented as the duration of one, but the outgoing track
  was faded all the way out *before* the incoming one was started — so the two never overlapped, and
  the longer the fade an author asked for, the longer the silence between two pieces of music that
  were supposed to blend. The incoming track now starts while the outgoing one is still fading. The
  call still settles only once the outgoing track is gone, so a scene's init sequencing is
  unchanged, and setting the same clip again still restarts it rather than layering it over itself.

- **A sound's configured volume is no longer discarded when it is played.** `LiveGame.playSound` and
  a dialog line's voice both start a clip without saying anything about volume, and "nothing said"
  was being read as *full volume* rather than as the clip's own — so `Sound.voice({src, volume: 0.4})`
  played at 1 through either path, and a `volume` an author (or a host's UI) set on a sound they then
  handed to `playSound` did nothing at all. The default target is now the sound's own volume, which
  is the same value `Sound.play()` and `Sound.resume()` have always put in their fade options; a
  clip replayed after `setVolume` therefore comes back at the volume it was last set to instead of
  jumping to full. Callers that pass an explicit target are unaffected — `Scene.setBackgroundMusic`
  and the `sound:play` action already did. `playSound` still starts with no fade and leaves no gain
  ramp running when it resolves, so a `setVolume` or a fade driven on the returned token afterwards
  is still the last writer and still wins.

## [0.21.1]

### _Fix_

- **A save no longer refuses to load over one sound it cannot place.** `AudioManager.fromData` threw
  when a saved sound's id was not in the story's element map, which failed the *entire* load. Two
  ordinary situations reach it: a host that played a UI sound through `LiveGame.playSound` (that sound
  belongs to the host, not the story, so it is not in the map — and it has no business resuming out of
  a save anyway), and a save written before the story dropped a sound it used to have. Both now log a
  warning and skip that one clip, which is the outcome a player would have chosen.

## [0.21.0]

### _Feature_

- **A sound can name its in and out points, and loop between them.** `ISoundUserConfig.seek` has
  always been the position playback starts at; it now has a counterpart:

  ```ts
  Sound.bgm({src: "theme.mp3", loop: true, seek: 4.2, endTime: 92.5});
  ```

  Without `loop` the clip stops at `endTime`. With it, the clip returns to `seek` — which is what
  background music with an intro actually needs: play the intro once, then loop the body forever.
  The repeat is the Web Audio node's own loop region, so it is sample-accurate: no gap at the seam,
  and no drift over a session that runs for hours. This is not something a caller could assemble out
  of the existing surface — the backend has supported loop regions all along, and the engine was
  dropping the second half of the pair on the way to it.

  A region whose end is not after its start describes nothing playable, so it is ignored rather than
  played (an inverted pair would otherwise stop the clip the instant it started, which reads as a
  broken asset). A streamed clip has no loop region — only a plain repeat — but the engine decodes
  before playing, so this affects nothing today.

  Restoring a save is where the anchor matters: the position stored in the save is where playback
  resumes, but the loop still returns to the in point, not to wherever the player happened to save.

- **`Sound.seek(seconds)`.** The play head was the one thing about a playing sound that could be
  read (`getPosition`) but not written, so a music-player screen or a "skip the intro" line had no
  way to ask for it. It is a no-op on a sound that is not playing, and it preserves the loop region,
  so seeking inside a looping track does not quietly turn it into a one-shot. Undo restores the
  position the head was at, which nothing else could do — the play head is not part of the
  serialized state.

### _Fix_

- **A sound's configured `rate` reaches playback.** `new Sound({src, rate: 1.5})` type-checked,
  stored the rate in state, and then played at 1× anyway: the playback rate handed to the backend was
  the literal `1`. `setRate()` after the fact worked, which is why this survived — the only broken
  path was the one that asks for a rate up front. Save restore had the same bug, so a game saved
  while a sound was slowed resumed it at normal speed.

- **A scene configured with non-looping background music no longer stalls on its first frame.**
  `ISceneUserConfig.backgroundMusic` is played by the scene's own init, which awaits it — and the
  await went through the code path that resolves when the track *finishes* rather than when it
  starts. A looping track never finishes, so the common case worked and hid this: configure a scene
  with a one-shot piece of music and the scene sat on its opening frame until the music ran out.
  Playback now starts and the scene proceeds, with the fade-in under way. A track that fails to load
  is treated as no music instead of stranding the scene forever.

## [0.20.1]

### _Fix_

- **A `Text`'s constructor config reaches it.** `ITextUserConfig extends TextTransformProps`, so this
  has always type-checked:

  ```ts
  const title = new Text("Chapter One", {opacity: 0, scaleX: 2, rotation: 90});
  ```

  None of the three arrived. `ConfigConstructor.create` copies only the keys its own defaults declare,
  and `Text.DefaultUserConfig` declared `alignX`, `alignY`, `className`, `fontSize`, `fontColor` and
  `text` — no transform props at all. The values went nowhere, silently, and the text was drawn at the
  defaults. `Image` has always spread `TransformState.DefaultTransformState.getDefaultConfig()` into
  its own user config; `Text` now does the same, with the same `position` parser, so a position given
  to a `Text` lands exactly as it does on an `Image`.

  This is not only about the first frame. Constructor config is the state that survives `reset()`, so
  it is what a saved game restores to and what an editor host relies on when it pre-poses a stage — a
  `Text` built with an opacity was losing it on every load, not just at construction.

- **Importing a displayable's module on its own no longer throws.** `Layer`, `Camera`, `Image`,
  `Text`, `Puppet` and `Scene` each built a `static` config while their module was still evaluating,
  and every one of those reads `TransformState` from another module — `Scene` went further and
  *constructed* two `Layer`s. `scene.ts` imports all of them and `text.ts` imports `scene.ts`, so the
  cycle could reach an initialiser before `transform/transform` had assigned its exports:

  ```
  TypeError: Cannot read properties of undefined (reading 'DefaultTransformState')
  ```

  thrown from a stack naming neither module and nothing the caller wrote. Each default is now built on
  first use, which settles the question rather than depending on the order. Call sites are unchanged —
  `X.DefaultUserConfig` is a getter that memoises. A published bundle always had its order fixed at
  build time, so this was only ever reachable from source; it made a single-import test file
  impossible to write, which is why the `Text` defect above went unnoticed for so long.

## [0.20.0]

### _Feature_

- **`Puppet`: a displayable the engine draws none of.** Animated character runtimes — Live2D, Spine,
  or something written in-house — are licensed and distributed on their own terms, so this library
  cannot bundle one. And a `<canvas>` dropped over the stage by hand is not a substitute: it knows
  nothing about where the character stands, which layer it is on, what the camera is doing, or what
  a saved game should contain. Everything an author actually wants from a character on stage lives
  on the engine's side of that line, and every project that has reached for an external renderer has
  had to rebuild it.

  So the engine now ships the half it can: a box. `Puppet` is a `Displayable` like any other — `pos`,
  `zoom`, `scale`, `rotate`, `opacity`, `show`, `hide`, layers, the camera, undo and the saved game
  all apply to it unchanged — and the inside of the box is handed to a backend you register. The
  engine never looks in: `src`, `options`, command names and payloads are opaque values it stores,
  forwards and serialises.

  ```ts
  import {Puppet} from "narraleaf-react";

  game.registerPuppetBackend({
      name: "my-renderer",
      mount(container, ctx) {
          const model = MyRenderer.create(container, ctx.resolveSrc(ctx.src), ctx.size);
          return {
              ready: () => model.loaded,
              apply: (state) => model.setPose(state),   // a complete state, never a diff
              command: (name, payload) => model.run(name, payload),
              resize: (size) => model.resize(size.width, size.height),
              dispose: () => model.destroy(),
          };
      },
  });

  const alice = new Puppet({
      backend: "my-renderer",
      src: "models/alice/alice.model.json",
      size: {width: 900, height: 1200},   // defaults to the stage size
      position: {xalign: 0.3},
      motion: "idle",
  });

  scene.action([
      alice.show({duration: 400}),
      alice.pos({xalign: 0.6}, 800, "easeInOut"),
  ]);
  ```

  **`apply` takes a complete `PuppetState`, never a delta**, and that one decision is what makes
  loading a saved game trivial: the engine rebuilds the state from the save and applies it once,
  instead of replaying every pose change that ever happened to the model. `PuppetState` is
  `{motion, expression, skin, params, slots}` — the three ideas every 2D character renderer has,
  plus free numeric and string maps for whatever is proprietary. Nothing one-shot belongs in it;
  those go through `command()`, which doubles as the escape hatch for hit tests, lip sync and
  everything else the state deliberately does not model. Keys written by a newer engine survive a
  load here untouched rather than crashing it.

  A backend may also implement `describe()`, reporting the motions, expressions, skins and parameters
  a model actually has. It is optional, and it exists so an editor can fill its dropdowns from the
  live model rather than writing a parser for a model format it has no business parsing. Nothing
  gates it on status: an inspector opens when the author clicks it, not when a model happens to have
  finished loading, so a backend that can only describe a loaded model awaits its own load inside
  `describe()`.

  **`ctx.resolveSibling(path)` resolves the rest of the bundle.** No real 2D character model is one
  file — it is a manifest plus an atlas plus texture pages, or a model file plus motions plus physics
  plus textures — and *which* siblings exist is only knowable after parsing the first one, because
  the manifest is what names them. So a backend cannot be handed a list up front, and making the
  author enumerate one would move model parsing to the party least able to do it. It gets the
  arithmetic instead: the path resolves against the directory `src` sits in, `.` and `..` are folded
  away, an already-absolute path wins, and the result goes through the same rules as `resolveSrc` —
  so a texture the author warmed with `scene.preloadImage()` is served from the preload cache here
  too.

  ```ts
  // src: "models/alice/alice.model.json"
  ctx.resolveSibling("alice.atlas");            // -> "models/alice/alice.atlas"
  ctx.resolveSibling("textures/page-0.png");    // -> "models/alice/textures/page-0.png"
  ctx.resolveSibling("../shared/eyes.png");     // -> "models/shared/eyes.png"
  ```

  This is the *only* structure the engine will ever read out of `src`, and it does so only when
  asked. It still does not know what `src` means: not the format, not the contents, not which files
  it pulls in. A backend whose `src` is an opaque key rather than a location gets the path back
  untouched and should be reading `options`, which the engine forwards just as verbatim.

  **The first `apply()` lands before `ready()` is called** — not merely before it resolves. The
  engine mounts, applies the complete initial state, and only then asks whether the model is ready.
  That is deliberate: a backend wants the pose it is loading into *at* load time, rather than every
  model visibly snapping from its setup pose to the author's pose a frame after it appears. Hold the
  state and re-apply it once the model is up, or return a promise from `apply()` that waits for the
  load — which also holds `ready()` back until the pose has landed. `command()` and `resize()` can
  likewise arrive before `ready()` resolves, and `dispose()` can arrive at any point, loading
  included; after it, the engine calls nothing on that instance again.

  **`null` in a `PuppetState` field is the absence of a request, never "leave whatever is there".**
  A state is applied whole, so a cleared field has to visibly clear or a load would not reproduce
  what it recorded. `motion: null` is nothing playing — the model's setup / rest pose. `expression:
  null` applies no expression, and means clearing the track rather than substituting a model's own
  named "neutral". `skin: null` is the model's default skin. A slot set to `null` is cleared, which
  is the same state as a key that was never there. `params` has no null at all: a parameter the map
  does not mention keeps the model's own default, so clearing one means dropping the key.

  **A puppet cannot change its `src`.** Changing the model means a new element: the backend's
  instance lives exactly as long as the element is on stage, and swapping a model out from under a
  live transform is not worth what that lifetime would cost. For the same reason `Puppet` has no
  transitions of its own in this release — `show()` and `hide()` fade the box with opacity.

  **A missing backend is a normal state, not a crash.** Anyone shipping this will eventually forget
  to register a backend, or ship to someone who did. When nothing answers to `config.backend` the
  element still takes its place on the stage, still transforms, still saves and restores — it simply
  draws nothing, and the engine warns once per backend name rather than once per element.

  Quiet is not the same as silent, though, so a game can ask: `puppet.getStatus()` returns the
  `PuppetStatus` of the live instance, and `puppet.onStatusChange(listener)` reports it changing.
  A backend fails asynchronously — the element mounts, then the model does or does not load — so the
  subscription is the half that answers "did my renderer come up", and `"missing-backend"` and
  `"error"` are the two answers worth acting on. What to do about them is the game's decision, not
  the engine's: a project that ships one renderer probably wants to say so on screen, and a project
  where the renderer is optional certainly does not.

  New public surface: `Puppet` (including `getStatus` and `onStatusChange`),
  `Game.registerPuppetBackend` / `Game.getPuppetBackend` / `Game.listPuppetBackends`, and the types
  `PuppetBackend`, `PuppetMountContext`, `PuppetInstance`, `PuppetState`, `PuppetDescription`,
  `PuppetSize`, `PuppetStatus`, `IPuppetUserConfig` and `PuppetConfig`.

  A puppet is posed by its constructor config, by a saved game, by an editor host — and by the story,
  which is the next entry.

- **A story can pose and command a puppet.** `Puppet` gains six chainable actions, and they divide
  along exactly the line `PuppetState` draws.

  Five of them edit that state: `setMotion`, `setExpression`, `setSkin`, `setParam(id, value)` and
  `setSlot(id, value)`. Each writes its one field — `params` and `slots` merge key by key, so nudging
  one parameter does not silently clear the rest — and then hands the backend the **whole** state.
  That is not overhead, it is the point: what an author leaves behind is always a complete state, so
  a load restores it in one `apply` and an undo reverses it in one more. Nothing is ever replayed.

  The sixth, `command(name, payload?, options?)`, sends a one-shot the engine neither models nor
  interprets. It leaves nothing behind, which is what makes it the right home for a motion that plays
  once, a hit test, or lip sync — and equally why a load does not restore it and an undo does not
  take it back. Anything that has to survive either belongs in the state.

  ```ts
  scene.action([
      alice.show({duration: 400}),

      alice.setMotion("idle"),
      alice.setExpression("smile"),
      alice.setParam("ParamAngleX", 12),
      alice.setSlot("prop", "umbrella"),

      alice.command("playMotion", {id: "wave"}),                 // the story moves straight on
      alice.command("playMotion", {id: "bow"}, {await: true}),   // ...and here it waits for it
      alice.setExpression(null),
  ]);
  ```

  **Nothing waits unless it is asked to.** `{await: true}` is opt-in on `command`, and the `set*`
  methods have no equivalent at all. The engine cannot tell a motion worth a beat from a parameter
  nudge, and an author who writes `setExpression("smile")` before a line meant the line, not a pause
  of whatever length the renderer decides to take. Defaulting the other way would hand every backend
  that forgets to resolve the power to park a story; this way it can only stall the one command that
  opted in, and that command is skippable like any other timed action.

  A backend that throws, rejects, or was never registered is logged rather than fatal: the state
  change still stands and is applied in full the next time the element mounts, and a command aimed at
  a puppet that is not on stage warns instead of failing.

  New action types: `puppet:setMotion`, `puppet:setExpression`, `puppet:setSkin`, `puppet:setParam`,
  `puppet:setSlot`, `puppet:command`; new exported type `PuppetCommandOptions`.

- **`DevTools` can drive a puppet imperatively.** This is not public API — `DevTools` is the seam
  editor hosts use, and it moves with their needs — but it is recorded here because those hosts
  depend on it: `getPuppetStatus`, `onPuppetStatusChange`, `describePuppet`, `getPuppetState`,
  `setPuppetState`, `runPuppetCommand` and `listPuppetBackends`. `setPuppetState` writes and applies
  without going through an action, so nothing lands in the story's history, and it works on an
  unmounted element too: the state is complete by construction, so it is applied in full the next
  time that element mounts.

### _Fix_

- **The published declarations typecheck again.** This library is built with `stripInternal`, which
  deletes any declaration marked `@internal` from the emitted `.d.ts`. It does not delete the
  *references* to it. Every public signature that named an internal type went on naming it after the
  name was gone, so the declaration files in the package referred to things they did not declare —
  94 dangling references across 27 files, shipped in 0.19.2 and in releases before it.

  It went unseen because `skipLibCheck: true` is the default posture of almost every TypeScript
  project and it suppresses exactly this class of error. Turn it off, as a project that typechecks
  its dependencies properly does, and the package does not check at all: `Cannot find name
  'CameraDataRaw'` and ninety more like it, none of them in the consumer's own code and none of them
  fixable from there.

  Every type reachable from a public signature is now public, because it always was — a type a
  method returns is part of the API whatever the comment above it claims. `ImageDataRaw`,
  `CameraDataRaw`, `CharacterStateData`, `ConditionData`, `ControlConfig`, `LayerDataRaw`,
  `PersistentContent`, `DynamicPersistentData`, `VideoState`, `VfxState` and `LiveGameEvent` are
  among the names now exported. Where `@internal` was hiding a naming convenience rather than a
  concept, the alias is inlined into the signatures that used it instead of being promoted: the
  `Chained*` aliases become the chained types they stood for, and `PausingShortcut` becomes
  `typeof Pause`. Nothing is renamed, no signature changes shape, and no runtime behaviour moves.

  **The last three had a different cause.** `tsc-alias` rewrites this project's path aliases to
  relative paths in the emitted output, but it leaves an alias untouched — silently — when it cannot
  find the target under `dist/`. The alias for the package's own name pointed at a `.ts` file, which
  is never there, so `dist/built-in.d.ts` and the screen-effect declarations shipped importing
  `"narraleaf-react"` from inside `narraleaf-react`. They now use relative paths like every other
  emitted file. The runtime bundles are unchanged: `built-in.js` still loads the engine from the
  package entry rather than inlining a second copy of it.

  A publish can no longer regress this. `prepublishOnly` now typechecks the emitted
  `dist/**/*.d.ts` with `skipLibCheck: false` and stops the release if one reference dangles.

- **A persistent value can hold a nested structure, and a `Date` anywhere inside it survives the
  save.** `StorableType` allowed exactly one level: a primitive, or an object or array *of*
  primitives. Nothing enforced that at runtime — `Namespace.isSerializable` recursed to any depth and
  `set` stored what it was given — so an author writing

  ```ts
  const player = new Persistent("player", {
      party: [] as {name: string; metAt: Date}[],
  });
  ```

  got a type error, ignored it because the game worked, and then lost the data at the save. The save
  format tagged the *whole* value `"any"` or `"date"` and had nowhere to record that the third
  element of a list used to be a `Date`; `JSON.stringify` reduced it to a string on the way out and
  the loader handed that string back. The value reloaded was not the value saved, and nothing said so.

  `StorableType` is now recursive. Objects and arrays nest freely and only the leaves are
  constrained — a primitive, `null`, `undefined` or a `Date` — because a save file is JSON and a
  class instance, a `Map`, a function or a symbol has no representation in one. A `Date` at any depth
  reloads as a `Date`, with its milliseconds.

  It does this without an in-band marker. `data` in the save is plain JSON, and the two types JSON
  loses are named *by position* in two new optional fields on `WrappedStorableData`: `dates` and
  `undefineds`, each a list of paths like `[0, "metAt"]`. A sentinel object inside the value would
  have been a shape an author could also store — and then their own data would decode as a date. A
  position cannot collide with anything.

  **Existing saves load unchanged.** Both lists are absent from every save written before they
  existed, and a value carrying neither is returned exactly as the previous loader returned it. The
  compatibility runs the other way too: a value made only of primitives, objects and arrays
  serializes to the same bytes it always did, so a save this version writes is still a save 0.19
  reads. The one deliberate change is that a root `Date` is written as ISO 8601 rather than
  `Date.prototype.toString()`, which is what keeps its milliseconds; both parse, in both directions.
  A nested `Date` in a *pre-existing* save is still the string it had already been reduced to — the
  type was gone before this loader ever saw the file, and guessing that any ISO-shaped string used to
  be a date would corrupt real strings.

  The limits, all of them enforced when the value is written rather than when it is assigned:

  - **Nesting is capped at 64 levels.** Past that the save fails with an error naming the position.
    The encoder is recursive and an unbounded walk is a stack overflow reported from somewhere
    unrelated; state that nests past 64 is a data-structure bug, not a save.
  - **A value that refers back to itself is refused,** with an error naming the position. A save is a
    tree. Cutting the back-edge would write a save that loads as a different object graph than the
    one the author built, and they would find out much later. `Namespace.isSerializable` reports such
    a value as `false` instead of recursing until the stack gives out, which is what it used to do.
  - **A leaf that was never storable** — a function, a symbol, a `bigint`, a class instance — is
    saved as `null` with a warning naming the position. It was being lost silently before; the key
    now survives with a `null` in it, so the shape read back is the shape written.
  - **Reference identity is not part of the value.** The same object stored at two positions saves as
    two copies and reloads as two independent objects, the same bargain `JSON.stringify` makes.

  One related change falls out of this: `Namespace.serialize()` and `toData()` now copy rather than
  hand back the live objects, so a snapshot is a real snapshot and mutating a stored object cannot
  reach back into one already taken.

## [0.19.2]

### _Fix_

- **Dialog avatars are preloaded, and painted from the cache.** They were neither, and the two
  halves compounded: an avatar was fetched the first time its character spoke, and then fetched and
  decoded a second time when it was actually painted.

  `Scene.registerSrc` walks the action graph collecting everything a scene will need, but it had no
  branch for `CharacterAction` — so no avatar source, at any level, was ever registered. Meanwhile
  `<Avatar>` rendered the resolved URL directly. That is not what `<Image>` does, and the difference
  matters: the preloader stores each image as a base64 re-encoding and decodes *that*, so both the
  bytes and the decoded bitmap live under the data URL and are reachable only through
  `cacheManager.get()`. Rendering the original URL missed both.

  The scene walk now collects every avatar it can know about ahead of time — the character's own,
  each registered portrait's, and a sentence's per-line override:

  ```ts
  const alice = new Character("Alice")
      .setAvatar("/avatars/alice.png")
      .addPortrait(angrySprite, {avatar: "/avatars/angry.png"});

  // Both are now warm before the scene paints, and swap without a decode.
  alice.say("...");
  ```

  **A resolver's avatars stay invisible to the preloader**, for the same reason a layer resolver's
  srcs are: the answer is derived from the portrait's live state, so what it may return cannot be
  enumerated. Register those yourself:

  ```ts
  scene.preloadImage(["/avatars/happy.png", "/avatars/sad.png"]);
  ```

  `useAvatar()` is unchanged and still reports the resolved *source* URL — that is what identifies
  an avatar to a caller, and a custom avatar component comparing it against its own asset table
  keeps working. The cache lookup happens in `<Avatar>`, at render.

## [0.19.1]

### _Fix_

- **A nested stack's loop counter is reachable again.** `StackFrameSnapshot.branches` carried
  `StackFrameSnapshot[][]` — each branch reduced to its `frames`. Everything a nested stack knew
  about *itself* was thrown away on the way out, and that included `loop`.

  This mattered more than it looks, because `Control.repeat` **is** a nested stack. Its counter is
  set on the nested `StackModel`, so `snapshot()` attached it to the object that model returned —
  and the only route from there to `getStackSnapshot()` was through the parent frame's `branches`,
  which kept `.frames` and dropped the rest. The result: a debug view could see that a repeat was
  running and could see the lines inside it, but could not learn which round it was on, no matter
  how it asked. `tag` was lost the same way for async stacks below the top level.

  `branches` is now `StackSnapshot[]`, so a branch arrives whole:

  ```ts
  const {root} = liveGame.getStackSnapshot();
  const repeat = root.frames[0].branches?.[0];
  repeat?.loop; // {type: "count", counter: 2, limit: 3, broken: false}
  ```

  **Breaking for anyone already reading `branches`** — `branches[i][0]` becomes
  `branches[i].frames[0]`. The type is marked experimental and read-only precisely so a shape like
  this can be corrected rather than duplicated into a parallel field; changing it is the honest fix.

## [0.19.0]

### _Feature_

- **The store now says when a value changes.** `Storable` had no notification of any kind: `namespace.set()` was an assignment and nothing else, so a host that wanted to react to a persistent value — light a badge when `gold` reaches 100, mirror a flag into an editor panel — had no way to learn about it except to read the whole store on a timer and diff it itself. Polling is the wrong shape for something the engine knows exactly: it is late by up to an interval, it burns work on the overwhelming majority of frames where nothing moved, and it cannot tell you what the value *was*.

  `Storable` now reports every write:

  ```ts
  const storable = liveGame.getStorable();

  // every change, anywhere
  storable.onChange(({namespace, key, previous, next}) => {...});

  // one namespace
  storable.onChange("persistent:player", ({key, next}) => {...});

  // one key
  const token = storable.onChange("persistent:player", "gold", ({next}) => {
      if (next === 100) achievements.unlock("rich");
  });
  token.cancel();
  ```

  The payload is `{namespace, key, previous, next}`, where `namespace` is the key the namespace is registered under — `"persistent:player"` for `new Persistent("player", ...)`, the same string `getNamespace()` takes. The listener runs after the new value is readable, so it can read the rest of the namespace and see a consistent state. `assign()` reports one change per key; `reset()` reports the return to each default, and reports a key written after construction as changing to `undefined`, because that is what `reset()` does to it.

  Subscriptions live on the `Storable`, which is created once per `LiveGame` and never replaced, so they survive `newGame()` and loading a save even though both rebuild every namespace underneath them.

- **A write that does not move the value reports nothing.** A line that re-asserts a flag it has already set, or a script that runs `assign` with the values already in place, would otherwise wake every listener on every pass. Equality is structural rather than by reference: a stored value is by definition serializable — a primitive, a `Date`, or a plain object/array of those — so comparing it costs no more than writing it to a save, and the ordinary idioms (`assign({...})`, `set(k, v => ({...v, gold: v.gold}))`, a value round-tripped through a host) rebuild the container even when nothing inside it moved. Dates compare by timestamp, not identity.

- **Loading a save reports itself once instead of replaying every key.** A save carries every key of every namespace it knew about, so reporting a load as changes would turn one `deserialize()` into hundreds of callbacks describing a history the player never lived through — the values did not evolve, they were replaced wholesale. Bulk application instead fires **`onRestore`** exactly once, naming the namespaces involved:

  ```ts
  storable.onRestore(({namespaces}) => rereadMyDerivedView());
  ```

  This covers `liveGame.deserialize()` (one event for the whole save) and rewinding a single namespace to a snapshot, which is how a scene's locals are undone (one event naming that namespace). Ordinary play, where values do evolve one write at a time, still reports per-key changes.

### Upgrading

- **Nothing that was valid before changes behaviour**, and no existing signature moved. `onChange` / `onRestore` / `Storable.events` are new surface on a class that previously had none.

- **A host that polls the store can stop.** Replace the timer with `onChange` for the values you care about and `onRestore` for the reload discontinuity. Watching a value across a save load takes both: `onChange` is deliberately silent during a load, so a listener that must also fire when a loaded save *arrives* already at the interesting value has to re-check it on `onRestore`.

## [0.18.0]

### _Feature_

- **One tag group can now drive several layers of a layered image.** A layered image derived its tag groups from its layers one-for-one — each variants layer declared its own group, and tags had to be globally unique — so a group could only ever move a single layer. That is the wrong shape for the thing layered sprites exist to do: "angry" is not a mouth, it is a mouth *and* a pair of brows *and* whatever else the artist split out, and expressing it meant either flattening those layers back into one image or falling back to a `LayerResolver` per follower, whose sources the preloader cannot see and therefore fetches mid-scene, on the frame the expression changes.

  A group is now identified by its tag *set* rather than by the layer that offers it, so every layer offering the same tags is driven by one group:

  ```ts
  layers: [
      {uniform: "u_body.png", casual: "c_body.png"},
      {uniform: null,         casual: "jacket.png"},   // only the casual outfit has a jacket
      {happy: "brows_happy.png", angry: "brows_angry.png"},
      {happy: "mouth_happy.png", angry: "mouth_angry.png"},
      {happy: null,              angry: "vein.png"},
  ],
  defaults: ["uniform", "happy"],
  ```

  `char(["angry"])` moves all three of the lower layers and leaves the outfit alone; `defaults` names one tag per *group*, not per layer. A follower is an ordinary variants layer, so its sources are enumerable and the existing preload pass covers them — the whole set is registered up front, and switching a tag still costs no fetch.

  This also removes the reason to model an outfit as a separate image. A layer that draws nothing for some tags of a group it follows (the jacket above) is how a variant-specific layer is expressed, so one stack can carry a character's whole wardrobe and a change of clothes keeps the current expression and can cross-fade like any other tag change.

- **`DevTools.getLayerSrcs(image, tags?)`** returns a layered image's per-layer srcs, bottom to top, with `null` for the layers that draw nothing. A layered image has no single src to read — it is a stack — so an editor host rendering its own thumbnail of an on-stage element previously had nothing to read at all.

### Docs

- `LayerResolver`'s opacity to the preloader is now stated on the type: the srcs a resolver can return are invisible to it and are fetched on first use. With followers no longer needing a resolver, this is a limitation of an escape hatch rather than of the common path.

### Upgrading

- **Nothing that was valid before changes behaviour.** Grouping only merges layers offering *identical* tag sets, and any two such layers were rejected outright by the old uniqueness check, so no working configuration is reinterpreted. What changes is that those configurations now load instead of throwing.

- **Offering only part of a group's tags on a follower is an error, and it is the easy mistake to make.** A layer that lists `{angry: "vein.png"}` alone declares a *new* group whose only tag is `angry`, which then collides with the group that already owns it. Repeat the whole set and use `null` for the tags where the layer draws nothing (`{happy: null, angry: "vein.png"}`). The error names the offending tag and says so.

## [0.17.1]

### Fixed

- **`liveGame.fastForward()` no longer hangs forever, and always settles.** Skipping a line is a request broadcast to the renderer (`event:state.player.skip`), and the only things that can honour it — the mounted dialog, the mounted displayable — exist only once React has *committed* that line. The fast-forward loop resumed on a microtask, long before that commit, so for a line the renderer had not painted yet the single broadcast it sent reached no listener at all and was simply dropped. Nothing then settled the step, and the returned promise settled neither way: in practice the play head advanced two lines and stopped, with the caller still awaiting minutes later, the game stuck on that line, and — because the `finally` that restores them never ran — audio left muted and the game left permanently in fast-forward mode. This affected every host of the API and was not new in 0.17; the same two-step signature was measured on 0.16.1.

  The skip request is now re-issued on a frame-ish interval until the step settles, so it survives the render it has to outlive. A line that settles on the first request still costs no extra frame.

- **A step that genuinely cannot be skipped now ends the run instead of parking on it.** Each suspended line is given `stepTimeout` ms (default `10000`) to settle; if it does not, `fastForward` returns the new reason **`"stalled"`** — `{ reason: "stalled" }`, or `{ reason: "stalled", reachedTarget: false }` for an `actionId` jump — and restores volume and the fast-forward flag on the way out. `fastForward` now terminates in every case, so hosts can rely on the promise settling.

### Upgrading

- **`fastForward()`'s `reason` gained `"stalled"`.** Runtime behaviour for the existing values is unchanged, but the return type is wider: an exhaustive `switch` over `reason` needs the extra arm to keep compiling. Hosts that ignore the result are unaffected.

- **A run can now end early on an unskippable step.** In-flight `Control.sleep`, a transition declared `skipTransition: false`, and long video are not skippable, so a fast-forward that meets one waits out `stepTimeout` (default `10000` ms) and returns `"stalled"` instead of continuing past it. Previously the run hung there instead, so nothing that works today starts failing — but a host that treats any non-`"menu"` reason as success should now distinguish `"stalled"`. Raise `stepTimeout` for a story that fast-forwards through long unskippable media.

## [0.17.0]

### _Feature_

- **The opening scene is now loaded and decoded before the game is entered.** Until now the preloader had nothing to work with until `liveGame.newGame()`: it derives its work list from the *mounted* scene, and no scene is mounted before then. A game that shows a main menu first therefore did all of its fetching, base64-encoding and decoding between the player pressing "start" and the first painted frame — on a real project, most of a second of dead time on the one interaction that should feel instant. `Player` now registers `story.entryScene` as the preloading scene as soon as the story is loaded, so that work happens behind whatever the player is already looking at and entering the game becomes a reveal rather than a load.

  Hosts that already call `gameState.preloadScene(...)` themselves are unaffected: the automatic registration only applies when there is neither a preloading scene nor a mounted scene yet.

- **The preload pass runs in two tiers.** The *critical* tier is what the scene about to paint registers directly: its own backgrounds and images, plus the immediate background of any scene it jumps to. It runs unpaced, and it alone gates `event:preloaded.complete`. The *look-ahead* tier is the full asset set of every scene reachable from here (`srcManager.getFutureSrc()`); it runs after the critical tier, paced by `preloadDelay`, and nothing waits for it. Both used to be a single pass, so a large story could not show its first frame until every reachable scene's images had been fetched and decoded — seconds spent on assets the player was not about to see. The cache-eviction pass still runs once over the union of both tiers, and no longer runs at all for a superseded pass, which used to drop the images the *current* scene had just cached. Games running with `preloadAllImages: false` keep their existing predict-by-action behaviour unchanged.

- **Preloaded images keep their decoded bitmap.** A decoded bitmap only survives while something still references it, so the throwaway element the preloader decoded through let it be evicted again before the reveal — and the first visible frame decoded from scratch anyway. The critical tier now holds its decoded elements until the source leaves the cache. The look-ahead tier deliberately does not: a full-resolution bitmap costs width × height × 4 bytes, which is worth paying for the one scene about to paint and not for a whole reachable graph.

- **The scene's sounds are warmed too**, through a new `preload(sound)` on the audio manager (`gameState.audioManager.preload(...)`), which fetches and decodes a source into the audio cache without playing it. A scene whose BGM is still being fetched when it opens stutters into its own first line, and the audio cache was the only place that could be fixed. Nothing waits for this and nothing should: the audio context stays locked until the browser's autoplay policy is satisfied by a user gesture, so an audio warm-up can legitimately sit pending on a page nobody has touched yet. It starts alongside the critical tier and lands on its own; a source that fails to load simply loads on first play, as before. Only the current scene's sounds are warmed — a look-ahead scene's audio is left to that scene's own pass.

### Fixed

- The preload task pool no longer sleeps after its final batch. `preloadDelay` paces *consecutive* batches, but the pool slept after every batch including the last, charging every preload pass an extra `preloadDelay` ms (100 ms by default) of pure idle time — and the initial pass gates the first painted frame, so that idle time was directly visible as start-up latency.

### Upgrading

- `onPreloadComplete`, `oncePreloadComplete`, `whenPreloadComplete()` and `event:preloaded.complete` now fire **before** the game is entered — while a menu is still on screen — rather than after `newGame()` has mounted a scene. That is the point of this release, and it is what a host should gate a loading step on. If you were instead reading them as "the game has content on screen", switch to `onFirstSceneReady` / `whenFirstSceneReady()`: those are unchanged and still require a real mounted scene.

## [0.16.1]

### _Feature_

- The `Darkness` transition — which backs `image.darken(amount, duration)` by animating an image's brightness between two darkness levels — is now exported from `narraleaf-react` alongside the other built-in transitions. Its behaviour is unchanged; only the public export (and its `DarknessOptions` type) is new.

### Fixed

- `Push` now slides in percentages of the layer's own size instead of viewport units (`vw`/`vh`). The element a `Push` drives lives inside the letterboxed stage box, so a `100vw`/`100vh` travel — measured against the *window* — overshoots the stage whenever the window aspect ratio differs from the design aspect ratio, leaving both images off-stage mid-slide and exposing the backdrop behind them. Percentages are measured against that element itself, so a full slide always lands exactly one stage width/height away regardless of window shape. The offset is still applied via the independent `translate` property (identity at rest), so nothing about the API changes.

- Re-mounting the NVL dialog container no longer replays a finished line's text events. The NVL list re-keys an entry on every phase / active-entry change, so a line that had already been revealed re-mounted onto the instant-reveal path with a fresh fire guard — replaying its sound effects and writing its now-stale expression back over the portrait a later line had set, once per advance. The guard now lives on the long-lived NVL entry and is shared by the typewriter and instant paths, so each line's tokens fire exactly once however often the container re-mounts. It is runtime-only and is not part of the save, so loading a game still starts a fresh reveal that fires normally. The standard (ADV) dialog was never affected — its dialog state is already memoized per action.

### Docs

- Three public APIs that shipped in 0.16.0 were missing from its release notes and are documented under [0.16.0] as of this release: the `TextEvent` inline dialogue token, `fastForward({until: {actionId}})`, and the experimental read-only introspection surfaces (`onCurrentActionChange` / `getCurrentActionId` / `getStackSnapshot`). Nothing about them changed in 0.16.1 — if you are already on 0.16.0, you already have them.

## [0.16.0]

### _Feature_

- A **Camera** now transforms the whole stage as one unit. `story.camera` is a single, always-present camera that applies a transform — pan, zoom, rotate, scale, opacity — and a darken/color-grade to every scene, its backgrounds and sprites, and any playing video together, while the dialog box, menus, and NVL layer stay fixed. It persists across scene changes and is captured by save/load like any other element.

  ```ts
  const story = new Story("entry");

  scene.action([
      story.camera.zoom(2, 800, "easeInOut"),   // zoom the whole stage in
      story.camera.pan({ xalign: 0.3 }, 800),   // slide the view across
      story.camera.rotate(3, 400),              // tilt
      story.camera.darken(0.6, 500),            // dim the stage
      jS`It's getting dark...`,
      story.camera.reset(600),                  // return to the neutral pose
  ]);
  ```

  The camera reuses the same `Transform` pipeline as images and layers, so every chainable transform method it inherits — `pos`/`pan`, `zoom`, `scale`, `rotate`, `opacity`, `transform`, `filter`, `effect` — works on it, alongside two camera helpers: `darken(amount, duration?, easing?)` (a shortcut for a `brightness(1 - amount)` filter, `0` normal … `1` black) and `reset(duration?, easing?)` (back to centred, zoom `1`, no rotation, no filter). Because `darken` drives the single CSS `filter` channel, combine it with other filters by writing the full string yourself via `camera.filter(...)`.

  There is exactly one camera per story; pass your own only to set its initial pose:

  ```ts
  const story = new Story("entry", { camera: new Camera({ zoom: 1.2 }) });
  ```

  `Camera` is exported from `narraleaf-react`.

- A new **Vfx** element plays a looping video as a full-screen overlay for particle and ambience effects — falling petals, light dust, rain, snow, fog, light flares — without canvas or WebGL. Two complementary asset routes are supported: **true-alpha** material (VP9 `yuva420p` alpha WebM, default `"normal"` blending) keeps colors faithful on any background and is the route for assets with dark or opaque pixels; **black-background glow** material (VP9 `yuv420p`) combined with `blendMode: "screen"` is 5–10× smaller and hardware-decodable, ideal for purely luminous effects (additive blending washes out dark pixels, so keep dark-edged assets on the alpha route). Loop assets should start and end on the same frame.

  ```ts
  import {Vfx} from "narraleaf-react";

  // true-alpha material: faithful colors on any background (petals with dark edges)
  const petals = new Vfx({src: "/fx/petals-alpha.webm"});

  // black-background glow material + screen blending: tiny files, hardware decodable
  const dust = new Vfx({src: "/fx/dust-black.webm", blendMode: "screen", opacity: 0.9});

  scene.action([
      petals.show({duration: 800}),   // fade in; the action waits for the fade
      dust.show(),
      character`The petals are falling...`,
      petals.setPlaybackRate(0.5),    // slow drifting
      dust.pause(),                   // freeze on the current frame
      dust.resume(),
      petals.hide({duration: 1200}),  // fade out, then stop and leave the stage
  ]);
  ```

  `show(options?)` adds the overlay to the stage, waits for the first frame, and fades it in; `hide(options?)` fades it out, stops playback, and removes it — both accept `{duration?, easing?}` and complete instantly when the player skips. A source that fails to load logs an error and resolves immediately, so a broken asset never blocks the story. `pause()`/`resume()` freeze and continue the loop, and `setPlaybackRate(rate)` adjusts speed (the rate is not saved; a loaded game returns to `config.playbackRate`). The config also offers `loop` (default `true`), `muted` (default `true`; unmuted autoplay may be rejected by the browser), `opacity` (the fade-in target), `fit` (`"cover"` | `"contain"` | `"fill"`), and `zIndex` for ordering multiple overlays. Visible overlays are captured by save/load and re-appear — playing, or frozen if paused — without a fade. Vfx layers render above videos inside the stage camera boundary, so camera pan/zoom/shake moves the weather with the shot while the dialog UI stays fixed.

  `Vfx` is exported from `narraleaf-react`.

- The transition system was rebuilt around a single idea: **engines are instantiated, geometry is vocabulary**. Every transition is now constructed with `new X({options})`, and the mask geometry that used to be scattered across per-shape classes and static factories lives in one place — the static `Mask` vocabulary — passed to an engine as its `pattern`:

  ```ts
  import {Reveal, ThroughColor, Mask} from "narraleaf-react";

  // direct A→B: the new image is revealed through the pattern
  scene.setBackground(bg2, new Reveal({duration: 1200, pattern: Mask.clock()}));

  // through black: cover → hold → uncover, same vocabulary
  scene.jumpTo(next, new ThroughColor({duration: 1800, pattern: Mask.clock()}));

  // no pattern = plain fade through the colour (hold: 0 = flash)
  new ThroughColor({duration: 600, color: "#ffffff", hold: 0});
  ```

  - `Mask` factories: `wipe` (keyword or **any angle in degrees**), `barnDoor`, `iris` (`circle`/`ellipse`), `clock`, `fan`, `blinds` (any angle + feather), `dots` (tiled, with `stagger`); plus `Mask.invert(pattern)` and `Mask.toStyle(pattern, t)` for custom-transition authors. A hand-written `{mask(t, inverted?)}` object works anywhere a built-in pattern does. Every pattern is fully clear at `t = 0` and fully covered at `t = 1`, feather included, and `feather: 0` gives a hard edge.
  - `Reveal` is the new direct-cut engine (the A→B counterpart of `ThroughColor`); both take the same patterns, so a scene change moves between the two families with a one-word edit.
  - `ThroughColor` gained `inverted` (cover through the pattern's complementary orientation — `Mask.iris()` + `inverted: true` is the classic iris-to-black) and `uncover`: `"retreat"` (default; the pattern backs out the way it came), `"continue"` (the edge keeps travelling, so the pattern passes through the frame — a wipe exits out the far side, a clock hand completes a second lap), or a custom pattern for asymmetric cover/uncover.

- **In-scene jumping** with `Control.label` and `Control.jump`. Until now the only way to redirect the story was `Scene.jumpTo`, which unloads the current scene and starts another. `Control.jump` moves the play head to a named point *inside the same scene* — nothing is unloaded or re-initialized, so backgrounds, sprites, and music stay exactly as they are.

  Mark a point with `Control.label(name)` (an invisible marker that just passes through at runtime) and jump to it with `Control.jump(name)`:

  ```ts
  scene.action([
      Control.label("start"),
      character.say("Where to?"),
      Menu.prompt("Choose")
          .choose("Look around", [
              character.say("Nothing here yet."),
              Control.jump("start"),   // back to the label, same scene
          ])
          .choose("Leave", [
              scene.jumpTo(nextScene),
          ]),
  ]);
  ```

  Label names are scoped to the scene they are declared in, so the same name can be reused across different scenes, and a jump can only target a label in its own scene. Both are validated at story-construction time: declaring the same label name twice in one scene, or jumping to a label that does not exist, fails the build rather than surfacing mid-play. Jumps are captured by save/load and undo like any other action.

  `Control.jump` redirects the main story flow, so place it as the last action of a branch (e.g. a menu choice); for looping a scene, drive the loop through a menu or condition rather than jumping out of a `repeat`/`while` body. Both `label` and `jump` are available as chainable methods and as static `Control.label(...)` / `Control.jump(...)`.

- **Text events** fire an effect *inside* a line, at the moment the typewriter reveals it. Until now a portrait could only change between lines, so a mid-sentence expression change meant splitting the sentence in two. A `TextEvent` sits in a sentence's word stream the way `Pause` does — it renders nothing, and fires when the reveal reaches it:

  ```ts
  import {TextEvent} from "narraleaf-react";

  scene.action([
      alice.say([
          "I told you ",
          TextEvent.expression(aliceImage, ["angry"]),   // the portrait flips right here
          "not to touch it.",
      ]),
      alice.say([
          "...",
          TextEvent.sound(sting),                        // a sting, no portrait change
          " what was that?",
      ]),
  ]);
  ```

  `TextEvent.expression(image, appearance, {sound?})` switches `image` to `appearance` with no transition — the same forms `Image.char` accepts: a tag list (`["angry"]`), or a static `src`/`Color`. As with `char`, a bare string is read as a `src`, so a tag switch must be written as an array. `TextEvent.sound(sound)` is the sound-effect-only form, and `expression(..., {sound})` does both at the same point. The effect set is deliberately closed: a text event is not a general action escape hatch, and nothing it does is pushed onto the execution stack.

  That restriction is what keeps the semantics predictable:

  - **Skipping never drops an effect.** Skipping the typewriter — or an instant reveal that uncovers the whole sentence at once — fires every token it flies past, once each, in source order. The image ends in the appearance the *last* crossed token asked for, and every crossed sound effect plays once, so a skipped line lands in exactly the state it would have reached at typing speed.
  - **A token fires once per reveal.** Re-visiting an already-fired token within the same reveal is a no-op: no double-played sound effect, no re-written expression.
  - **Nothing is added to saves.** The effect rides on ordinary element state, which is already serialized, so text events need no save format of their own — and a `say` re-evaluated on load re-fires them naturally, which is what makes them replay-safe.

  `TextEvent` is exported from `narraleaf-react`, along with the `TextEventAppearance`, `TextEventConfig`, and `TextEventExpression` types.

- `liveGame.fastForward()` can now run to a **specific action** instead of only to the next menu or the end of the story. Pass `{until: {actionId}}` — the id the story compiler assigned to that action — and playback advances until that action surfaces as the next thing to execute, stopping *just before* it runs, so the play head is left parked on that line. This is what a "play from here" jump in an external editor is built on.

  ```ts
  const result = await game.getLiveGame().fastForward({until: {actionId: "act-42"}});

  if (result.reason === "action") {
      // parked on act-42, not yet executed
  } else if (result.reachedTarget === false) {
      // a menu blocked the path, the stack drained, or maxSteps was hit
  }
  ```

  The result gains `"action"` as a stop reason and — only when an `actionId` target was requested — a `reachedTarget` flag, so an unreachable or already-passed id is distinguishable from a successful jump. A menu that blocks the path stops the run just as it does for `until: "menu"`, since the target cannot be reached until the player decides. Only the root execution stack is scanned: an id buried inside an in-flight `Control.all`/`any` or async branch is not a stop point. The `"menu"` and `"end"` forms are unchanged.

- **Experimental read-only introspection** for external tooling that has to follow a running game — an editor play head, a call-stack view. Nothing here mutates runtime state, and everything here is explicitly experimental: the shapes are a convenience projection, not a stability contract, so do not serialize them or drive game logic from them.

  ```ts
  const liveGame = game.getLiveGame();

  // push: fires as each action begins executing
  const token = liveGame.onCurrentActionChange(({actionId, actionType}) => {
      highlightRow(actionId);   // actionType is e.g. "character:say"
  });
  token.cancel();

  // pull: the most recently executed action, or null before the first one runs
  liveGame.getCurrentActionId();

  // the current call stack, top-first
  const {root, async} = liveGame.getStackSnapshot();
  ```

  `onCurrentActionChange(fc)` subscribes to the new `event:action.current` event and returns a cancellable token. It fires for *every* executed action, including those inside parallel and async branches, so a subscriber that only tracks top-level lines should filter by its own id set; `getCurrentActionId()` is the pull-based companion. `getStackSnapshot()` returns the root execution stack plus any in-flight async stacks (`Control.doAsync` / `Control.allAsync`), each a `StackSnapshot` whose `frames` are ordered top-first — a concurrent frame (`Control.all`/`any`) also lists its branches, and a loop frame carries its counter. It returns empty frames before the game starts. Saves still go through `serialize()`; a snapshot is not a save format. `StackSnapshot` and `StackFrameSnapshot` are exported from `narraleaf-react`.

### _Incompatible Changes_

- The per-shape transition classes and static factories were removed in favour of the engine + `Mask` vocabulary above:
  - `new SoftWipe({duration, direction, feather})` → `new Reveal({duration, pattern: Mask.wipe({direction, feather})})`
  - `new SoftIris({duration, center, feather})` → `new Reveal({duration, pattern: Mask.iris({center, feather})})`
  - `new Blinds({duration, orientation, slats})` → `new Reveal({duration, pattern: Mask.blinds({orientation, slats})})`
  - `MaskTransition.circle({duration, center})` → `new Reveal({duration, pattern: Mask.iris({center, feather: 0})})` (hard edges are `feather: 0`; the clip-path mechanism is gone, and `circle`'s partial `from`/`to` radii have no built-in equivalent — write a one-line custom pattern if needed)
  - `MaskTransition.wipe({duration, direction})` → `new Reveal({duration, pattern: Mask.wipe({direction, feather: 0})})`
  - `ThroughColor.fade({...})` → `new ThroughColor({...})`; `ThroughColor.wipe/.blinds` → `new ThroughColor({..., pattern: Mask.wipe(...)/Mask.blinds(...)})`; `ThroughColor.iris({center, feather, ...})` → `new ThroughColor({..., pattern: Mask.iris({center, feather}), inverted: true})` — note the `inverted: true`: the old factory closed rim-in, which is the pattern's inverted orientation.
  - Removed option types: `SoftWipeOptions`, `SoftIrisOptions`, `BlindsOptions`, `MaskTransitionCircleOptions`, `MaskTransitionWipeOptions`, and the per-factory `ThroughColor*Options` (now a single `ThroughColorOptions`).
- The remaining positional constructors moved to options objects: `new Dissolve(duration, easing?)` → `new Dissolve({duration, easing?})`, and `new FadeIn(duration, startPos?, easing?)` → `new FadeIn({duration, offset?, easing?})` (the start position parameter is now named `offset`).

### Fixed

- `Control.do([])` and `Control.doAsync([])` no longer crash on an empty action list. An empty `do` body threw twice — once during preload prediction and once on execution — and an empty `doAsync` body threw on execution; all three now advance past the empty statement. (`any`, `all`, and `allAsync` already handled empty lists.)

- `Control.repeat(times, actions)` and `Control.whileLoop(condition, actions)` no longer throw `Invalid action chain` when the loop body has more than one statement. The body was chained at authoring time while the loop runtime requires it unchained, so every multi-statement `repeat`/`while` body failed at runtime — only single-statement bodies worked. Loop bodies are now left unchained and run as intended.

## [0.15.0]

### _Feature_

- The video element gained `pause()`, `resume()`, `stop()`, and `seek()`, so a video can now be driven by hand instead of only played start-to-finish. Until now only `show()`, `hide()`, and `play()` were reachable from a story, even though the underlying playback controls were already wired end to end — the actions and their exposed handlers existed, but no chainable method reached them. All four are chainable like the rest:

  ```ts
  const video = new Video({ src: "/intro.webm", muted: true });

  scene.action([
      video.show(),
      video.play(),   // plays and waits for the clip to finish
  ]);

  // ...or drive it manually:
  scene.action([
      video.seek(5),     // jump to 5s
      video.pause(),
      video.resume(),    // resume without waiting for the end
      video.stop(),      // end playback now
  ]);
  ```

  `play()` still waits for the video to reach its end; `resume()` returns as soon as playback restarts. `stop()` ends a `play()` that is currently waiting, so cutting a video short lets the story continue instead of blocking on the clip's natural end.

### Fixed

- A video whose source fails to load no longer freezes the game. A video's playback controls are exposed to the story only once its element reports it can play; a source that 404s or uses an unsupported codec fires an error instead of that ready signal, and the error was ignored — so every action on the video, `show()` included, waited on a ready state that never arrived, and with `allowSkipVideo` off (the default) nothing could recover it. A load error is now reported through the logger and the controls are exposed in a degraded state: `show()`/`hide()` still work and `play()` resolves immediately, so a broken asset simply does not appear and the story keeps advancing.

- A video that is hidden, replaced by a scene change, or otherwise unmounted while it is still playing no longer wedges the story. `play()` resolves when the clip ends or is stopped, but unmounting the element removed those listeners without ever resolving, leaving the awaiting `play()` pending forever. Unmounting now settles any in-flight `play()`.

- A video whose media was ready before its element finished mounting — a cached, `blob:`, or `data:` source that had already fired its ready event — no longer risks the same never-exposed hang: the element reconciles against the current ready/error state on mount rather than waiting only for a future event. Relatedly, `resume()` no longer hangs or leaves an unhandled rejection when the browser blocks playback.

## [0.14.0]

### _Feature_

- The backlog now survives saving and loading, and any past line in it can be restored to — including after a save is loaded. Until now the history NarraLeaf keeps (the one behind the backlog and behind `liveGame.undo`) was accumulated only while the game ran and discarded when a save was loaded, so a freshly loaded game — or a game reached by jumping into it — began with an empty backlog and nothing to go back to. Saves now carry the full backlog, and every backlog line also stores a self-contained snapshot of the game at that point. As a result `getHistory()` is populated the moment `deserialize` returns, and a new method restores the game to any line in it:

  ```typescript
  const history = game.getHistory();
  // Jump the game back to a past line, even one from a loaded save.
  game.getLiveGame().restoreToHistory(history[0].token);
  ```

  `restoreToHistory(token)` does not rely on the in-memory undo history that `undo` walks (which is made of closures over live objects and cannot be serialized), so it is what works across a save/load boundary. `undo` is unchanged and remains the nicer choice for stepping back during live play; `restoreToHistory` returns `false` if the line has no restore snapshot.

  The save format is now versioned — `meta.version` is `2` for saves written by this release. Saves written before it load unchanged and simply start with an empty backlog, and `SavedGame.game` gains an optional `history` field (see [SavedGame](https://narraleaf.com/docs/narraleaf-react/core/types/SavedGame)). Because each remembered line carries a snapshot, saves are larger, roughly in proportion to how far back the backlog reaches — bounded by `maxActionHistory`.

- `liveGame.fastForward()` jumps ahead to the next menu, running every line in between for real so the backlog fills in along the way. Audio is muted, transitions settle at once, and timed pauses (`Control.sleep`, auto-forward) resolve immediately, so it reaches the next decision point quickly without omitting anything — the accumulated history is identical to having played through, which is why `restoreToHistory` then works across the fast-forwarded span. It stops *at* the menu, leaving the choice to the player; pass `{ until: "end" }` to run to the end of the story instead. It is async and returns why it stopped (`"menu"`, `"end"`, or `"maxSteps"`).

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
