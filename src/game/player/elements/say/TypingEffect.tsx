import React, {useEffect, useState} from "react";

interface TypingEffectProps {
    text: string;
    color: string;
    speed: number;
    onComplete?: () => void;
    className?: string;
}

const TypingEffect: React.FC<TypingEffectProps> = (
    {text, speed, onComplete, className, color}
) => {
    const [displayedText, setDisplayedText] = useState("");
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (currentIndex < text.length) {
            if (text[currentIndex] === " ") {
                setDisplayedText((prev) => prev.concat(text[currentIndex]));
                setCurrentIndex((prev) => prev + 1);
            } else {
                const timeoutId = setTimeout(() => {
                    setDisplayedText((prev) => prev.concat(text[currentIndex]));
                    setCurrentIndex((prev) => prev + 1);
                }, speed);
                return () => clearTimeout(timeoutId);
            }
        } else if (onComplete) {
            onComplete();
        }
    }, [currentIndex]);

    return <span style={{
        color
    }} className={className}><Lines text={displayedText}/></span>;
};

export function Lines({text}: { text: string }) {
    return (<>{text.split("\n").map((line, index) => (
        <React.Fragment key={index}>
            {line}
            <br/>
        </React.Fragment>
    ))}</>);
}

export default TypingEffect;