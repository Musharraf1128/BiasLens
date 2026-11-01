import type { CSSProperties } from "react";
import Image from "next/image";

import type { TopNewsFeed } from "@/lib/top-news-schema";

type Story = TopNewsFeed["stories"][number];
type Theme = "rally" | "election" | "education" | "institution";

const themes: Record<Theme, {
  label: string;
  number: string;
  background: string;
  ink: string;
  accent: string;
  secondary: string;
}> = {
  rally: {
    label: "Public movement",
    number: "01",
    background: "#123d3b",
    ink: "#f3efe4",
    accent: "#e4a53a",
    secondary: "#72c1b1",
  },
  election: {
    label: "Democratic process",
    number: "02",
    background: "#24394b",
    ink: "#f3efe4",
    accent: "#e4a53a",
    secondary: "#8db6c2",
  },
  education: {
    label: "Education & policy",
    number: "03",
    background: "#443727",
    ink: "#f3efe4",
    accent: "#d99a32",
    secondary: "#d9c29a",
  },
  institution: {
    label: "Institutions in focus",
    number: "04",
    background: "#302f45",
    ink: "#f3efe4",
    accent: "#e4a53a",
    secondary: "#b9b1d0",
  },
};

function themeFor(story: Story): Theme {
  const text = `${story.title} ${story.excerpt}`.toLowerCase();
  if (/education|student|school|university|teacher|minister/.test(text)) return "education";
  if (/election|voter|vote|cec|ballot|commission|poll|electoral/.test(text)) return "election";
  if (/rally|protest|march|bloc|demonstrat|strike|resign/.test(text)) return "rally";
  return "institution";
}

function RallyArt({ palette }: { palette: typeof themes.rally }) {
  return (
    <svg viewBox="0 0 640 260" className="story-visual__art" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <circle cx="510" cy="46" r="74" fill={palette.accent} opacity="0.9" />
      <path d="M0 193 166 148l107 30 111-64 256 57v89H0Z" fill={palette.secondary} opacity="0.22" />
      <path d="M0 220h640" stroke={palette.ink} strokeOpacity="0.45" />
      <g fill={palette.ink}>
        <circle cx="147" cy="134" r="15" />
        <path d="M119 211c2-44 11-62 28-62s26 18 29 62Z" />
        <circle cx="236" cy="120" r="13" />
        <path d="M212 211c2-39 10-58 24-58s22 19 25 58Z" />
        <circle cx="330" cy="143" r="17" />
        <path d="M298 211c3-47 13-66 32-66s29 19 32 66Z" />
        <circle cx="414" cy="126" r="12" />
        <path d="M392 211c3-40 10-59 22-59s21 19 24 59Z" />
      </g>
      <path d="M84 198V54l83 31" stroke={palette.accent} strokeWidth="5" fill="none" />
      <path d="m84 54 90 34-90 31Z" fill={palette.accent} />
      <path d="M436 196V78l81-24" stroke={palette.secondary} strokeWidth="4" fill="none" />
      <path d="m436 78 89-26-89 76Z" fill={palette.secondary} opacity="0.9" />
    </svg>
  );
}

function ElectionArt({ palette }: { palette: typeof themes.election }) {
  return (
    <svg viewBox="0 0 640 260" className="story-visual__art" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <path d="M0 206 103 181l116 16 104-38 127 30 190-42v113H0Z" fill={palette.secondary} opacity="0.2" />
      <rect x="202" y="54" width="244" height="158" rx="4" fill={palette.ink} opacity="0.95" />
      <path d="M202 54h244l-25 33H227Z" fill={palette.accent} />
      <rect x="250" y="88" width="148" height="100" fill={palette.background} />
      <path d="m276 139 21 21 51-55" fill="none" stroke={palette.accent} strokeWidth="10" strokeLinecap="square" />
      <path d="M116 70h59M116 91h42M116 112h70M478 93h52M478 114h74M478 135h37" stroke={palette.secondary} strokeWidth="5" />
      <path d="M73 206h495" stroke={palette.ink} strokeOpacity="0.5" />
      <circle cx="109" cy="190" r="11" fill={palette.accent} />
      <circle cx="532" cy="184" r="14" fill={palette.secondary} />
    </svg>
  );
}

function EducationArt({ palette }: { palette: typeof themes.education }) {
  return (
    <svg viewBox="0 0 640 260" className="story-visual__art" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <circle cx="491" cy="55" r="86" fill={palette.accent} opacity="0.82" />
      <path d="M0 209 111 176l107 21 137-62 285 50v75H0Z" fill={palette.secondary} opacity="0.18" />
      <path d="m145 188 153-66 153 66-153 67Z" fill={palette.ink} />
      <path d="m145 188 153 33 153-33-153 67Z" fill={palette.secondary} opacity="0.82" />
      <path d="M298 122v133M173 188l125-40 125 40" stroke={palette.accent} strokeWidth="5" fill="none" />
      <path d="M106 87h113v73H106zM421 91h106v69H421z" fill={palette.background} stroke={palette.secondary} strokeWidth="4" />
      <path d="M125 110h75M125 132h47M441 113h65M441 136h42" stroke={palette.secondary} strokeWidth="5" />
    </svg>
  );
}

function InstitutionArt({ palette }: { palette: typeof themes.institution }) {
  return (
    <svg viewBox="0 0 640 260" className="story-visual__art" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <path d="M0 220 158 143l115 47 161-91 206 80v81H0Z" fill={palette.secondary} opacity="0.18" />
      <rect x="143" y="70" width="354" height="143" fill={palette.ink} opacity="0.95" />
      <path d="m120 70 200-46 200 46Z" fill={palette.accent} />
      <path d="M169 91v94M227 91v94M285 91v94M343 91v94M401 91v94M459 91v94" stroke={palette.secondary} strokeWidth="15" />
      <path d="M106 213h428" stroke={palette.ink} strokeWidth="8" />
      <circle cx="540" cy="55" r="20" fill={palette.secondary} />
      <circle cx="83" cy="114" r="11" fill={palette.accent} />
    </svg>
  );
}

export default function StoryVisual({ story, index }: { story: Story; index: number }) {
  const theme = themeFor(story);
  const palette = themes[theme];
  const style = {
    "--story-bg": palette.background,
    "--story-ink": palette.ink,
    "--story-accent": palette.accent,
  } as CSSProperties;

  if (story.related_image) {
    return (
      <div
        className="story-visual group relative mt-6 h-[190px] overflow-hidden border border-ink sm:h-[230px]"
        role="img"
        aria-label={story.related_image.alt}
      >
        <Image
          src={story.related_image.image_url}
          alt={story.related_image.alt}
          fill
          sizes="(min-width: 1280px) 55vw, (min-width: 768px) 50vw, 100vw"
          className="story-visual__photo"
        />
        <div className="story-visual__photo-shade absolute inset-0" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-white/25 px-4 py-3 font-mono text-[9px] tracking-[0.15em] text-white/80 sm:px-5">
          <span>RELATED IMAGE / PUBLIC ARCHIVE</span>
          <span className="text-[2rem] leading-none text-white/50">{String(index + 1).padStart(2, "0")}</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 px-4 pb-3 pt-10 sm:px-5">
          <span className="font-display text-xl leading-none text-white sm:text-2xl">{story.related_image.credit}</span>
          <a
            href={story.related_image.source_url}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[8px] text-white/80 underline decoration-white/40 underline-offset-2 hover:text-white"
          >
            View image source
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="story-visual group relative mt-6 h-[190px] overflow-hidden border border-ink sm:h-[230px]"
      style={style}
      role="img"
      aria-label={`Editorial illustration for ${story.title}`}
    >
      <div className="story-visual__grain absolute inset-0" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-white/20 px-4 py-3 font-mono text-[9px] tracking-[0.15em] text-white/70 sm:px-5">
        <span>EDITORIAL VISUAL / {theme.toUpperCase()}</span>
        <span className="text-[2rem] leading-none text-white/35">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="story-visual__art-wrap absolute inset-0 pt-7">
        {theme === "rally" ? <RallyArt palette={palette} /> : null}
        {theme === "election" ? <ElectionArt palette={palette} /> : null}
        {theme === "education" ? <EducationArt palette={palette} /> : null}
        {theme === "institution" ? <InstitutionArt palette={palette} /> : null}
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-10 sm:px-5">
        <span className="max-w-[70%] font-display text-xl leading-none text-white sm:text-2xl">{palette.label}</span>
        <span className="font-mono text-[8px] text-white/65">Headline-led illustration</span>
      </div>
    </div>
  );
}
