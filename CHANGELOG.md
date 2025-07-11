# Changelog

## [0.7.0]

### _Feature_

- `LayoutRouter` creates a new way to manage complex page structures and transitions
- Use `Layout` to create a layout group
- Use Player prop `onError` to handle errors
- `game.keyMap` allows you to manage key bindings and announce key changes across the player

### _Incompatible Changes_

- `Router` is deprecated, use `LayoutRouter` as a more powerful router
- `Page` is refactored
- `game.config.skipKey` and `game.config.nextKey` are deprecated, use `game.keyMap` instead

## [0.6.0]

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

## [0.5.0]

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
