import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Play, Pause, Volume2, VolumeX, Music2, SkipForward } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/* ── SomaFM fallback stations ─────────────────────────────────────── */
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

/* ── Types ─────────────────────────────────────────────────────────── */
type SpotifyNowPlaying = {
  trackId: string;
  name: string;
  artists: string[];
  albumArt: string | null;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
};

type SpotifyPlaylist = {
  id: string;
  name: string;
  image: string | null;
  trackCount: number;
};

type SpotifyState = {
  connected: boolean;
  nowPlaying: SpotifyNowPlaying | null;
  playlists: SpotifyPlaylist[];
};

export type MusicPlayerHandle = {
  play: (stationId?: StationId) => void;
  pause: () => void;
};

interface MusicPlayerProps {
  onStateChange?: (playing: boolean, stationLabel: string) => void;
}

export const MusicPlayer = forwardRef<MusicPlayerHandle, MusicPlayerProps>(
  ({ onStateChange }, ref) => {
  /* ── Spotify state ──────────────────────────────────────────────── */
  const [spotify, setSpotify] = useState<SpotifyState>({ connected: false, nowPlaying: null, playlists: [] });
  const [spotifyLoading, setSpotifyLoading] = useState(true);
  const [playlistTab, setPlaylistTab] = useState<string | null>(null);

  const fetchSpotifyState = async () => {
    try {
      const resp = await fetch('/api/integrations/spotify/state', { credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json();
        setSpotify(data);
        if (data.connected && data.nowPlaying?.isPlaying) {
          onStateChange?.(true, data.nowPlaying.name);
        }
      }
    } catch { /* silent */ }
    setSpotifyLoading(false);
  };

  useEffect(() => {
    fetchSpotifyState();
    const interval = setInterval(fetchSpotifyState, 15000);
    return () => clearInterval(interval);
  }, []);

  const spotifyPlay = async (contextUri?: string) => {
    try {
      const body: any = {};
      if (contextUri) body.contextUri = contextUri;
      await fetch('/api/integrations/spotify/play', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      // Re-fetch state after a short delay
      setTimeout(fetchSpotifyState, 1000);
    } catch { /* silent */ }
  };

  const spotifyPause = async () => {
    try {
      // Use the Spotify Web API pause endpoint via our proxy
      await fetch('/api/integrations/spotify/play', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' }),
      });
      setTimeout(fetchSpotifyState, 1000);
    } catch { /* silent */ }
  };

  /* ── SomaFM state ──────────────────────────────────────────────── */
  const [activeId, setActiveId] = useState<StationId>("focus");
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlIndexRef = useRef(0);
  const activeIdRef = useRef<StationId>("focus");
  const prevVolumeRef = useRef(0.8);

  const station = STATIONS.find((s) => s.id === activeId)!;

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setIsPlaying(false);
    setBuffering(false);
    onStateChange?.(false, "");
  };

  const startAudio = (urls: string[], urlIdx = 0) => {
    stopAudio();
    if (urlIdx >= urls.length) return;
    urlIndexRef.current = urlIdx;
    setBuffering(true);

    const currentStation = STATIONS.find((s) => s.id === activeIdRef.current)!;
    const audio = new Audio(urls[urlIdx]);
    audio.volume = isMuted ? 0 : volume;
    audio.muted = isMuted;

    audio.addEventListener("playing", () => {
      setIsPlaying(true);
      setBuffering(false);
      onStateChange?.(true, currentStation.label);
    });
    audio.addEventListener("waiting", () => setBuffering(true));
    audio.addEventListener("canplay", () => setBuffering(false));
    audio.addEventListener("error", () => {
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
    activeIdRef.current = id;
    const s = STATIONS.find((st) => st.id === id)!;
    if (wasActive) {
      startAudio(s.urls);
    } else {
      stopAudio();
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val === 0) {
      setIsMuted(true);
      if (audioRef.current) audioRef.current.muted = true;
    } else {
      setIsMuted(false);
      if (audioRef.current) {
        audioRef.current.muted = false;
        audioRef.current.volume = val;
      }
    }
    prevVolumeRef.current = val > 0 ? val : prevVolumeRef.current;
  };

  const toggleMute = () => {
    if (isMuted) {
      const restored = prevVolumeRef.current || 0.8;
      setIsMuted(false);
      setVolume(restored);
      if (audioRef.current) {
        audioRef.current.muted = false;
        audioRef.current.volume = restored;
      }
    } else {
      prevVolumeRef.current = volume;
      setIsMuted(true);
      setVolume(0);
      if (audioRef.current) audioRef.current.muted = true;
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

  /* ── Progress bar helper ────────────────────────────────────────── */
  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  /* ── Render ─────────────────────────────────────────────────────── */

  // If Spotify is connected, show the Spotify player
  if (spotify.connected) {
    const np = spotify.nowPlaying;
    const progress = np ? Math.min((np.progressMs / np.durationMs) * 100, 100) : 0;

    return (
      <div className="bg-card backdrop-blur-xl border border-border rounded-3xl p-4 shadow-xl">
        {/* Playlist tabs (scrollable) */}
        {spotify.playlists.length > 0 && (
          <div className="flex gap-1 mb-4 bg-secondary/50 rounded-2xl p-1 overflow-x-auto no-scrollbar">
            {spotify.playlists.slice(0, 5).map((pl) => (
              <button
                key={pl.id}
                onClick={() => {
                  setPlaylistTab(pl.id);
                  spotifyPlay(`spotify:playlist:${pl.id}`);
                }}
                className={cn(
                  "flex-1 py-1.5 rounded-xl text-[11px] font-semibold transition-all duration-200 leading-none whitespace-nowrap px-2",
                  playlistTab === pl.id
                    ? "bg-[#1DB954] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {pl.name.length > 12 ? pl.name.slice(0, 12) + '…' : pl.name}
              </button>
            ))}
          </div>
        )}

        {/* Now Playing */}
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button
            onClick={() => np?.isPlaying ? spotifyPause() : spotifyPlay()}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-200",
              np?.isPlaying
                ? "bg-[#1DB954] text-white shadow-lg shadow-[#1DB954]/30 scale-105"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
            )}
          >
            {np?.isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>

          {/* Track info */}
          <div className="flex-1 min-w-0">
            {np ? (
              <>
                <div className="flex items-center gap-2">
                  {np.albumArt && (
                    <img src={np.albumArt} alt="" className="w-8 h-8 rounded-lg shadow-md shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-foreground text-[14px] font-semibold leading-tight truncate">{np.name}</p>
                    <p className="text-muted-foreground text-[11px] truncate">{np.artists.join(', ')}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="min-w-0">
                <p className="text-foreground text-[14px] font-semibold leading-tight">Spotify</p>
                <p className="text-muted-foreground text-[11px]">Pick a playlist to start</p>
              </div>
            )}
          </div>

          {/* Equalizer bars */}
          <AnimatePresence>
            {np?.isPlaying && (
              <motion.div
                className="flex gap-[3px] items-end h-4 mr-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {([0, 0.12, 0.24] as const).map((delay, i) => (
                  <motion.div
                    key={i}
                    className="w-[3px] bg-[#1DB954]/60 rounded-full"
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
        </div>

        {/* Progress bar */}
        {np && (
          <div className="mt-3 space-y-1">
            <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#1DB954] rounded-full"
                style={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground font-medium">
              <span>{formatTime(np.progressMs)}</span>
              <span>{formatTime(np.durationMs)}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-2.5 border-t border-border">
          <AnimatePresence>
            {np?.isPlaying && (
              <motion.div
                className="flex items-center gap-1.5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="w-1.5 h-1.5 bg-[#1DB954] rounded-full animate-pulse" />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  Playing
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-1.5 ml-auto">
            <svg className="w-3 h-3 text-[#1DB954]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.307c-.216.354-.678.468-1.032.252-2.86-1.748-6.458-2.143-10.697-1.174-.405.093-.812-.162-.905-.567-.093-.405.162-.812.567-.905 4.636-1.06 8.597-.613 11.77 1.332.355.216.469.678.252 1.032z"/>
            </svg>
            <p className="text-muted-foreground/60 text-[10px]">Spotify Premium</p>
          </div>
        </div>
      </div>
    );
  }

  // ── SomaFM fallback (not connected to Spotify) ───────────────────
  return (
    <div className="bg-card backdrop-blur-xl border border-border rounded-3xl p-4 shadow-xl">
      {/* Station tabs */}
      <div className="flex gap-1 mb-4 bg-secondary/50 rounded-2xl p-1">
        {STATIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => switchStation(s.id)}
            className={cn(
              "flex-1 py-1.5 rounded-xl text-[11px] font-semibold transition-all duration-200 leading-none",
              activeId === s.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
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
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-105"
              : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
          )}
        >
          {buffering ? (
            <motion.div
              className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
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
          <p className="text-foreground text-[14px] font-semibold leading-tight">
            {station.label}
          </p>
          <p className="text-muted-foreground text-[11px] truncate">{station.desc}</p>
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
                  className="w-[3px] bg-primary/60 rounded-full"
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

        {/* Volume control */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleMute}
            className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 h-1 accent-primary cursor-pointer rounded-full appearance-none bg-secondary [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-primary"
            style={{
              background: `linear-gradient(to right, hsl(var(--primary)) ${(isMuted ? 0 : volume) * 100}%, hsl(var(--secondary)) ${(isMuted ? 0 : volume) * 100}%)`,
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border">
        <AnimatePresence>
          {(isPlaying || buffering) && (
            <motion.div
              className="flex items-center gap-1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Live
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        <p className="text-muted-foreground/60 text-[10px] ml-auto">
          SomaFM · free internet radio
        </p>
      </div>
    </div>
  );
});

MusicPlayer.displayName = "MusicPlayer";
