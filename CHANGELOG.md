# Changelog

## [0.1.4]

### Fixed

- Throw error when deserializing a game state with image state

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
- Refactor `Image.tsx`, `BackgroundTransition.tsx` and `Text.tsx`.
- Use `IImageTransition` instead of `ITransition`

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
