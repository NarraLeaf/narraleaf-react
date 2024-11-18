import {Character} from "../elements/character";
import {Condition, Lambda} from "../elements/condition";
import {Control} from "@core/elements/control";
import {Image as ImageClass, RichImageConfig, TagDefinition} from "../elements/image";
import {Menu} from "../elements/menu";
import {Scene} from "../elements/scene";
import {Script} from "../elements/script";
import {Sound, SoundType} from "@core/elements/sound";
import {Story} from "../elements/story";
import {Transform} from "@core/elements/transform/transform";
import {Sentence} from "@core/elements/character/sentence";
import {Word} from "@core/elements/character/word";
import {Text} from "@core/elements/text";
import {Pause} from "@core/elements/character/pause";

interface ImageConstructor {
    new<T extends TagDefinition>(
        config: Partial<RichImageConfig<T>>,
        tagDefinitions: T
    ): ImageClass<T>;
}

const Image: ImageConstructor = function <T extends TagDefinition>(
    this: ImageClass<T>,
    config: Partial<RichImageConfig<T>>,
    tagDefinitions: T
): ImageClass<T> {
    if (!new.target) {
        throw new Error("Image is a constructor and should be called with new keyword");
    }
    return Reflect.construct(ImageClass, [config, tagDefinitions]);
} as unknown as ImageConstructor;

export {
    Character,
    Condition,
    Control,
    Image,
    Lambda,
    Menu,
    Scene,
    Script,
    Sentence,
    Sound,
    SoundType,
    Story,
    Transform,
    Word,
    Text,
    Pause
};