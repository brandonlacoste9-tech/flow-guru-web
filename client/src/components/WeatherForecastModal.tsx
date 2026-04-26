import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Cloud, Droplets, Wind } from "lucide-react";
import { cn } from "@/lib/utils";

interface DayForecast {
  date: string;
  dayLabel: string;
  tempMax: number;
  tempMin: number;
  weatherCode: number;
  precipitationSum: number;
  windSpeedMax: number;
}

interface WeatherForecastModalProps {
  open: boolean;
  onClose: () => void;
  /** Prefer lat+lon if available (browser geolocation). Falls back to locationName geocoding. */
  lat?: number | null;
  lon?: number | null;
  locationName: string;
  currentTempC: number;
  currentLabel: string;
  feelsLikeC: number;
  language?: "en" | "fr";
}

const WMO_ICONS: [number, string][] = [
  [0, "☀️"], [1, "🌤️"], [2, "⛅"], [3, "☁️"], [45, "🌫️"], [48, "🌫️"],
  [51, "🌦️"], [53, "🌦️"], [55, "🌧️"], [57, "🌧️"],
  [61, "🌧️"], [63, "🌧️"], [65, "🌧️"],
  [71, "🌨️"], [73, "🌨️"], [75, "❄️"], [77, "❄️"],
  [80, "🌦️"], [81, "🌧️"], [82, "⛈️"],
  [85, "🌨️"], [86, "❄️"],
  [95, "⛈️"], [99, "⛈️"],
];

const WMO_LABELS_EN: [number, string][] = [
  [0, "Clear sky"], [1, "Mainly clear"], [2, "Partly cloudy"], [3, "Overcast"],
  [45, "Foggy"], [48, "Icy fog"],
  [51, "Light drizzle"], [53, "Drizzle"], [55, "Heavy drizzle"], [57, "Freezing drizzle"],
  [61, "Light rain"], [63, "Rain"], [65, "Heavy rain"],
  [71, "Light snow"], [73, "Snow"], [75, "Heavy snow"], [77, "Snow grains"],
  [80, "Rain showers"], [81, "Heavy showers"], [82, "Violent showers"],
  [85, "Snow showers"], [86, "Heavy snow showers"],
  [95, "Thunderstorm"], [99, "Thunderstorm w/ hail"],
];

const WMO_LABELS_FR: [number, string][] = [
  [0, "Ciel dégagé"], [1, "Principalement dégagé"], [2, "Partiellement nuageux"], [3, "Couvert"],
  [45, "Brouillard"], [48, "Brouillard givrant"],
  [51, "Bruine légère"], [53, "Bruine"], [55, "Bruine dense"], [57, "Bruine verglaçante"],
  [61, "Pluie légère"], [63, "Pluie"], [65, "Forte pluie"],
  [71, "Neige légère"], [73, "Neige"], [75, "Forte neige"], [77, "Grains de neige"],
  [80, "Averses"], [81, "Fortes averses"], [82, "Averses violentes"],
  [85, "Averses de neige"], [86, "Fortes averses de neige"],
  [95, "Orage"], [99, "Orage avec grêle"],
];

function wmoIcon(code: number): string {
  return [...WMO_ICONS].reverse().find(([max]) => code >= max)?.[1] ?? "🌡️";
}

function wmoLabel(code: number, language: "en" | "fr" = "en"): string {
  const labels = language === "fr" ? WMO_LABELS_FR : WMO_LABELS_EN;
  return (
    labels.find(([c]) => c === code)?.[1] ??
    [...labels].reverse().find(([max]) => code >= max)?.[1] ??
    (language === "fr" ? "Inconnu" : "Unknown")
  );
}

function dayLabelFn(dateStr: string, index: number, language: "en" | "fr" = "en"): string {
  if (index === 0) return language === "fr" ? "Aujourd'hui" : "Today";
  if (index === 1) return language === "fr" ? "Demain" : "Tomorrow";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(language === "fr" ? "fr-FR" : "en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function TempBar({ min, max, absMin, absMax }: { min: number; max: number; absMin: number; absMax: number }) {
  const range = absMax - absMin || 1;
  const left = ((min - absMin) / range) * 100;
  const width = ((max - min) / range) * 100;
  return (
    <div className="flex-1 h-1.5 rounded-full bg-white/10 relative mx-2 hidden sm:block">
      <div
        className="absolute h-full rounded-full"
        style={{
          left: `${left}%`,
          width: `${Math.max(width, 8)}%`,
          background: "linear-gradient(90deg, #60a5fa, #f97316)",
        }}
      />
    </div>
  );
}

/** Geocode a location name → {lat, lon} using Open-Meteo's free API */
async function geocodeName(name: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`
    );
    const data = await res.json();
    const r = data.results?.[0];
    if (r) return { lat: r.latitude, lon: r.longitude };
  } catch {}
  return null;
}

export function WeatherForecastModal({
  open, onClose, lat, lon, locationName, currentTempC, currentLabel, feelsLikeC,
  language = "en",
}: WeatherForecastModalProps) {
  const [days, setDays] = useState<14 | 7>(7);
  const [forecast, setForecast] = useState<DayForecast[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvedCoords, setResolvedCoords] = useState<{ lat: number; lon: number } | null>(
    lat != null && lon != null ? { lat, lon } : null
  );
  const [geoError, setGeoError] = useState(false);

  // When lat/lon props change (e.g. browser geo comes in later), sync them
  useEffect(() => {
    if (lat != null && lon != null) {
      setResolvedCoords({ lat, lon });
    }
  }, [lat, lon]);

  // When modal opens and we still don't have coords, geocode from name
  useEffect(() => {
    if (!open) return;
    if (resolvedCoords) return;
    if (!locationName || locationName === "Your location" || locationName === "Votre région") {
      setGeoError(true);
      return;
    }
    setGeoError(false);
    geocodeName(locationName).then(c => {
      if (c) setResolvedCoords(c);
      else setGeoError(true);
    });
  }, [open, locationName, resolvedCoords]);

  // Fetch forecast once we have coords
  useEffect(() => {
    if (!open || !resolvedCoords) return;
    setLoading(true);
    const { lat: la, lon: lo } = resolvedCoords;
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,wind_speed_10m_max` +
      `&timezone=auto&forecast_days=${days}`
    )
      .then(r => r.json())
      .then(data => {
        const d = data.daily;
        const result: DayForecast[] = d.time.map((date: string, i: number) => ({
          date,
          dayLabel: dayLabelFn(date, i, language),
          tempMax: Math.round(d.temperature_2m_max[i]),
          tempMin: Math.round(d.temperature_2m_min[i]),
          weatherCode: d.weather_code[i],
          precipitationSum: Math.round(d.precipitation_sum[i] * 10) / 10,
          windSpeedMax: Math.round(d.wind_speed_10m_max[i]),
        }));
        setForecast(result);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, resolvedCoords, days, language]);

  const absMin = forecast.length ? Math.min(...forecast.map(d => d.tempMin)) : 0;
  const absMax = forecast.length ? Math.max(...forecast.map(d => d.tempMax)) : 0;

  const ui = {
    feelsLike: language === "fr" ? "Ressenti" : "Feels like",
    loading: language === "fr" ? "Chargement des prévisions…" : "Loading forecast…",
    locating: language === "fr" ? "Localisation en cours…" : "Locating…",
    noCoords: language === "fr" ? "Impossible de localiser cette ville." : "Could not locate this city.",
    poweredBy: language === "fr" ? "Données météo par" : "Powered by",
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-background/80 backdrop-blur-md"
            onClick={onClose}
          />

          <motion.div
            className="relative w-full sm:max-w-lg bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            {/* Header */}
            <div
              className="relative px-6 pt-6 pb-5 overflow-hidden"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)/0.15), hsl(var(--primary)/0.05))",
                borderBottom: "1px solid hsl(var(--border))",
              }}
            >
              <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-20 blur-3xl"
                style={{ background: "hsl(var(--primary))" }} />

              <div className="flex items-start justify-between relative z-10">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                    <Cloud className="inline w-3 h-3" /> {locationName}
                  </p>
                  <div className="flex items-baseline gap-3">
                    <span className="text-5xl font-bold tracking-tight">{currentTempC}°</span>
                    <div>
                      <p className="text-sm font-semibold capitalize">{currentLabel}</p>
                      <p className="text-xs text-muted-foreground">{ui.feelsLike} {feelsLikeC}°</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-accent/10 transition-colors text-muted-foreground"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Day toggle */}
              <div className="flex gap-2 mt-4">
                {([7, 14] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-all",
                      days === d
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    {d}-{language === "fr" ? "Jours" : "Day"}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto max-h-[55vh] px-3 py-3 space-y-0.5">
              {geoError ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  {ui.noCoords}
                </div>
              ) : loading || !resolvedCoords ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                    className="inline-block"
                  >
                    🌀
                  </motion.span>
                  {!resolvedCoords ? ui.locating : ui.loading}
                </div>
              ) : (
                forecast.map((day, i) => (
                  <motion.div
                    key={day.date}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-2xl transition-colors",
                      i === 0 ? "bg-primary/8 border border-primary/20" : "hover:bg-accent/5"
                    )}
                  >
                    <div className="w-20 shrink-0">
                      <p className={cn("text-xs font-semibold", i === 0 ? "text-primary" : "text-foreground")}>
                        {day.dayLabel}
                      </p>
                    </div>
                    <span className="text-xl w-7 text-center shrink-0">{wmoIcon(day.weatherCode)}</span>
                    <p className="text-[11px] text-muted-foreground w-24 hidden sm:block truncate">
                      {wmoLabel(day.weatherCode, language)}
                    </p>
                    <TempBar min={day.tempMin} max={day.tempMax} absMin={absMin} absMax={absMax} />
                    <div className="flex items-center gap-2 ml-auto shrink-0">
                      {day.precipitationSum > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-sky-400 font-medium">
                          <Droplets size={9} />{day.precipitationSum}mm
                        </span>
                      )}
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground hidden sm:flex">
                        <Wind size={9} />{day.windSpeedMax}
                      </span>
                      <div className="flex items-center gap-1 text-sm font-semibold min-w-[52px] justify-end">
                        <span className="text-foreground">{day.tempMax}°</span>
                        <span className="text-muted-foreground text-xs">{day.tempMin}°</span>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            <div className="px-6 py-3 border-t border-border">
              <p className="text-[10px] text-muted-foreground text-center">
                {ui.poweredBy}{" "}
                <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                  Open-Meteo
                </a>{" "}
                — free &amp; open weather API
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
