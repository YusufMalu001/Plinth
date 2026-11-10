import React from "react"

export function GradientBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        height: "100%",
        containerType: "size",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "#004a80",
          backgroundImage:
            `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.280'/></svg>"), 
            radial-gradient(circle at 66.94% 46.43%, rgba(23, 55, 150, 1) 0%, rgba(23, 55, 150, 0.844) 19.02%, rgba(23, 55, 150, 0.5) 38.05%, rgba(23, 55, 150, 0.156) 57.07%, rgba(23, 55, 150, 0) 76.1%), 
            radial-gradient(circle at 34.69% 66.31%, rgba(104, 139, 230, 1) 0%, rgba(104, 139, 230, 0.844) 12.73%, rgba(104, 139, 230, 0.5) 25.45%, rgba(104, 139, 230, 0.156) 38.18%, rgba(104, 139, 230, 0) 50.9%), 
            radial-gradient(circle at 48.93% 19.32%, rgba(15, 37, 105, 1) 0%, rgba(15, 37, 105, 0.844) 16.75%, rgba(15, 37, 105, 0.5) 33.5%, rgba(15, 37, 105, 0.156) 50.25%, rgba(15, 37, 105, 0) 67%), 
            radial-gradient(circle at 80.23% 87.54%, rgba(23, 55, 150, 1) 0%, rgba(23, 55, 150, 0.844) 10.28%, rgba(23, 55, 150, 0.5) 20.55%, rgba(23, 55, 150, 0.156) 30.83%, rgba(23, 55, 150, 0) 41.1%)`,
          backgroundSize: "120px 120px, auto, auto, auto, auto",
          backgroundBlendMode: "overlay, normal, normal, normal, normal",
        }}
      />
      <svg
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.280,
          mixBlendMode: "overlay",
        }}
      >
        <filter id="grain-3ec497dd">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-3ec497dd)" />
      </svg>
    </div>
  )
}
