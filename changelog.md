# Changelog

## [0.0.4] - 2024/10/01

### Fixed

- `liveGame.newGame` does not reset the game state
- deserializing does not trigger repainting
- Some methods in `Control` are working incorrectly
- Some image components cannot update correctly

### Changed

- `scene.backgroundImageState` is deprecated, use `scene.backgroundImage` instead
- Now applying of transformations and transitions are separated, you can now apply both at the same time

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
