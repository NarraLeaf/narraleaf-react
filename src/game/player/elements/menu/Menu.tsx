import {Choice} from "@core/elements/menu";
import {Sentence} from "@core/elements/text";
import ColoredSentence from "./Sentence";
import Say from "@player/elements/say/Say";
import Isolated from "@player/lib/isolated";

export default function Menu({
                                 prompt,
                                 choices,
                                 afterChoose,
                             }: Readonly<{
    prompt: Sentence;
    choices: Choice[];
    afterChoose: (choice: Choice) => void;
}>) {
    function choose(choice: Choice) {
        afterChoose(choice);
    }

    return (
        <>
            <Isolated className={"absolute"}>
                <div className="absolute flex flex-col items-center justify-center min-w-full w-full h-full">
                    {prompt && <Say action={{sentence: prompt}} useTypeEffect={false} className="z-10"/>}
                </div>
            </Isolated>
            <Isolated className={"absolute"}>
                <div className="absolute flex flex-col items-center justify-center min-w-full w-full h-full">
                    <div className="p-4 rounded-lg w-full z-20">
                        <div className="flex flex-col items-center mt-4 w-full">
                            {choices.map((choice, i) => (
                                <button key={i}
                                        className="bg-white text-black p-2 rounded-lg mt-2 shadow-md w-1/2 hover:bg-gray-100 active:bg-gray-200 transition-colors"
                                        onClick={() => choose(choice)}>
                                    <ColoredSentence key={i} sentence={choice.prompt}/>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Isolated>
        </>
    );
};