import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type StationId = "focus" | "chill" | "energy" | "sleep" | "space";

const STATIONS: { id: StationId; label: string; desc: string; urls: string[] }[] = [
  {
    id: "focus",
    label: "Focus",
    desc: "Groove Salad · ambient & downtempo",
    urls: [
      "https://ice1.somafm.com/groovesalad-128-mp3",
      "https://ice2.somafm.com/groovesalad-128-mp3",
      "https://ice3.somafm.com/groovesalad-128-mp3",
    ],
  },
  {
    id: "chill",
    label: "Chill",
    desc: "Lush · soft & quiet",
    urls: [
      "https://ice1.somafm.com/lush-128-mp3",
      "https://ice2.somafm.com/lush-128-mp3",
      "https://ice3.somafm.com/lush-128-mp3",
    ],
  },
  {
    id: "energy",
    label: "Energy",
    desc: "Beat Blender · mid-tempo electronic",
    urls: [
      "https://ice1.somafm.com/beatblender-128-mp3",
      "https://ice2.somafm.com/beatblender-128-mp3",
      "https://ice3.somafm.com/beatblender-128-mp3",
    ],
  },
  {
    id: "sleep",
    label: "Sleep",
    desc: "Sleep Bot · slow ambient",
    urls: [
      "https://ice1.somafm.com/sleepbot-192-mp3",
      "https://ice2.somafm.com/sleepbot-192-mp3",
      "https://ice3.somafm.com/sleepbot-192-mp3",
    ],
  },
  {
    id: "space",
    label: "Space",
    desc: "Deep Space One · space ambient",
    urls: [
      "https://ice1.somafm.com/deepspaceone-128-mp3",
      "https://ice2.somafm.com/deepspaceone-128-mp3",
      "https://ice3.somafm.com/deepspaceone-128-mp3",
    ],
  },
];

export type MusicPlayerHandle = {
  play: (stationId?: StationId) => void;
  pause: () => void;
};

export const MusicPlayer = forwardRef<MusicPlayerHandle>((_props, ref) => {
  const [activeId, setActiveId] = useState<StationId>("focus");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlIndexRef = useRef(0);

  const station = STATIONS.find((s) => s.id === activeId)!;

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setIsPlaying(false);
    setBuffering(false);
  };

  const startAudio = (urls: string[], urlIdx = 0) => {
    stopAudio();
    if (urlIdx >= urls.length) return;
    urlIndexRef.current = urlIdx;
    setBuffering(true);

    const audio = new Audio(urls[urlIdx]);
    audio.muted = isMuted;

    audio.addEventListener("playing", () => {
      setIsPlaying(true);
      setBuffering(false);
    });
    audio.addEventListener("waiting", () => setBuffering(true));
    audio.addEventListener("canplay", () => setBuffering(false));
    audio.addEventListener("error", () => {
      // Try next fallback server
      startAudio(urls, urlIdx + 1);
    });

    audioRef.current = audio;
    audio.play().catch(() => startAudio(urls, urlIdx + 1));
  };

  const toggle = () => {
    if (isPlaying || buffering) {
      stopAudio();
    } else {
      startAudio(station.urls);
    }
  };

  const switchStation = (id: StationId) => {
    const wasActive = isPlaying || buffering;
    setActiveId(id);
    const s = STATIONS.find((st) => st.id === id)!;
    if (wasActive) {
      startAudio(s.urls);
    } else {
      stopAudio();
    }
  };

  const toggleMute = () => {
    setIsMuted((m) => {
      if (audioRef.current) audioRef.current.muted = !m;
      return !m;
    });
  };

  useImperativeHandle(ref, () => ({
    play: (stationId) => {
      const id = stationId ?? activeId;
      const s = STATIONS.find((st) => st.id === id)!;
      if (id !== activeId) setActiveId(id);
      startAudio(s.urls);
    },
    pause: stopAudio,
  }));

  useEffect(() => () => stopAudio(), []);

  return (
    <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-4 shadow-2xl">
      {/* Station tabs */}
      <div className="flex gap-1 mb-4 bg-black/30 rounded-2xl p-1">
        {STATIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => switchStation(s.id)}
            className={cn(
              "flex-1 py-1.5 rounded-xl text-[11px] font-semibold transition-all duration-200 leading-none",
              activeId === s.id
                ? "bg-white/10 text-white"
                : "text-zinc-600 hover:text-zinc-400"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Player row */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-200",
            isPlaying || buffering
              ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-105"
              : "bg-white/10 text-zinc-300 hover:bg-white/20 hover:text-white"
          )}
        >
          {buffering ? (
            <motion.div
              className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
            />
          ) : isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-white text-[14px] font-semibold leading-tight">
            {station.label}
          </p>
          <p className="text-zinc-500 text-[11px] truncate">{station.desc}</p>
        </div>

        {/* Equalizer bars */}
        <AnimatePresence>
          {isPlaying && (
            <motion.div
              className="flex gap-[3px] items-end h-4 mr-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {([0, 0.12, 0.24] as const).map((delay, i) => (
                <motion.div
                  key={i}
                  className="w-[3px] bg-blue-400 rounded-full"
                  style={{ height: 4 }}
                  animate={{ height: [4, 14, 4] }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.55,
                    delay,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mute */}
        <button
          onClick={toggleMute}
          className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {isMuted ? (
            <VolumeX className="w-3.5 h-3.5" />
          ) : (
            <Volume2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/5">
        <AnimatePresence>
          {(isPlaying || buffering) && (
            <motion.div
              className="flex items-center gap-1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                Live
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        <p className="text-zinc-700 text-[10px] ml-auto">
          SomaFM · free internet radio
        </p>
      </div>
    </div>
  );
});

MusicPlayer.displayName = "MusicPlayer";
