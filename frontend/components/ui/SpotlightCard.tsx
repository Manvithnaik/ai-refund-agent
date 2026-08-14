"use client";

import React, { useRef, useState } from "react";

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    spotlightColor?: string;
    borderColor?: string;
}

export function SpotlightCard({
    children,
    className = "",
    spotlightColor = "rgba(168, 85, 247, 0.14)", // Punchy purple / violet radial glow
    borderColor = "rgba(168, 85, 247, 0.4)",
    ...props
}: SpotlightCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [opacity, setOpacity] = useState(0);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!cardRef.current) return;

        const rect = cardRef.current.getBoundingClientRect();
        setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    const handleMouseEnter = () => {
        setOpacity(1);
    };

    const handleMouseLeave = () => {
        setOpacity(0);
    };

    return (
        <div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={`relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition-all duration-300 hover:shadow-md ${className}`}
            {...props}
        >
            {/* Dynamic Cursor Spotlight Radial Glow */}
            <div
                className="pointer-events-none absolute -inset-px transition-opacity duration-300 z-0"
                style={{
                    opacity,
                    background: `radial-gradient(500px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 60%)`,
                }}
            />

            {/* Content wrapper */}
            <div className="relative z-10">{children}</div>
        </div>
    );
}
