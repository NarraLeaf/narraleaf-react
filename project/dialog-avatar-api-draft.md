# Dialog Avatar API Draft

> Temporary documentation draft for building the official documentation page.
> This document describes the design model, recommended usage, examples, and TypeScript reference for dialog avatars.

## Coverage in react.narraleaf.com (done)

The documentation site has been updated from this draft plus [CHANGELOG](https://github.com/NarraLeaf/narraleaf-react/blob/master/CHANGELOG.md) **0.9.1**. Below is what was migrated (bilingual EN + ZH).

| Draft area | Doc site location |
|------------|-------------------|
| Purpose, mental model, resolution order, basic usage, binding portraits, expression resolvers, off-screen, per-line overrides, multiple portraits, default ADV layout & styles, custom dialogs | `pages/documentation/player/dialog.en-US.mdx`, `dialog.zh-CN.mdx` |
| `useAvatar()` usage and `DialogAvatarContext` | `pages/documentation/player/hooks/useAvatar.en-US.mdx`, `useAvatar.zh-CN.mdx` (also listed under Hooks nav) |
| `Avatar` component (props, default style) | Dialog pages + `useAvatar` pages |
| `Character`: `setAvatar`, `addPortrait`, `setPortraits` | `pages/documentation/core/elements/character.en-US.mdx`, `character.zh-CN.mdx` |
| `CharacterConfig` (`avatar`, `portraits`) | `pages/documentation/core/types/CharacterConfig.en-US.mdx`, `CharacterConfig.zh-CN.mdx` |
| `Sentence` / `SentenceConfig` / `SentenceUserConfig`: `avatar`, `metadata`, `pause`; `Sentence.getMetadata()` | `SentenceConfig` type pages, `sentence.en-US.mdx` / `sentence.zh-CN.mdx`, `SentenceUserConfig` cross-links |
| Core **exported** types: `DialogAvatar*`, `CharacterPortraitConfig`, `DialogAvatarResolution`, etc. | Dialog page “TypeScript reference”; type re-exports remain `narraleaf-react` public API |
| CHANGELOG **0.9.1** item `Sentence.getMetadata` | Sentence method `getMetadata` + `metadata` field on `SentenceConfig` |
| CHANGELOG **0.9.1** dialog avatar APIs | Covered by all of the above |

**Intentionally not duplicated as end-user import guides:** `resolveDialogAvatar` and `GameState.findCurrentPortraitForCharacter` are used inside the player (`Avatar.tsx`); they are **not** re-exported from the main `narraleaf-react` package entry. End-user behavior is documented via resolution order on the Dialog page and hook/component docs. Adjust this draft if these become public API.

## Purpose

Dialog avatars provide a small character portrait inside the ADV dialog box. The feature is designed for visual novel dialog where:

- the speaker may be on stage with a visible sprite;
- the speaker may be off-screen, speaking as voice-over;
- most lines should not need per-line avatar configuration;
- avatar behavior should stay separate from dialog rendering so custom dialog components remain simple.

The core rule is:

> A `Character` owns avatar intent. A stage `Image` can refine that avatar when it is the current visible portrait. A `Sentence` can override only exceptional lines.

This keeps the API understandable:

- configure the character once for common behavior;
- bind portraits when the current sprite should affect the avatar;
- override per line only for exceptions;
- render avatars through `<Avatar />` or `useAvatar()` in dialog UI.

## Mental Model

There are three layers:

1. **Character-level avatar**
   - Used when the character is speaking off-screen.
   - Used as fallback when no visible bound portrait is available.
   - Best for the common/default avatar.

2. **Portrait-level avatar**
   - Attached to a stage `Image` bound to a character.
   - Used only when that image is currently visible in the active scene.
   - Best for sprite-dependent avatars, such as expression-based avatars.

3. **Sentence-level avatar**
   - Per-line exception.
   - Can force a special avatar or hide the avatar for one line.
   - Should be used sparingly.

Resolution order:

1. Narrator or unnamed character: no avatar.
2. `sentence.config.avatar === false`: no avatar.
3. Sentence avatar override.
4. Avatar from the most recent visible bound portrait.
5. Character-level avatar.
6. No avatar.

The engine does **not** crop a full-body sprite automatically. If no avatar is configured, no avatar is shown.

## Basic Usage

Use a character-level avatar when the same portrait should appear for normal dialog and off-screen dialog.

```ts
import { Character } from "narraleaf-react";

const alice = new Character("Alice", {
    avatar: "/assets/alice/avatar-default.png",
});

alice.say("I can be off-screen and still show an avatar.");
```

Equivalent method style:

```ts
const alice = new Character("Alice")
    .setAvatar("/assets/alice/avatar-default.png");

alice.say("This line uses Alice's default avatar.");
```

## Binding Stage Portraits

Bind a stage `Image` when the visible sprite should influence the dialog avatar.

```ts
import { Character, Image } from "narraleaf-react";

const aliceBody = new Image({
    name: "alice-body",
    src: "/assets/alice/body-normal.png",
    opacity: 1,
});

const alice = new Character("Alice", {
    avatar: "/assets/alice/avatar-default.png",
    portraits: [
        {
            image: aliceBody,
            avatar: "/assets/alice/avatar-normal.png",
        },
    ],
});
```

When `aliceBody` is visible in the current scene, Alice uses `/assets/alice/avatar-normal.png`.
When `aliceBody` is not visible, Alice falls back to `/assets/alice/avatar-default.png`.

Method style:

```ts
const alice = new Character("Alice")
    .setAvatar("/assets/alice/avatar-default.png")
    .addPortrait(aliceBody, {
        avatar: "/assets/alice/avatar-normal.png",
    });
```

## Expression-Based Avatars

For tagged images, use a resolver. The resolver receives the current portrait, current image source, tags, character, sentence, and game state.

```ts
const aliceBody = new Image({
    name: "alice-body",
    src: {
        groups: [
            ["normal", "happy", "angry"],
            ["school", "casual"],
        ],
        defaults: ["normal", "school"],
        resolve: (emotion, outfit) => `/assets/alice/body-${emotion}-${outfit}.png`,
    },
    opacity: 1,
});

const alice = new Character("Alice", {
    avatar: "/assets/alice/avatar-default.png",
    portraits: [
        {
            image: aliceBody,
            avatar: ({ tags }) => {
                const emotion = tags?.[0] ?? "normal";
                return `/assets/alice/avatar-${emotion}.png`;
            },
        },
    ],
});

aliceBody.char(["happy"]);
alice.say("This line uses the happy avatar while Alice is visible.");
```

Resolvers may return:

- an image source string;
- `StaticImageData`;
- `null` to intentionally resolve to no avatar;
- `undefined` to let the next fallback layer continue.

Example fallback from portrait resolver to character avatar:

```ts
const alice = new Character("Alice", {
    avatar: "/assets/alice/avatar-default.png",
    portraits: [
        {
            image: aliceBody,
            avatar: ({ tags }) => {
                if (tags?.includes("happy")) {
                    return "/assets/alice/avatar-happy.png";
                }

                return undefined;
            },
        },
    ],
});
```

If Alice is visible and happy, the happy avatar is used. Otherwise, the character-level default is used.

## Off-Screen Voice-Over

Off-screen dialog is the main reason character-level avatar exists.

```ts
const alice = new Character("Alice", {
    avatar: "/assets/alice/avatar-default.png",
});

alice.say("I am speaking from outside the stage.");
```

No stage `Image` is required. The avatar comes directly from `character.config.avatar`.

Recommended pattern for a character who can be both on-screen and off-screen:

```ts
const alice = new Character("Alice", {
    avatar: "/assets/alice/avatar-default.png",
    portraits: [
        {
            image: aliceBody,
            avatar: ({ tags }) => `/assets/alice/avatar-${tags?.[0] ?? "normal"}.png`,
        },
    ],
});
```

Behavior:

```ts
alice.say("Off-screen: uses character default avatar.");

aliceBody.show();
aliceBody.char(["happy"]);
alice.say("On-screen: uses the visible portrait's happy avatar.");

aliceBody.hide();
alice.say("Off-screen again: falls back to character default avatar.");
```

## Per-Line Overrides

Hide avatar for one sentence:

```ts
alice.say("This line intentionally hides the avatar.", {
    avatar: false,
});
```

Use a special one-off avatar:

```ts
alice.say("This line uses a special cut-in avatar.", {
    avatar: "/assets/alice/avatar-special.png",
});
```

Use a resolver for one line:

```ts
alice.say("This line chooses an avatar at runtime.", {
    avatar: ({ tags, currentSrc }) => {
        if (tags?.includes("angry")) {
            return "/assets/alice/avatar-angry-close.png";
        }

        if (currentSrc?.includes("casual")) {
            return "/assets/alice/avatar-casual.png";
        }

        return undefined;
    },
});
```

Per-line overrides have the highest priority, except `avatar: false`, which hides the avatar immediately.

## Multiple Visible Portraits

If a character has multiple bound portraits visible at the same time, the engine picks the most recent visible one in the current scene.

Conceptually:

```ts
const alice = new Character("Alice", {
    avatar: "/assets/alice/avatar-default.png",
    portraits: [
        { image: aliceLeft, avatar: "/assets/alice/avatar-left.png" },
        { image: aliceRight, avatar: "/assets/alice/avatar-right.png" },
    ],
});
```

If both `aliceLeft` and `aliceRight` are visible, the engine walks the current scene's layers and displayable list from back to front and picks the first visible bound portrait.

Visibility means:

```ts
displayable.transformState.get().opacity > 0
```

An image with `opacity <= 0` is ignored as an avatar portrait source.

## Default Dialog Rendering

The default ADV dialog renders avatars automatically:

```tsx
<Dialog>
    <div className="dialog-content">
        <Avatar />
        <div className="dialog-text-content">
            <Nametag />
            <Texts />
        </div>
    </div>
</Dialog>
```

`<Avatar />` renders nothing when no avatar is resolved, so it does not reserve space in no-avatar lines.

Default avatar style:

- `width: 96`
- `height: 96`
- `objectFit: "cover"`
- `borderRadius: 6`
- `flex: "0 0 auto"`

Users can override these with normal image props:

```tsx
<Avatar
    className="my-avatar"
    style={{
        width: 120,
        height: 120,
        borderRadius: 8,
    }}
/>
```

## Custom Dialog Components

Use `<Avatar />` for simple custom dialogs.

```tsx
import { Dialog, Avatar, Nametag, Texts } from "narraleaf-react";

function CustomDialog() {
    return (
        <Dialog
            style={{
                padding: 24,
                background: "rgba(255,255,255,0.9)",
            }}
        >
            <div style={{ display: "flex", gap: 16 }}>
                <Avatar style={{ width: 112, height: 112 }} />
                <div>
                    <Nametag />
                    <Texts />
                </div>
            </div>
        </Dialog>
    );
}
```

Use `useAvatar()` when layout depends on whether an avatar exists.

```tsx
import { Dialog, Avatar, Nametag, Texts, useAvatar } from "narraleaf-react";

function CustomDialog() {
    const avatar = useAvatar();

    return (
        <Dialog>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: avatar.visible ? "120px 1fr" : "1fr",
                    gap: 16,
                }}
            >
                {avatar.visible && <Avatar style={{ width: 120, height: 120 }} />}
                <div>
                    <Nametag />
                    <Texts />
                </div>
            </div>
        </Dialog>
    );
}
```

`useAvatar()` returns metadata as well:

```tsx
const avatar = useAvatar();

if (avatar.visible) {
    console.log(avatar.src);
    console.log(avatar.character?.state.name);
    console.log(avatar.portrait?.config.name);
}
```

## Complete Example

```ts
import {
    Game,
    Story,
    Scene,
    Character,
    Image,
    Transform,
    Dialog,
    Avatar,
    Nametag,
    Texts,
    useAvatar,
} from "narraleaf-react";

const aliceBody = new Image({
    name: "alice-body",
    src: {
        groups: [
            ["normal", "happy", "angry"],
            ["school", "casual"],
        ],
        defaults: ["normal", "school"],
        resolve: (emotion, outfit) => `/assets/alice/body-${emotion}-${outfit}.png`,
    },
    opacity: 1,
});

const bobBody = new Image({
    name: "bob-body",
    src: "/assets/bob/body.png",
    opacity: 1,
});

const alice = new Character("Alice", {
    avatar: "/assets/alice/avatar-default.png",
    portraits: [
        {
            image: aliceBody,
            avatar: ({ tags }) => {
                const emotion = tags?.[0] ?? "normal";
                return `/assets/alice/avatar-${emotion}.png`;
            },
        },
    ],
});

const bob = new Character("Bob")
    .setAvatar("/assets/bob/avatar.png")
    .addPortrait(bobBody);

function CustomDialog() {
    const avatar = useAvatar();

    return (
        <Dialog
            style={{
                padding: 24,
                background: "rgba(255,255,255,0.9)",
            }}
        >
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: avatar.visible ? "120px 1fr" : "1fr",
                    gap: 16,
                }}
            >
                {avatar.visible && (
                    <Avatar
                        style={{
                            width: 120,
                            height: 120,
                            borderRadius: 8,
                        }}
                    />
                )}
                <div>
                    <Nametag />
                    <Texts />
                </div>
            </div>
        </Dialog>
    );
}

const scene = new Scene("start");

scene.action([
    alice.say("Off-screen Alice uses the character-level avatar."),

    aliceBody.show(Transform.immediate({ opacity: 1 })),
    alice.say("On-screen Alice uses the portrait-level normal avatar."),

    aliceBody.char(["happy"]),
    alice.say("Now Alice uses the happy avatar."),

    alice.say("This line hides the avatar.", {
        avatar: false,
    }),

    alice.say("This line uses a special one-off avatar.", {
        avatar: "/assets/alice/avatar-special.png",
    }),

    bobBody.show(Transform.immediate({ opacity: 1 })),
    bob.say("Bob uses his character-level avatar because his portrait has no override."),
]);

const story = new Story({
    entry: scene,
});

const game = new Game({
    dialog: CustomDialog,
});
```

## Design Notes

### Why `Character` Owns Avatar Intent

Dialog is spoken by a `Character`, not by an `Image`. A character can speak when no sprite is visible, and that is common in visual novels. Therefore, the default avatar belongs on `Character`.

### Why Portraits Are Bound to Characters

The engine cannot infer that an arbitrary `Image` belongs to a character. `character.addPortrait(image)` makes that relationship explicit while keeping `Image` independent.

### Why No Automatic Sprite Cropping

Automatic cropping from a full-body sprite is visually unreliable. Different assets have different head positions, transparent padding, poses, and canvas sizes. The default is therefore conservative: no configured avatar means no avatar.

### Why Sentence Overrides Exist

Most lines should be automatic. Sentence-level avatar exists for exceptions:

- hide a character avatar for a special line;
- show a cut-in avatar;
- use an emotional close-up not tied to the current sprite.

### Why `<Avatar />` and `useAvatar()` Both Exist

`<Avatar />` keeps simple custom dialogs simple. `useAvatar()` supports advanced layouts that need to react to avatar visibility, source, character, or portrait metadata.

## Reference

### Core Types

```ts
export type DialogAvatarSource = ImageSrc | null;
```

```ts
export type DialogAvatarResolverContext = {
    character: Character;
    sentence: Sentence | null;
    portrait: Image | null;
    currentSrc: string | null;
    tags: string[] | null;
    gameState: GameState;
};
```

```ts
export type DialogAvatarResolver = (
    ctx: DialogAvatarResolverContext
) => DialogAvatarSource | undefined;
```

```ts
export type DialogAvatar = DialogAvatarSource | DialogAvatarResolver;
```

```ts
export type CharacterPortraitConfig = {
    image: Image;
    avatar?: DialogAvatar;
};
```

```ts
export type DialogAvatarResolution = {
    source: DialogAvatarSource;
    character: Character | null;
    portrait: Image | null;
};
```

### Character Config

```ts
export type CharacterConfig = {
    color?: Color;
    avatar?: DialogAvatar | false;
    portraits: (Image | CharacterPortraitConfig)[];
};
```

### Character Constructor

```ts
constructor(
    name: string | null,
    config?: DeepPartial<CharacterConfig>
);
```

### Character Methods

```ts
public setAvatar(
    avatar: DialogAvatar | false | null
): this;
```

```ts
public addPortrait(
    image: Image,
    config?: { avatar?: DialogAvatar }
): this;
```

```ts
public setPortraits(
    portraits: (Image | CharacterPortraitConfig)[]
): this;
```

Existing `say` overloads with avatar support through `SentenceUserConfig`:

```ts
public say(
    content: string,
    config?: SentenceUserConfig
): Proxied<Character, Chained<LogicAction.Actions>>;
```

```ts
public say(
    content: Sentence
): Proxied<Character, Chained<LogicAction.Actions>>;
```

```ts
public say(
    content: SentencePrompt,
    config?: SentenceUserConfig
): Proxied<Character, Chained<LogicAction.Actions>>;
```

```ts
public say(
    texts: TemplateStringsArray,
    ...words: SingleWord[]
): Proxied<Character, Chained<LogicAction.Actions>>;
```

### Sentence Config

```ts
export type SentenceConfig = {
    pause?: boolean | number;
    voice: Sound | null;
    character: Character | null;
    voiceId: string | number | null;
    color?: Color;
    metadata?: SentenceMetadata;
    avatar?: DialogAvatar | false;
} & Font;
```

User-facing config:

```ts
export type SentenceUserConfig = Partial<
    Omit<SentenceConfig, "voice"> & {
        voice: Sound | string | null | undefined;
    }
>;
```

### Avatar Resolver Function

```ts
export function resolveDialogAvatar(
    ctx: DialogAvatarResolverContext & {
        sentenceAvatar?: DialogAvatar | false;
        portraitAvatar?: DialogAvatar;
        characterAvatar?: DialogAvatar | false;
    }
): DialogAvatarResolution;
```

### GameState Query

```ts
public findCurrentPortraitForCharacter(
    character: Character
): NormalizedCharacterPortraitConfig | null;
```

Normalized portrait config:

```ts
export type NormalizedCharacterPortraitConfig = {
    image: Image;
    avatar?: DialogAvatar;
};
```

### React Hook

```ts
export type DialogAvatarContext = {
    visible: boolean;
    src: string | null;
    character: Character | null;
    portrait: Image | null;
    alt: string;
};
```

```ts
export function useAvatar(): DialogAvatarContext;
```

### React Component

```ts
export function Avatar(
    props: React.ImgHTMLAttributes<HTMLImageElement>
): React.ReactNode;
```

Default export:

```ts
export default Avatar;
```

### Public Exports

From player elements:

```ts
export {
    Avatar,
    useAvatar,
};

export type {
    DialogAvatarContext,
};
```

From core elements:

```ts
export type {
    CharacterPortraitConfig,
    DialogAvatar,
    DialogAvatarResolver,
    DialogAvatarResolverContext,
    DialogAvatarResolution,
    DialogAvatarSource,
};
```

