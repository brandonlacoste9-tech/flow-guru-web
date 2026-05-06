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
import { useLanguage } from "@/contexts/LanguageContext";
import { useAudioUnlock, setMusicVolume, playUrl, stopMusic } from "@/lib/audioEngine";

/* ── SomaFM fallback stations ─────────────────────────────────────── */
type StationId = "focus" | "chill" | "energy" | "sleep" | "space";

const STATIONS: { id: StationId; label: string; desc: string; urls: string[] }[] = [
  {
    id: "focus",
    label: "Focus",
    desc: "music_focus_desc",
    urls: [
      "https://ice1.somafm.com/groovesalad-128-mp3",
      "https://ice2.somafm.com/groovesalad-128-mp3",
      "https://ice3.somafm.com/groovesalad-128-mp3",
    ],
  },
  {
    id: "chill",
    label: "Chill",
    desc: "music_chill_desc",
    urls: [
      "https://ice1.somafm.com/lush-128-mp3",
      "https://ice2.somafm.com/lush-128-mp3",
      "https://ice3.somafm.com/lush-128-mp3",
    ],
  },
  {
    id: "energy",
    label: "Energy",
    desc: "music_energy_desc",
    urls: [
      "https://ice1.somafm.com/beatblender-128-mp3",
      "https://ice2.somafm.com/beatblender-128-mp3",
      "https://ice3.somafm.com/beatblender-128-mp3",
    ],
  },
  {
    id: "sleep",
    label: "Sleep",
    desc: "music_sleep_desc",
    urls: [
      "https://ice1.somafm.com/sleepbot-192-mp3",
      "https://ice2.somafm.com/sleepbot-192-mp3",
      "https://ice3.somafm.com/sleepbot-192-mp3",
    ],
  },
  {
    id: "space",
    label: "Space",
    desc: "music_space_desc",
    urls: [
      "https://ice1.somafm.com/deepspaceone-128-mp3",
      "https://ice2.somafm.com/deepspaceone-128-mp3",
      "https://ice3.somafm.com/deepspaceone-128-mp3",
    ],
  },
];

/* ── Types ─────────────────────────────────────────────────────────── */
export type MusicPlayerHandle = {
  play: (stationId?: StationId) => void;
  pause: () => void;
};

interface MusicPlayerProps {
  onStateChange?: (playing: boolean, stationLabel: string) => void;
}

export const MusicPlayer = forwardRef<MusicPlayerHandle, MusicPlayerProps>(
  ({ onStateChange }, ref) => {
  const { t } = useLanguage();
  /* ── Radio state ────────────────────────────────────────────────── */
  const [activeId, setActiveId] = useState<StationId>("focus");
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [buffering, setBuffering] = useState(false);

  // Unlock audio on first user interaction (iOS/Windows)
  useAudioUnlock();
  const activeIdRef = useRef<StationId>("focus");
  const prevVolumeRef = useRef(0.8);

  const station = STATIONS.find((s) => s.id === activeId)!;

  const stopAudio = () => {
    stopMusic();
    setIsPlaying(false);
    setBuffering(false);
    onStateChange?.(false, "");
  };

  const startAudio = (urls: string[], urlIdx = 0) => {
    stopAudio();
    if (urlIdx >= urls.length) return;
    setBuffering(true);
    const url = urls[urlIdx];
    const audio = playUrl(url, 'music');
    audio.addEventListener("playing", () => {
      setIsPlaying(true);
      setBuffering(false);
      const currentStation = STATIONS.find((s) => s.id === activeIdRef.current)!;
      onStateChange?.(true, currentStation.label);
    });
    audio.addEventListener("waiting", () => setBuffering(true));
    audio.addEventListener("canplay", () => setBuffering(false));
    audio.addEventListener("error", () => {
      startAudio(urls, urlIdx + 1);
    });
  };

  const toggle = () => {
    if (isPlaying || buffering) {
      stopAudio();
    } else {
      startAudio(station.urls);
    }
  };

  const switchStation = (id: StationId) => {
    setActiveId(id);
    activeIdRef.current = id;
    if (isPlaying || buffering) {
      const s = STATIONS.find((st) => st.id === id)!;
      startAudio(s.urls);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setMusicVolume(newVolume, false);
    setIsMuted(newVolume === 0);
    prevVolumeRef.current = newVolume || prevVolumeRef.current;
  };

  const toggleMute = () => {
    if (isMuted) {
      const newVolume = prevVolumeRef.current > 0 ? prevVolumeRef.current : 0.8;
      setVolume(newVolume);
      setMusicVolume(newVolume, false);
      setIsMuted(false);
    } else {
      prevVolumeRef.current = volume;
      setVolume(0);
      setMusicVolume(0, true);
      setIsMuted(true);
    }
  };

  useImperativeHandle(ref, () => ({
    play: (stationId) => {
      const id = stationId ?? activeId;
      const s = STATIONS.find((st) => st.id === id)!;
      if (id !== activeId) { setActiveId(id); activeIdRef.current = id; }
      startAudio(s.urls);
    },
    pause: stopAudio,
  }));

  useEffect(() => () => stopAudio(), []);

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="bg-card backdrop-blur-xl border border-border rounded-3xl p-3 sm:p-4 shadow-xl">
      <div className="flex gap-1 mb-4 bg-secondary/50 rounded-2xl p-1">
        {STATIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => switchStation(s.id)}
            className={cn(
              "flex-1 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-[11px] font-semibold transition-all duration-200 leading-none",
              activeId === s.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className={cn(
            "w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 transition-all duration-200",
            isPlaying || buffering ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-105" : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
          )}
        >
          {buffering ? (
            <motion.div 
              className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full" 
              animate={{ rotate: 360 }} 
              transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} 
            />
          ) : isPlaying ? (
            <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
          ) : (
            <Play className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-foreground text-[14px] font-semibold leading-tight">{station.label}</p>
          <p className="text-muted-foreground text-[10px] sm:text-[11px] truncate">{t(station.desc as any)}</p>
        </div>

        <AnimatePresence>
          {isPlaying && (
            <motion.div className="flex gap-[2px] sm:gap-[3px] items-end h-3 sm:h-4 mr-0.5 sm:mr-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {([0, 0.12, 0.24] as const).map((delay, i) => (
                <motion.div key={i} className="w-[2px] sm:w-[3px] bg-primary/60 rounded-full" style={{ height: 3 }} animate={{ height: [4, 14, 4] }} transition={{ repeat: Infinity, duration: 0.55, delay, ease: "easeInOut" }} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={toggleMute} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={isMuted ? 0 : volume} 
            onChange={handleVolumeChange} 
            className="w-16 h-2 accent-primary cursor-pointer rounded-full" 
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border">
        <AnimatePresence>
          {(isPlaying || buffering) && (
            <motion.div className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[9px] sm:text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{t('music_playing')}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <p className="text-muted-foreground/60 text-[9px] sm:text-[10px] ml-auto">SomaFM · {t('music_radio_desc')}</p>
      </div>
    </div>
  );
});

MusicPlayer.displayName = "MusicPlayer";
