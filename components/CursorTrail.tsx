"use client";

import { useEffect, useState } from "react";

type TrailParticle = {
  id: number;
  x: number;
  y: number;
};

type CursorTrailProps = {
  enabled: boolean;
  imageSrc: string;
};

export function CursorTrail({ enabled, imageSrc }: CursorTrailProps) {
  const [particles, setParticles] = useState<TrailParticle[]>([]);

  useEffect(() => {
    if (!enabled) {
      setParticles([]);
      return;
    }

    let particleId = 0;
    let lastCreatedTime = 0;

    function handleMouseMove(event: MouseEvent) {
      const now = Date.now();

      // smaller number = more trail images
      if (now - lastCreatedTime < 35) {
        return;
      }

      lastCreatedTime = now;
      particleId += 1;

      const newParticle: TrailParticle = {
        id: particleId,
        x: event.clientX,
        y: event.clientY,
      };

      setParticles((currentParticles) => [
        ...currentParticles.slice(-18),
        newParticle,
      ]);

      setTimeout(() => {
        setParticles((currentParticles) =>
          currentParticles.filter((particle) => particle.id !== newParticle.id)
        );
      }, 650);
    }

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      {particles.map((particle) => (
        <img
          key={particle.id}
          src={imageSrc}
          alt=""
          className="cursor-trail-image pointer-events-none fixed select-none"
          style={{
            left: `${particle.x}px`,
            top: `${particle.y}px`,
          }}
          draggable={false}
        />
      ))}
    </div>
  );
}