import {domAnimation, LazyMotion} from "framer-motion";
import React from "react";

export default function Motion({children}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <LazyMotion features={domAnimation} strict>
            {children}
        </LazyMotion>
    );
}