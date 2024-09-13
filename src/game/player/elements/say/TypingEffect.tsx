import React, {useEffect, useState} from "react";

interface TypingEffectProps {
    text: string;
    speed: number;
    onComplete?: () => void;
    className?: string;
}

const TypingEffect: React.FC<TypingEffectProps> = ({text, speed, onComplete, className}) => {
    const [displayedText, setDisplayedText] = useState("");
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (currentIndex < text.length) {
            if (text[currentIndex] === " ") {
                setDisplayedText((prev) => prev + " ");
                setCurrentIndex((prev) => prev + 1);
            } else {
                const timeoutId = setTimeout(() => {
                    setDisplayedText((prev) => prev + text[currentIndex]);
                    setCurrentIndex((prev) => prev + 1);
                }, speed);
                return () => clearTimeout(timeoutId);
            }
        } else if (onComplete) {
            onComplete();
        }
    }, [currentIndex, text, speed, onComplete]);

    return <span className={className}>{displayedText}</span>;
};

export default TypingEffect;