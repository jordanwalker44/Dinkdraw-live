'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// Preserve the TV layout while fitting it into desktop or phone-sized previews.
export function DemoTvFrame({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const resize = () => setScale(element.clientWidth / 1600);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={frame} style={{ width: '100%', aspectRatio: '16 / 9', position: 'relative', overflow: 'hidden', borderRadius: 16 }}>
    <div style={{ position: 'absolute', top: 0, left: 0, width: 1600, height: 900, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
  </div>;
}
