import { useEffect, useRef, type Ref } from "react";
import badge480 from "@/assets/badge-480.webp";
import badge960 from "@/assets/badge-960.webp";
import shadow from "@/assets/shadow.webp";

// The BUILT badge in the hero. Layers, outside in: the outer wrapper takes the page's scroll
// parallax (written by the route through `ref`), the float wrapper bobs, the tilt wrapper leans
// toward a mouse pointer, the lean wrapper turns the coin a few degrees on its own. Every move is
// a transform, so the compositor runs it without touching layout or paint.
export function HeroBadge({ ref }: { ref?: Ref<HTMLDivElement> }) {
  const tilt = useRef<HTMLDivElement>(null);
  // The bob and the lean only run while the badge is on screen.
  useEffect(() => {
    const el = tilt.current?.closest(".hero-badge");
    if (!el) return;
    const io = new IntersectionObserver(([entry]) =>
      el.classList.toggle("is-paused", !entry.isIntersecting),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const el = tilt.current;
    const area = el?.closest("section");
    if (
      !el ||
      !area ||
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    let frame = 0,
      x = 0,
      y = 0,
      cx = 0,
      cy = 0,
      reach = 1,
      stale = true;
    const write = () => {
      frame = 0;
      if (stale) {
        const box = el.getBoundingClientRect();
        cx = box.left + box.width / 2;
        cy = box.top + box.height / 2;
        reach = Math.max(box.width, 240) * 1.3;
        stale = false;
      }
      const dx = Math.max(-1, Math.min(1, (x - cx) / reach));
      const dy = Math.max(-1, Math.min(1, (y - cy) / reach));
      el.style.transform = `rotateX(${(-dy * 8).toFixed(2)}deg) rotateY(${(dx * 12).toFixed(2)}deg)`;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      x = e.clientX;
      y = e.clientY;
      el.classList.add("is-tilting");
      if (!frame) frame = requestAnimationFrame(write);
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      el.classList.remove("is-tilting");
      el.style.transform = "";
    };
    const restale = () => {
      stale = true;
    };
    area.addEventListener("pointermove", move, { passive: true });
    area.addEventListener("pointerleave", leave);
    window.addEventListener("scroll", restale, { passive: true });
    window.addEventListener("resize", restale);
    return () => {
      cancelAnimationFrame(frame);
      area.removeEventListener("pointermove", move);
      area.removeEventListener("pointerleave", leave);
      window.removeEventListener("scroll", restale);
      window.removeEventListener("resize", restale);
    };
  }, []);
  return (
    <div className="hero-badge" ref={ref}>
      <div className="hero-badge-float">
        <div className="hero-badge-tilt" ref={tilt}>
          <div className="hero-badge-lean">
            <img
              className="hero-badge-coin"
              src={badge960}
              srcSet={`${badge480} 480w, ${badge960} 960w`}
              sizes="(max-width: 760px) 62vw, 440px"
              width={960}
              height={960}
              alt="BUILT logo"
              fetchPriority="high"
              draggable={false}
            />
          </div>
        </div>
      </div>
      <img
        className="hero-badge-shadow"
        src={shadow}
        width={480}
        height={96}
        alt=""
        aria-hidden="true"
        decoding="async"
      />
    </div>
  );
}
