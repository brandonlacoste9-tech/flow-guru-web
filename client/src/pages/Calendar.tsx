import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, MapPin, Clock, Trash2,
  ArrowLeft, Calendar as CalendarIcon, AlignLeft, Search, RefreshCw, Bell, Pencil, Check, Palette
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

// These are fallbacks if t() is not available, but we will use dynamic t() calls below
const WEEKDAYS_SHORT_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_FULL_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Calendar Theme Palettes ──────────────────────────────────────────────────
// Each theme defines CSS variables injected on the calendar root.
// light/dark variants are applied based on the .dark class on <html>.
export type CalendarThemeId =
  | "default"
  | "medium-tan"
  | "saddle"
  | "cognac"
  | "pink-tan"
  | "dusty-rose"
  | "slate-leather"
  | "dark-espresso"
  | "dark-leather";

export type CalendarTheme = {
  id: CalendarThemeId;
  label: string;
  swatch: string; // Tailwind bg class for the preview dot
  // CSS vars injected on the calendar container
  vars: {
    "--cal-bg": string;
    "--cal-header-bg": string;
    "--cal-cell-bg": string;
    "--cal-cell-other": string;
    "--cal-cell-today": string;
    "--cal-cell-selected": string;
    "--cal-border": string;
    "--cal-text": string;
    "--cal-text-muted": string;
    "--cal-accent": string;
    "--cal-accent-fg": string;
    "--cal-sidebar-bg": string;
  };
};

export const CALENDAR_THEMES: CalendarTheme[] = [
  {
    // Light Tan — pale cream leather, warm dark-brown text
    id: "default",
    label: "Light Tan",
    swatch: "bg-amber-100",
    vars: {
      "--cal-bg":           "#d4b896",
      "--cal-header-bg":    "rgba(196,162,120,0.97)",
      "--cal-cell-bg":      "#dcc4a0",
      "--cal-cell-other":   "#c8a87c",
      "--cal-cell-today":   "#b8906a",
      "--cal-cell-selected":"#a87c58",
      "--cal-border":       "rgba(100,65,30,0.25)",
      "--cal-text":         "#2c1a08",
      "--cal-text-muted":   "#6b4020",
      "--cal-accent":       "#7a4a18",
      "--cal-accent-fg":    "#f5e8d4",
      "--cal-sidebar-bg":   "rgba(196,162,120,0.92)",
    },
  },
  {
    // Medium Tan — warm caramel leather, deep espresso text
    id: "medium-tan",
    label: "Medium Tan",
    swatch: "bg-amber-300",
    vars: {
      "--cal-bg":           "#b8905a",
      "--cal-header-bg":    "rgba(168,124,72,0.97)",
      "--cal-cell-bg":      "#c49a68",
      "--cal-cell-other":   "#a87c50",
      "--cal-cell-today":   "#946840",
      "--cal-cell-selected":"#845830",
      "--cal-border":       "rgba(80,45,10,0.28)",
      "--cal-text":         "#1e0e02",
      "--cal-text-muted":   "#5a3010",
      "--cal-accent":       "#3e1e04",
      "--cal-accent-fg":    "#f0dcc0",
      "--cal-sidebar-bg":   "rgba(168,124,72,0.92)",
    },
  },
  {
    // Saddle — rich mid-brown leather, cream text
    id: "saddle",
    label: "Saddle",
    swatch: "bg-yellow-800",
    vars: {
      "--cal-bg":           "#8b5e3c",
      "--cal-header-bg":    "rgba(110,72,40,0.97)",
      "--cal-cell-bg":      "#9a6a48",
      "--cal-cell-other":   "#7a5030",
      "--cal-cell-today":   "#6a4228",
      "--cal-cell-selected":"#5c3820",
      "--cal-border":       "rgba(40,20,5,0.30)",
      "--cal-text":         "#f5e8d4",
      "--cal-text-muted":   "#d4b896",
      "--cal-accent":       "#f0d4a8",
      "--cal-accent-fg":    "#3e1e04",
      "--cal-sidebar-bg":   "rgba(110,72,40,0.92)",
    },
  },
  {
    // Cognac — deep amber-brown, warm gold text
    id: "cognac",
    label: "Cognac",
    swatch: "bg-orange-800",
    vars: {
      "--cal-bg":           "#7a3e18",
      "--cal-header-bg":    "rgba(96,46,16,0.97)",
      "--cal-cell-bg":      "#8a4a22",
      "--cal-cell-other":   "#6a3010",
      "--cal-cell-today":   "#5a2808",
      "--cal-cell-selected":"#4e2004",
      "--cal-border":       "rgba(255,200,120,0.20)",
      "--cal-text":         "#fce8c0",
      "--cal-text-muted":   "#e0b870",
      "--cal-accent":       "#f5c842",
      "--cal-accent-fg":    "#3e1e04",
      "--cal-sidebar-bg":   "rgba(96,46,16,0.92)",
    },
  },
  {
    // Pink Tan — blush leather, warm rose-brown text
    id: "pink-tan",
    label: "Pink Tan",
    swatch: "bg-rose-200",
    vars: {
      "--cal-bg":           "#e8c4b0",
      "--cal-header-bg":    "rgba(220,188,168,0.97)",
      "--cal-cell-bg":      "#f0d0bc",
      "--cal-cell-other":   "#d8b09a",
      "--cal-cell-today":   "#c89a82",
      "--cal-cell-selected":"#b8846c",
      "--cal-border":       "rgba(120,60,40,0.22)",
      "--cal-text":         "#3a1808",
      "--cal-text-muted":   "#7a3c24",
      "--cal-accent":       "#8c3a20",
      "--cal-accent-fg":    "#fce8dc",
      "--cal-sidebar-bg":   "rgba(220,188,168,0.92)",
    },
  },
  {
    // Dusty Rose Leather — muted mauve-tan, deep plum-brown text
    id: "dusty-rose",
    label: "Dusty Rose",
    swatch: "bg-rose-400",
    vars: {
      "--cal-bg":           "#c49090",
      "--cal-header-bg":    "rgba(180,130,130,0.97)",
      "--cal-cell-bg":      "#d0a0a0",
      "--cal-cell-other":   "#b47878",
      "--cal-cell-today":   "#a06060",
      "--cal-cell-selected":"#8c5050",
      "--cal-border":       "rgba(80,30,30,0.25)",
      "--cal-text":         "#280808",
      "--cal-text-muted":   "#6a2828",
      "--cal-accent":       "#5c1818",
      "--cal-accent-fg":    "#fce8e8",
      "--cal-sidebar-bg":   "rgba(180,130,130,0.92)",
    },
  },
  {
    // Slate Leather — cool grey-tan, dark charcoal-brown text
    id: "slate-leather",
    label: "Slate Leather",
    swatch: "bg-slate-400",
    vars: {
      "--cal-bg":           "#a09080",
      "--cal-header-bg":    "rgba(140,124,108,0.97)",
      "--cal-cell-bg":      "#b0a090",
      "--cal-cell-other":   "#8c7c6c",
      "--cal-cell-today":   "#7a6858",
      "--cal-cell-selected":"#6a5848",
      "--cal-border":       "rgba(40,28,18,0.28)",
      "--cal-text":         "#180e06",
      "--cal-text-muted":   "#4a3828",
      "--cal-accent":       "#2e1e10",
      "--cal-accent-fg":    "#ecdcc8",
      "--cal-sidebar-bg":   "rgba(140,124,108,0.92)",
    },
  },
  {
    // Dark Espresso — deep dark leather, warm cream text
    id: "dark-espresso",
    label: "Dark Espresso",
    swatch: "bg-stone-800",
    vars: {
      "--cal-bg":           "#2c1a0a",
      "--cal-header-bg":    "rgba(34,20,8,0.97)",
      "--cal-cell-bg":      "#382210",
      "--cal-cell-other":   "#221408",
      "--cal-cell-today":   "#4a2e14",
      "--cal-cell-selected":"#5a3a1e",
      "--cal-border":       "rgba(200,160,100,0.18)",
      "--cal-text":         "#f0e0c8",
      "--cal-text-muted":   "#b89060",
      "--cal-accent":       "#d4a060",
      "--cal-accent-fg":    "#1e0e02",
      "--cal-sidebar-bg":   "rgba(28,16,6,0.95)",
    },
  },
  {
    // Dark Leather — rich black-brown, antique gold text
    id: "dark-leather",
    label: "Dark Leather",
    swatch: "bg-amber-900",
    vars: {
      "--cal-bg":           "#1a1208",
      "--cal-header-bg":    "rgba(20,14,6,0.97)",
      "--cal-cell-bg":      "#1e160a",
      "--cal-cell-other":   "#160f05",
      "--cal-cell-today":   "#2e2010",
      "--cal-cell-selected":"#3a2818",
      "--cal-border":       "rgba(180,130,60,0.20)",
      "--cal-text":         "#f0e4cc",
      "--cal-text-muted":   "#9a7a50",
      "--cal-accent":       "#c4903a",
      "--cal-accent-fg":    "#1a1208",
      "--cal-sidebar-bg":   "rgba(16,10,2,0.90)",
    },
  },
];

const THEME_STORAGE_KEY = "fg_calendar_theme";

function useCalendarTheme() {
  const [themeId, setThemeId] = useState<CalendarThemeId>(() => {
    try { return (localStorage.getItem(THEME_STORAGE_KEY) as CalendarThemeId) || "default"; }
    catch { return "default"; }
  });

  const theme = CALENDAR_THEMES.find(t => t.id === themeId) ?? CALENDAR_THEMES[0];

  const applyTheme = (id: CalendarThemeId) => {
    setThemeId(id);
    try { localStorage.setItem(THEME_STORAGE_KEY, id); } catch {}
  };

  return { theme, themeId, applyTheme };
}


// ─── Event Colors (Leather Palette) ──────────────────────────────────────────
// IDs kept the same so existing saved events don't lose their color
const EVENT_COLORS = [
  // Cognac — warm amber-brown (replaces blue)
  { id: "blue",   label: "Cognac",      bg: "bg-[#b5651d]",   text: "text-white",    dot: "bg-[#b5651d]",   lightBg: "#fdf0e0", lightText: "#6b3410", lightBorder: "#e8b87a", darkBg: "rgba(101,46,14,0.55)", darkText: "#f5c98a", darkBorder: "rgba(181,101,29,0.5)" },
  // Forest Leather — deep olive-green
  { id: "green",  label: "Forest",      bg: "bg-[#4a6741]",   text: "text-white",    dot: "bg-[#4a6741]",   lightBg: "#eef3ec", lightText: "#2a3e27", lightBorder: "#a8c4a0", darkBg: "rgba(42,62,39,0.55)",  darkText: "#b8d4b0", darkBorder: "rgba(74,103,65,0.5)" },
  // Burgundy — deep wine-red
  { id: "red",    label: "Burgundy",    bg: "bg-[#7c2d3e]",   text: "text-white",    dot: "bg-[#7c2d3e]",   lightBg: "#faeaed", lightText: "#4a1824", lightBorder: "#d4909c", darkBg: "rgba(74,24,36,0.55)",  darkText: "#e8a8b4", darkBorder: "rgba(124,45,62,0.5)" },
  // Amber — warm golden honey
  { id: "yellow", label: "Amber",       bg: "bg-[#c8860a]",   text: "text-white",    dot: "bg-[#c8860a]",   lightBg: "#fef5e0", lightText: "#7a5006", lightBorder: "#f0c870", darkBg: "rgba(120,80,6,0.55)",  darkText: "#f5d890", darkBorder: "rgba(200,134,10,0.5)" },
  // Dusty Rose — muted mauve-pink
  { id: "purple", label: "Dusty Rose",  bg: "bg-[#b07080]",   text: "text-white",    dot: "bg-[#b07080]",   lightBg: "#faeef0", lightText: "#6a3040", lightBorder: "#d8a8b4", darkBg: "rgba(106,48,64,0.55)", darkText: "#e8c0c8", darkBorder: "rgba(176,112,128,0.5)" },
  // Blush Tan — soft pink-tan
  { id: "pink",   label: "Blush Tan",   bg: "bg-[#c8a090]",   text: "text-white",    dot: "bg-[#c8a090]",   lightBg: "#fdf5f2", lightText: "#7a4030", lightBorder: "#e8c4b8", darkBg: "rgba(122,64,48,0.55)", darkText: "#f0d0c4", darkBorder: "rgba(200,160,144,0.5)" },
  // Saddle — rich warm brown
  { id: "orange", label: "Saddle",      bg: "bg-[#8b5e3c]",   text: "text-white",    dot: "bg-[#8b5e3c]",   lightBg: "#f5ede4", lightText: "#4a2e18", lightBorder: "#c8a080", darkBg: "rgba(74,46,24,0.55)",  darkText: "#d8b898", darkBorder: "rgba(139,94,60,0.5)" },
  // Slate Leather — warm grey-tan
  { id: "teal",   label: "Slate",       bg: "bg-[#7a7060]",   text: "text-white",    dot: "bg-[#7a7060]",   lightBg: "#f2f0ec", lightText: "#3a3028", lightBorder: "#b8b0a0", darkBg: "rgba(58,48,40,0.55)",  darkText: "#c8c0b0", darkBorder: "rgba(122,112,96,0.5)" },
];

// Themes that use dark backgrounds — use light/cream text on chips
const DARK_THEME_IDS = new Set<CalendarThemeId>(["saddle","cognac","dark-espresso","dark-leather"]);
function getColor(colorId?: string | null) {
  return EVENT_COLORS.find(c => c.id === colorId) ?? EVENT_COLORS[0];
}
// Render an event chip with inline styles so it works in any theme
function EventChip({ event, onClick, isDarkTheme }: { event: any; onClick?: (e: React.MouseEvent) => void; isDarkTheme?: boolean }) {
  const color = getColor(event.color);
  const isDark = isDarkTheme ?? false;
  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: isDark ? color.darkBg : color.lightBg,
        color: isDark ? color.darkText : color.lightText,
        borderColor: isDark ? color.darkBorder : color.lightBorder,
        borderWidth: "1px",
        borderStyle: "solid",
      }}
      className="text-xs leading-tight truncate px-1.5 py-0.5 rounded-md font-semibold cursor-pointer hover:opacity-80 transition-opacity"
    >
      {!event.allDay && <span className="opacity-70 mr-1">{formatTime(new Date(event.startAt)).replace(":00","")}</span>}
      {event.title}
    </div>
  );
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type ViewMode = "month" | "week" | "day";
type RecurrenceType = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

type EventForm = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  location: string;
  allDay: boolean;
  color: string;
  recurrence: RecurrenceType;
  reminderMinutes: string;
};

const blankForm = (day: Date): EventForm => {
  const start = new Date(day);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(10, 0, 0, 0);
  return { title: "", description: "", startAt: formatDatetimeLocal(start), endAt: formatDatetimeLocal(end), location: "", allDay: false, color: "blue", recurrence: "none", reminderMinutes: "30,15,5" };
};

// ─── Theme Palette Picker ─────────────────────────────────────────────────────
function ThemePicker({ themeId, onSelect, t }: { themeId: CalendarThemeId; onSelect: (id: CalendarThemeId) => void; t: any }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = CALENDAR_THEMES.find(t => t.id === themeId) ?? CALENDAR_THEMES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Calendar theme"
        className="w-9 h-9 rounded-full hover:bg-[var(--cal-cell-today)] flex items-center justify-center transition-colors text-[var(--cal-text-muted)] hover:text-[var(--cal-text)]"
      >
        <Palette size={16}/>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-50 rounded-2xl shadow-2xl border p-3 min-w-[200px]"
            style={{
              background: "var(--cal-header-bg)",
              borderColor: "var(--cal-border)",
              backdropFilter: "blur(16px)",
            }}
          >
            <p className="text-xs font-bold uppercase tracking-widest mb-2.5 px-1" style={{ color: "var(--cal-text-muted)" }}>
              {t('calendar_color')}
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {CALENDAR_THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { onSelect(t.id); setOpen(false); }}
                  title={t.label}
                  className={cn(
                    "flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all",
                    themeId === t.id
                      ? "ring-2 ring-offset-1 ring-[var(--cal-accent)] bg-[var(--cal-cell-today)]"
                      : "hover:bg-[var(--cal-cell-today)]"
                  )}
                >
                  <span className={cn("w-6 h-6 rounded-full shadow-sm", t.swatch)}/>
                  <span className="text-[11px] font-semibold leading-tight text-center" style={{ color: "var(--cal-text-muted)" }}>
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--cal-border)" }}>
              <p className="text-xs text-center" style={{ color: "var(--cal-text-muted)" }}>
                {t('music_playing')}: <span className="font-semibold" style={{ color: "var(--cal-text)" }}>{current.label}</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Mini Calendar (sidebar) ──────────────────────────────────────────────────
function MiniCalendar({ viewDate, selectedDay, onSelectDay, onChangeMonth, events, t }: {
  viewDate: Date; selectedDay: Date; onSelectDay: (d: Date) => void;
  onChangeMonth: (d: Date) => void; events: any[]; t: any;
}) {
  const today = new Date();
  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
  const days: Date[] = [];
  const firstWeekday = monthStart.getDay();
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = new Date(monthStart); d.setDate(d.getDate() - i - 1); days.push(d);
  }
  for (let i = 1; i <= monthEnd.getDate(); i++) days.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), i));
  const rem = 7 - (days.length % 7);
  if (rem < 7) for (let i = 1; i <= rem; i++) { const d = new Date(monthEnd); d.setDate(d.getDate() + i); days.push(d); }

  const hasEvent = (d: Date) => events.some(e => isSameDay(new Date(e.startAt), d));

  return (
    <div className="p-3 select-none">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: "var(--cal-text)" }}>{t(`month_${viewDate.getMonth()}` as any)} {viewDate.getFullYear()}</span>
        <div className="flex gap-1">
          <button onClick={() => onChangeMonth(new Date(viewDate.getFullYear(), viewDate.getMonth()-1,1))}
            className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-[var(--cal-cell-today)]"
            style={{ color: "var(--cal-text-muted)" }}>
            <ChevronLeft size={12}/>
          </button>
          <button onClick={() => onChangeMonth(new Date(viewDate.getFullYear(), viewDate.getMonth()+1,1))}
            className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-[var(--cal-cell-today)]"
            style={{ color: "var(--cal-text-muted)" }}>
            <ChevronRight size={12}/>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {[0,1,2,3,4,5,6].map(d => (
          <div key={d} className="text-center text-xs font-bold py-0.5" style={{ color: "var(--cal-text-muted)" }}>{t(`weekday_${d}` as any)[0]}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {days.map((day, i) => {
          const isCurrentMonth = day.getMonth() === viewDate.getMonth();
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDay);
          const hasDot = hasEvent(day);
          return (
            <button key={i} onClick={() => onSelectDay(day)}
              style={{
                backgroundColor: isSelected ? "var(--cal-accent)" : isToday ? "var(--cal-cell-today)" : "transparent",
                color: isSelected ? "var(--cal-accent-fg)" : isToday ? "var(--cal-accent)" : isCurrentMonth ? "var(--cal-text)" : "var(--cal-text-muted)",
              }}
              className="relative w-7 h-7 mx-auto flex items-center justify-center rounded-full text-[11px] font-medium transition-colors hover:opacity-80">
              {day.getDate()}
              {hasDot && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ backgroundColor: "var(--cal-accent)" }}/>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Event Detail Popover (with inline editing) ───────────────────────────────
function EventPopover({ event, onClose, onDelete, onUpdated, t, language }: {
  event: any;
  onClose: () => void;
  onDelete: (id: number) => void;
  onUpdated: () => void;
  t: any;
  language: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(event.title ?? "");
  const [editStartAt, setEditStartAt] = useState(formatDatetimeLocal(new Date(event.startAt)));
  const [editEndAt, setEditEndAt] = useState(formatDatetimeLocal(new Date(event.endAt)));
  const [editLocation, setEditLocation] = useState(event.location ?? "");
  const [editDescription, setEditDescription] = useState(event.description ?? "");
  const [editColor, setEditColor] = useState(event.color ?? "blue");
  const [editAllDay, setEditAllDay] = useState(!!event.allDay);

  const updateMutation = trpc.calendar.update.useMutation({
    onSuccess: () => { toast.success(t('calendar_toast_updated')); onUpdated(); onClose(); },
    onError: () => toast.error(t('calendar_toast_error')),
  });

  const color = getColor(isEditing ? editColor : event.color);
  const isDark = false; // Calendar uses fixed leather colors, not dark mode

  const handleSave = () => {
    if (!editTitle.trim()) { toast.error(t('calendar_placeholder_title')); return; }
    updateMutation.mutate({
      id: event.id,
      title: editTitle.trim(),
      description: editDescription || undefined,
      startAt: new Date(editStartAt).toISOString(),
      endAt: new Date(editEndAt).toISOString(),
      location: editLocation || undefined,
      allDay: editAllDay,
      color: editColor,
    });
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div
        className="relative rounded-2xl shadow-2xl w-full max-w-sm p-0 overflow-hidden"
        style={{ background: "var(--cal-cell-bg)", border: "1px solid var(--cal-border)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Color accent bar */}
        <div className={cn("h-1.5 w-full", color.bg)} />

        <div className="p-5">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-4">
            {isEditing ? (
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                autoFocus
                className="flex-1 text-lg font-bold bg-transparent border-0 border-b-2 outline-none pb-1 placeholder:opacity-40"
                style={{ borderColor: "var(--cal-accent)", color: "var(--cal-text)" }}
                placeholder={t('calendar_placeholder_title')}
              />
            ) : (
              <h3 className="text-lg font-bold leading-tight flex-1" style={{ color: "var(--cal-text)" }}>{event.title}</h3>
            )}
            <div className="flex gap-1 shrink-0">
              {isEditing ? (
                <>
                  <button onClick={handleSave} disabled={updateMutation.isPending}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 hover:opacity-80"
                    style={{ color: "#10b981", backgroundColor: isDark ? "rgba(16,185,129,0.15)" : "#ecfdf5" }}>
                    <Check size={14}/>
                  </button>
                  <button onClick={() => setIsEditing(false)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)]"
                    style={{ color: "var(--cal-text-muted)" }}>
                    <X size={14}/>
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setIsEditing(true)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)]"
                    style={{ color: "var(--cal-text-muted)" }} title="Edit event">
                    <Pencil size={13}/>
                  </button>
                  <button onClick={() => { onDelete(event.id); onClose(); }}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                    style={{ color: "var(--cal-text-muted)" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ef4444"; (e.currentTarget as HTMLElement).style.backgroundColor = isDark ? "rgba(239,68,68,0.15)" : "#fef2f2"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--cal-text-muted)"; (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}>
                    <Trash2 size={14}/>
                  </button>
                  <button onClick={onClose}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)]"
                    style={{ color: "var(--cal-text-muted)" }}>
                    <X size={14}/>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Body — read mode */}
          {!isEditing && (
            <div className="space-y-2.5">
              {!event.allDay && (
                <div className="flex items-center gap-3 text-sm" style={{ color: "var(--cal-text-muted)" }}>
                  <Clock size={14} className="shrink-0" style={{ color: "var(--cal-accent)" }}/>
                  <span>{new Date(event.startAt).toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR',{weekday:"long",month:"long",day:"numeric"})} · {formatTime(new Date(event.startAt))} – {formatTime(new Date(event.endAt))}</span>
                </div>
              )}
              {event.allDay === 1 && (
                <div className="flex items-center gap-3 text-sm" style={{ color: "var(--cal-text-muted)" }}>
                  <CalendarIcon size={14} className="shrink-0" style={{ color: "var(--cal-accent)" }}/>
                  <span>{new Date(event.startAt).toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR',{weekday:"long",month:"long",day:"numeric"})} · {t('calendar_all_day')}</span>
                </div>
              )}
              {event.location && (
                <div className="flex items-center gap-3 text-sm" style={{ color: "var(--cal-text-muted)" }}>
                  <MapPin size={14} className="shrink-0" style={{ color: "var(--cal-accent)" }}/>
                  <span>{event.location}</span>
                </div>
              )}
              {event.description && (
                <div className="flex items-start gap-3 text-sm" style={{ color: "var(--cal-text-muted)" }}>
                  <AlignLeft size={14} className="shrink-0 mt-0.5" style={{ color: "var(--cal-accent)" }}/>
                  <span className="leading-relaxed">{event.description}</span>
                </div>
              )}
            </div>
          )}

          {/* Body — edit mode */}
          {isEditing && (
            <div className="space-y-3">
              {/* All day toggle */}
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setEditAllDay(v => !v)}
                  className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                  style={{ backgroundColor: editAllDay ? "var(--cal-accent)" : "var(--cal-cell-today)" }}>
                  <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", editAllDay ? "left-4" : "left-0.5")}/>
                </button>
                <span className="text-sm" style={{ color: "var(--cal-text-muted)" }}>{t('calendar_all_day')}</span>
              </div>

              {/* Date/time */}
              {!editAllDay ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold mb-1 block uppercase tracking-wide" style={{ color: "var(--cal-text-muted)" }}>Start</label>
                    <input type="datetime-local" value={editStartAt} onChange={e => setEditStartAt(e.target.value)}
                      className="w-full rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2"
                      style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block uppercase tracking-wide" style={{ color: "var(--cal-text-muted)" }}>{t('calendar_end')}</label>
                    <input type="datetime-local" value={editEndAt} onChange={e => setEditEndAt(e.target.value)}
                      className="w-full rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2"
                      style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}/>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold mb-1 block uppercase tracking-wide" style={{ color: "var(--cal-text-muted)" }}>{t('calendar_date')}</label>
                  <input type="date" value={editStartAt.split("T")[0]} onChange={e => { setEditStartAt(e.target.value+"T09:00"); setEditEndAt(e.target.value+"T10:00"); }}
                    className="w-full rounded-lg px-2.5 py-1.5 text-xs outline-none"
                    style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}/>
                </div>
              )}

              {/* Location */}
              <div className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)" }}>
                <MapPin size={13} style={{ color: "var(--cal-text-muted)" }} className="shrink-0"/>
                <input value={editLocation} onChange={e => setEditLocation(e.target.value)}
                  placeholder={t('calendar_placeholder_location')}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-40"
                  style={{ color: "var(--cal-text)" }}/>
              </div>

              {/* Description */}
              <div className="flex items-start gap-2 rounded-lg px-3 py-2"
                style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)" }}>
                <AlignLeft size={13} style={{ color: "var(--cal-text-muted)" }} className="shrink-0 mt-0.5"/>
                <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)}
                  placeholder={t('calendar_placeholder_description')} rows={2}
                  className="flex-1 bg-transparent text-sm outline-none resize-none placeholder:opacity-40"
                  style={{ color: "var(--cal-text)" }}/>
              </div>

              {/* Color picker */}
              <div>
                <label className="text-xs font-semibold mb-2 block uppercase tracking-wide" style={{ color: "var(--cal-text-muted)" }}>{t('calendar_color')}</label>
                <div className="flex gap-2 flex-wrap">
                  {EVENT_COLORS.map(c => (
                    <button key={c.id} type="button" onClick={() => setEditColor(c.id)}
                      className={cn("w-6 h-6 rounded-full transition-all", c.bg,
                        editColor === c.id ? "ring-2 ring-offset-2 ring-offset-[var(--cal-cell-bg)] ring-white scale-110" : "hover:scale-110 opacity-70 hover:opacity-100")}>
                    </button>
                  ))}
                </div>
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setIsEditing(false)}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors hover:opacity-80"
                  style={{ border: "1px solid var(--cal-border)", color: "var(--cal-text)", background: "transparent" }}>
                  {t('calendar_cancel')}
                </button>
                <button type="button" onClick={handleSave} disabled={updateMutation.isPending}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50 hover:opacity-90"
                  style={{ background: "var(--cal-accent)", color: "var(--cal-accent-fg)" }}>
                  {updateMutation.isPending ? t('calendar_saving') : t('calendar_save')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── New Event Modal ──────────────────────────────────────────────────────────
function NewEventModal({ form, setForm, onSubmit, onClose, isPending, t }: {
  form: EventForm; setForm: (f: EventForm) => void;
  onSubmit: (e: React.FormEvent) => void; onClose: () => void; isPending: boolean; t: any;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => titleRef.current?.focus(), 50); }, []);
  const color = getColor(form.color);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.97 }}
        className="relative rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ background: "var(--cal-cell-bg)", border: "1px solid var(--cal-border)" }}
        onClick={e => e.stopPropagation()}>
        {/* Color bar */}
        <div className={cn("h-1.5 w-full transition-colors", color.bg)} />
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold" style={{ color: "var(--cal-text)" }}>{t('calendar_new_event')}</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)]"
              style={{ color: "var(--cal-text-muted)" }}><X size={15}/></button>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Title */}
            <input ref={titleRef} value={form.title} onChange={e => setForm({...form, title: e.target.value})}
              placeholder={t('calendar_placeholder_title')} required
              className="w-full text-xl font-semibold bg-transparent border-0 border-b-2 outline-none pb-2 placeholder:opacity-40 transition-colors"
              style={{ borderColor: "var(--cal-border)", color: "var(--cal-text)" }}
              onFocus={e => (e.target as HTMLElement).style.borderColor = "var(--cal-accent)"}
              onBlur={e => (e.target as HTMLElement).style.borderColor = "var(--cal-border)"}/>

            {/* All day toggle */}
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setForm({...form, allDay: !form.allDay})}
                className="relative w-10 h-5 rounded-full transition-colors"
                style={{ backgroundColor: form.allDay ? "var(--cal-accent)" : "var(--cal-cell-today)" }}>
                <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", form.allDay ? "left-5" : "left-0.5")}/>
              </button>
              <span className="text-sm" style={{ color: "var(--cal-text-muted)" }}>{t('calendar_all_day')}</span>
            </div>

            {/* Date/time */}
            {!form.allDay ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "var(--cal-text-muted)" }}>{t('calendar_start')}</label>
                  <input type="datetime-local" value={form.startAt} onChange={e => setForm({...form, startAt: e.target.value})}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}/>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "var(--cal-text-muted)" }}>{t('calendar_end')}</label>
                  <input type="datetime-local" value={form.endAt} onChange={e => setForm({...form, endAt: e.target.value})}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}/>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--cal-text-muted)" }}>{t('calendar_date')}</label>
                <input type="date" value={form.startAt.split("T")[0]} onChange={e => setForm({...form, startAt: e.target.value+"T09:00", endAt: e.target.value+"T10:00"})}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}/>
              </div>
            )}

            {/* Location */}
            <div className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)" }}>
              <MapPin size={14} style={{ color: "var(--cal-text-muted)" }} className="shrink-0"/>
              <input value={form.location} onChange={e => setForm({...form, location: e.target.value})}
                placeholder={t('calendar_placeholder_location')} className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-40"
                style={{ color: "var(--cal-text)" }}/>
            </div>

            {/* Description */}
            <div className="flex items-start gap-2 rounded-lg px-3 py-2"
              style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)" }}>
              <AlignLeft size={14} style={{ color: "var(--cal-text-muted)" }} className="shrink-0 mt-0.5"/>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                placeholder={t('calendar_placeholder_description')} rows={2}
                className="flex-1 bg-transparent text-sm outline-none resize-none placeholder:opacity-40"
                style={{ color: "var(--cal-text)" }}/>
            </div>

            {/* Recurrence */}
            <div>
              <label className="text-xs mb-2 block" style={{ color: "var(--cal-text-muted)" }}>{t('calendar_recurrence')}</label>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)" }}>
                <RefreshCw size={14} style={{ color: "var(--cal-text-muted)" }} className="shrink-0"/>
                <select value={form.recurrence} onChange={e => setForm({...form, recurrence: e.target.value as RecurrenceType})}
                  className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--cal-text)" }}>
                  <option value="none">{t('calendar_recurrence_none')}</option>
                  <option value="daily">{t('calendar_recurrence_daily')}</option>
                  <option value="weekdays">{t('calendar_recurrence_weekdays')}</option>
                  <option value="weekly">{t('calendar_recurrence_weekly')}</option>
                  <option value="monthly">{t('calendar_recurrence_monthly')}</option>
                  <option value="yearly">{t('calendar_recurrence_yearly')}</option>
                </select>
              </div>
            </div>

            {/* Reminder */}
            <div className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)" }}>
              <Bell size={14} style={{ color: "var(--cal-text-muted)" }} className="shrink-0"/>
              <select value={form.reminderMinutes} onChange={e => setForm({...form, reminderMinutes: e.target.value})}
                className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--cal-text)" }}>
                <option value="">No reminder</option>
                <option value="5">5 minutes before</option>
                <option value="10">10 minutes before</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="30,15">30 and 15 minutes before</option>
                <option value="30,15,5">30, 15, and 5 minutes before</option>
                <option value="60">1 hour before</option>
                <option value="60,30">1 hour and 30 minutes before</option>
                <option value="60,30,15,5">1 hour, 30, 15, and 5 min before</option>
                <option value="1440">1 day before</option>
              </select>
            </div>

            {/* Color picker */}
            <div>
              <label className="text-xs mb-2 block" style={{ color: "var(--cal-text-muted)" }}>{t('calendar_color')}</label>
              <div className="flex gap-2 flex-wrap">
                {EVENT_COLORS.map(c => (
                  <button key={c.id} type="button" onClick={() => setForm({...form, color: c.id})}
                    className={cn("w-6 h-6 rounded-full transition-all", c.bg,
                      form.color === c.id ? "ring-2 ring-offset-2 ring-offset-[var(--cal-cell-bg)] ring-white scale-110" : "hover:scale-110 opacity-70 hover:opacity-100")}>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-80"
                style={{ border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}>
                {t('calendar_cancel')}
              </button>
              <button type="submit" disabled={isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50 hover:opacity-90"
                style={{ background: "var(--cal-accent)", color: "var(--cal-accent-fg)" }}>
                {isPending ? t('calendar_saving') : t('calendar_save')}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────
function MonthView({ viewDate, selectedDay, events, onDayClick, onEventClick, themeId, t }: {
  viewDate: Date; selectedDay: Date; events: any[];
  onDayClick: (d: Date) => void; onEventClick: (e: any) => void; themeId: CalendarThemeId;
  t: any;
}) {
  const today = new Date();
  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
  const days: Date[] = [];
  const firstWeekday = monthStart.getDay();
  for (let i = firstWeekday - 1; i >= 0; i--) { const d = new Date(monthStart); d.setDate(d.getDate() - i - 1); days.push(d); }
  for (let i = 1; i <= monthEnd.getDate(); i++) days.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), i));
  const rem = 7 - (days.length % 7);
  if (rem < 7) for (let i = 1; i <= rem; i++) { const d = new Date(monthEnd); d.setDate(d.getDate() + i); days.push(d); }

  const eventsOnDay = (d: Date) => events.filter(e => isSameDay(new Date(e.startAt), d));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Weekday headers */}
      <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--cal-border)", background: "var(--cal-header-bg)" }}>
        {[0,1,2,3,4,5,6].map(d => (
          <div key={d} className="py-2 sm:py-2.5 text-center text-[10px] sm:text-sm font-bold uppercase tracking-wider"
            style={{ color: "var(--cal-text-muted)" }}>
            <span className="hidden sm:inline">{t(`weekday_${d}` as any)}</span>
            <span className="sm:hidden">{t(`weekday_${d}` as any)[0]}</span>
          </div>
        ))}
      </div>
      {/* Grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-hidden">
        {days.map((day, i) => {
          const isCurrentMonth = day.getMonth() === viewDate.getMonth();
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDay);
          const dayEvents = eventsOnDay(day);
          const hasEvents = dayEvents.length > 0 && isCurrentMonth;
          return (
            <div key={i} onClick={() => onDayClick(day)}
              className="p-0.5 sm:p-1.5 cursor-pointer transition-colors overflow-hidden flex flex-col items-center sm:items-stretch"
              style={{
                borderBottom: "1px solid var(--cal-border)",
                borderRight: "1px solid var(--cal-border)",
                background: isSelected
                  ? "var(--cal-cell-selected)"
                  : isToday
                  ? "var(--cal-cell-today)"
                  : isCurrentMonth
                  ? "var(--cal-cell-bg)"
                  : "var(--cal-cell-other)",
              }}>
              <div className="flex justify-center mb-0.5 sm:mb-1">
                <span
                  className="flex items-center justify-center rounded-full font-medium transition-all"
                  style={{
                    width: hasEvents ? "1.75rem" : "1.5rem",
                    height: hasEvents ? "1.75rem" : "1.5rem",
                    fontSize: "0.75rem",
                    fontWeight: isToday || isSelected || hasEvents ? 700 : 400,
                    backgroundColor: isToday ? "var(--cal-accent)" : "transparent",
                    color: isToday
                      ? "var(--cal-accent-fg)"
                      : isSelected
                      ? "var(--cal-accent)"
                      : isCurrentMonth
                      ? "var(--cal-text)"
                      : "var(--cal-text-muted)",
                  }}>
                  <span className="sm:text-base text-[11px]">{day.getDate()}</span>
                </span>
              </div>
              <div className="space-y-0.5 hidden sm:block">
                {dayEvents.slice(0, 3).map(e => (
                  <EventChip key={e.id} event={e} onClick={ev => { ev.stopPropagation(); onEventClick(e); }} isDarkTheme={DARK_THEME_IDS.has(themeId)}/>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] pl-1 font-semibold" style={{ color: "var(--cal-text-muted)" }}>
                    +{dayEvents.length - 3}
                  </div>
                )}
              </div>
              {/* Mobile dots */}
              <div className="flex flex-wrap justify-center gap-0.5 sm:hidden mt-auto pb-1">
                {dayEvents.slice(0, 3).map(e => {
                  const color = getColor(e.color);
                  return <div key={e.id} className={cn("w-1 h-1 rounded-full", color.dot)} />
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────
function WeekView({ viewDate, events, onEventClick, onSlotClick, t }: {
  viewDate: Date; events: any[]; onEventClick: (e: any) => void; onSlotClick: (d: Date) => void;
  t: any;
}) {
  const today = new Date();
  const startOfWeek = new Date(viewDate);
  startOfWeek.setDate(viewDate.getDate() - viewDate.getDay());
  const weekDays = Array.from({length: 7}, (_, i) => { const d = new Date(startOfWeek); d.setDate(d.getDate() + i); return d; });
  const hours = Array.from({length: 24}, (_, i) => i);

  const eventsOnDay = (d: Date) => events.filter(e => !e.allDay && isSameDay(new Date(e.startAt), d));

  const getEventStyle = (event: any) => {
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    const startMins = start.getHours() * 60 + start.getMinutes();
    const endMins = end.getHours() * 60 + end.getMinutes();
    return { top: `${(startMins / 60) * 56}px`, height: `${Math.max(((endMins - startMins) / 60) * 56, 20)}px` };
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="grid" style={{ gridTemplateColumns: "minmax(40px, 56px) repeat(7, 1fr)", borderBottom: "1px solid var(--cal-border)", background: "var(--cal-header-bg)" }}>
        <div className="py-2"/>
        {weekDays.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <div key={i} className="py-1.5 sm:py-2 text-center">
              <div className="text-[10px] sm:text-sm font-bold uppercase" style={{ color: "var(--cal-text-muted)" }}>
                <span className="sm:hidden">{t(`weekday_${d.getDay()}` as any)[0]}</span>
                <span className="hidden sm:inline">{t(`weekday_${d.getDay()}` as any).slice(0,3)}</span>
              </div>
              <div className="w-7 h-7 sm:w-9 sm:h-9 mx-auto mt-0.5 flex items-center justify-center rounded-full text-sm sm:text-base font-bold"
                style={{
                  backgroundColor: isToday ? "var(--cal-accent)" : "transparent",
                  color: isToday ? "var(--cal-accent-fg)" : "var(--cal-text)",
                }}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: "minmax(40px, 56px) repeat(7, 1fr)" }}>
          <div className="col-start-1">
            {hours.map(h => (
              <div key={h} className="h-14 flex items-start justify-end pr-1 sm:pr-2 pt-0.5">
                {h > 0 && <span className="text-[10px] sm:text-xs" style={{ color: "var(--cal-text-muted)" }}>{h === 12 ? "12P" : h < 12 ? `${h}A` : `${h-12}P`}</span>}
              </div>
            ))}
          </div>
          {weekDays.map((day, di) => (
            <div key={di} className="relative" style={{ borderLeft: "1px solid var(--cal-border)" }}>
              {hours.map(h => (
                <div key={h} onClick={() => { const d = new Date(day); d.setHours(h,0,0,0); onSlotClick(d); }}
                  className="h-14 cursor-pointer transition-colors"
                  style={{ borderBottom: "1px solid var(--cal-border)", opacity: 0.5 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--cal-cell-today)"; (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; (e.currentTarget as HTMLElement).style.opacity = "0.5"; }}/>
              ))}
              {eventsOnDay(day).map(e => {
                const color = getColor(e.color);
                return (
                  <div key={e.id} onClick={ev => { ev.stopPropagation(); onEventClick(e); }}
                    style={getEventStyle(e)}
                    className={cn("absolute left-0.5 right-0.5 rounded-lg px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity overflow-hidden z-10 shadow-sm leading-tight", color.bg, color.text)}>
                    <div className="truncate">{e.title}</div>
                    <div className="text-[8px] sm:text-[11px] opacity-80 sm:mt-0.5">{formatTime(new Date(e.startAt)).replace(":00","")}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Day View ─────────────────────────────────────────────────────────────────
function DayView({ viewDate, events, onEventClick, onSlotClick, t, language }: {
  viewDate: Date; events: any[]; onEventClick: (e: any) => void; onSlotClick: (d: Date) => void;
  t: any; language: string;
}) {
  const today = new Date();
  const isToday = isSameDay(viewDate, today);
  const hours = Array.from({length: 24}, (_, i) => i);
  const dayEvents = events.filter(e => !e.allDay && isSameDay(new Date(e.startAt), viewDate));

  const getEventStyle = (event: any) => {
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    const startMins = start.getHours() * 60 + start.getMinutes();
    const endMins = end.getHours() * 60 + end.getMinutes();
    return { top: `${(startMins / 60) * 64}px`, height: `${Math.max(((endMins - startMins) / 60) * 64, 24)}px` };
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="py-3 px-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--cal-border)", background: "var(--cal-header-bg)" }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shadow-sm"
          style={{
            backgroundColor: isToday ? "var(--cal-accent)" : "var(--cal-cell-today)",
            color: isToday ? "var(--cal-accent-fg)" : "var(--cal-text)",
          }}>
          {viewDate.getDate()}
        </div>
        <div>
          <div className="font-semibold" style={{ color: "var(--cal-text)" }}>{t(`weekday_${viewDate.getDay()}` as any)}</div>
          <div className="text-xs" style={{ color: "var(--cal-text-muted)" }}>{t(`month_${viewDate.getMonth()}` as any)} {viewDate.getFullYear()}</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="relative" style={{ display: "grid", gridTemplateColumns: "64px 1fr" }}>
          <div>
            {hours.map(h => (
              <div key={h} className="h-16 flex items-start justify-end pr-3 pt-0.5">
                {h > 0 && <span className="text-xs" style={{ color: "var(--cal-text-muted)" }}>{h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h-12} PM`}</span>}
              </div>
            ))}
          </div>
          <div className="relative" style={{ borderLeft: "1px solid var(--cal-border)" }}>
            {hours.map(h => (
              <div key={h} onClick={() => { const d = new Date(viewDate); d.setHours(h,0,0,0); onSlotClick(d); }}
                className="h-16 cursor-pointer transition-colors"
                style={{ borderBottom: "1px solid var(--cal-border)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--cal-cell-today)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}/>
            ))}
            {dayEvents.map(e => {
              const color = getColor(e.color);
              return (
                <div key={e.id} onClick={ev => { ev.stopPropagation(); onEventClick(e); }}
                  style={getEventStyle(e)}
                  className={cn("absolute left-1 right-1 rounded-xl px-3 py-1.5 cursor-pointer hover:opacity-90 transition-opacity overflow-hidden z-10 shadow-sm", color.bg, color.text)}>
                  <div className="font-semibold text-sm leading-tight">{e.title}</div>
                  <div className="text-xs opacity-80 mt-0.5">{formatTime(new Date(e.startAt))} – {formatTime(new Date(e.endAt))}</div>
                  {e.location && <div className="text-xs opacity-70 mt-0.5 flex items-center gap-1"><MapPin size={10}/>{e.location}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Calendar Component ──────────────────────────────────────────────────
export default function Calendar() {
  const [, navigate] = useLocation();
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [selectedDay, setSelectedDay] = useState<Date>(today);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [showEventModal, setShowEventModal] = useState(false);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>(blankForm(today));
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const { t, language } = useLanguage();
  const { theme, themeId, applyTheme } = useCalendarTheme();

  const queryStart = useMemo(() => {
    const d = new Date(viewDate);
    if (viewMode === "month") { d.setDate(1); d.setDate(d.getDate() - 7); }
    else if (viewMode === "week") { d.setDate(d.getDate() - d.getDay() - 1); }
    else { d.setDate(d.getDate() - 1); }
    return d;
  }, [viewDate, viewMode]);

  const queryEnd = useMemo(() => {
    const d = new Date(viewDate);
    if (viewMode === "month") { d.setMonth(d.getMonth() + 1); d.setDate(d.getDate() + 7); }
    else if (viewMode === "week") { d.setDate(d.getDate() - d.getDay() + 8); }
    else { d.setDate(d.getDate() + 2); }
    return d;
  }, [viewDate, viewMode]);

  const eventsQuery = trpc.calendar.list.useQuery(
    { startAt: queryStart.toISOString(), endAt: queryEnd.toISOString() },
    { refetchOnWindowFocus: false }
  );

  const createMutation = trpc.calendar.create.useMutation({
    onSuccess: () => { eventsQuery.refetch(); setShowForm(false); toast.success("Event saved"); },
    onError: () => toast.error("Couldn't save event"),
  });

  const deleteMutation = trpc.calendar.delete.useMutation({
    onSuccess: () => { eventsQuery.refetch(); toast.success("Event deleted"); },
    onError: () => toast.error("Couldn't delete event"),
  });

  const events = eventsQuery.data ?? [];

  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const q = searchQuery.toLowerCase();
    return events.filter(e => e.title.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q));
  }, [events, searchQuery]);

  const navigate_prev = () => {
    setViewDate(d => {
      const n = new Date(d);
      if (viewMode === "month") n.setMonth(n.getMonth() - 1);
      else if (viewMode === "week") n.setDate(n.getDate() - 7);
      else n.setDate(n.getDate() - 1);
      return n;
    });
  };

  const navigate_next = () => {
    setViewDate(d => {
      const n = new Date(d);
      if (viewMode === "month") n.setMonth(n.getMonth() + 1);
      else if (viewMode === "week") n.setDate(n.getDate() + 7);
      else n.setDate(n.getDate() + 1);
      return n;
    });
  };

  const goToToday = () => { setViewDate(new Date()); setSelectedDay(new Date()); };

  /** Sidebar mini-calendar: pick a day and open “new event” with that day pre-filled */
  const handleMiniCalendarSelectDay = (day: Date) => {
    const normalized = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    setSelectedDay(day);
    setViewDate(normalized);
    if (viewMode !== "month") setViewMode("day");
    setForm(blankForm(day));
    setShowForm(true);
  };

  /** Main month grid: click a date → open “new event” with that day pre-filled (times default 9–10am) */
  const handleMonthGridDayClick = (day: Date) => {
    setSelectedDay(day);
    setViewDate(new Date(day.getFullYear(), day.getMonth(), day.getDate()));
    setForm(blankForm(day));
    setShowForm(true);
  };

  const handleSlotClick = (d: Date) => { setForm(blankForm(d)); setShowForm(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }

    const baseStart = new Date(form.startAt);
    const baseEnd = new Date(form.endAt);
    const durationMs = baseEnd.getTime() - baseStart.getTime();
    const dates: Date[] = [baseStart];

    if (form.recurrence !== 'none') {
      const MAX = 52;
      for (let i = 1; i < MAX; i++) {
        const next = new Date(baseStart);
        if (form.recurrence === 'daily') next.setDate(next.getDate() + i);
        else if (form.recurrence === 'weekdays') {
          let added = 0; let offset = 0;
          while (added < i) { offset++; const d = new Date(baseStart); d.setDate(d.getDate() + offset); if (d.getDay() !== 0 && d.getDay() !== 6) added++; }
          next.setDate(baseStart.getDate() + offset);
        }
        else if (form.recurrence === 'weekly') next.setDate(next.getDate() + i * 7);
        else if (form.recurrence === 'monthly') next.setMonth(next.getMonth() + i);
        else if (form.recurrence === 'yearly') { next.setFullYear(next.getFullYear() + i); break; }
        dates.push(next);
      }
    }

    const createAll = async () => {
      for (const startDate of dates) {
        const endDate = new Date(startDate.getTime() + durationMs);
        await createMutation.mutateAsync({
          title: form.title.trim(),
          description: form.description || undefined,
          startAt: startDate.toISOString(),
          endAt: endDate.toISOString(),
          location: form.location || undefined,
          allDay: form.allDay,
          color: form.color,
          reminderMinutes: form.reminderMinutes || undefined,
        });
      }
      eventsQuery.refetch();
      setShowForm(false);
      toast.success(dates.length > 1 ? `${dates.length} recurring events saved` : 'Event saved');
    };
    createAll().catch(() => toast.error("Couldn't save event"));
  };

  const headerTitle = useMemo(() => {
    if (viewMode === "month") return `${t(`month_${viewDate.getMonth()}` as any)} ${viewDate.getFullYear()}`;
    if (viewMode === "week") {
      const start = new Date(viewDate); start.setDate(viewDate.getDate() - viewDate.getDay());
      const end = new Date(start); end.setDate(end.getDate() + 6);
      if (start.getMonth() === end.getMonth()) return `${t(`month_${start.getMonth()}` as any)} ${start.getFullYear()}`;
      return `${t(`month_short_${start.getMonth()}` as any)} – ${t(`month_short_${end.getMonth()}` as any)} ${end.getFullYear()}`;
    }
    return `${t(`weekday_${viewDate.getDay()}` as any)}, ${t(`month_${viewDate.getMonth()}` as any)} ${viewDate.getDate()}`;
  }, [viewDate, viewMode, t]);

  // Inject theme CSS variables on the calendar root
  const themeStyle = theme.vars as React.CSSProperties;

  return (
    <div
      className="min-h-[100dvh] min-h-screen flex flex-col font-['Outfit'] overflow-hidden"
      style={{ ...themeStyle, background: "var(--cal-bg)", color: "var(--cal-text)" }}
    >
      {/* ── Top Header ── */}
      <header className="px-2 sm:px-4 py-1.5 sm:py-2 flex items-center gap-1 sm:gap-2 z-30 shrink-0 backdrop-blur-md"
        style={{ borderBottom: "1px solid var(--cal-border)", background: "var(--cal-header-bg)" }}>
        {/* Back */}
        <button onClick={() => navigate("/")}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)] shrink-0"
          style={{ color: "var(--cal-text-muted)" }}>
          <ArrowLeft size={16}/>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 mr-1 sm:mr-2 shrink-0">
          <CalendarIcon size={20} style={{ color: "var(--cal-accent)" }}/>
          <span className="font-bold text-base hidden lg:block" style={{ color: "var(--cal-text)" }}>Calendar</span>
        </div>

        {/* Today button */}
        <button onClick={goToToday}
          className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors hover:bg-[var(--cal-cell-today)] shrink-0"
          style={{ border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}>
          {t('card_calendar_today')}
        </button>

        {/* Prev / Next */}
        <div className="flex gap-0.5 shrink-0">
          <button onClick={navigate_prev} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)]"
            style={{ color: "var(--cal-text)" }}><ChevronLeft size={14} className="sm:w-4 sm:h-4"/></button>
          <button onClick={navigate_next} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)]"
            style={{ color: "var(--cal-text)" }}><ChevronRight size={14} className="sm:w-4 sm:h-4"/></button>
        </div>

        {/* Title */}
        <h1 className="text-xs sm:text-sm md:text-base font-semibold flex-1 truncate px-1" style={{ color: "var(--cal-text)" }}>{headerTitle}</h1>

        {/* Search */}
        <div className="flex items-center gap-1">
          {showSearch && (
            <motion.input initial={{ width: 0, opacity: 0 }} animate={{ width: window.innerWidth < 640 ? 100 : 180, opacity: 1 }}
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="..." autoFocus
              className="rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm outline-none"
              style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)", color: "var(--cal-text)" }}/>
          )}
          <button onClick={() => { setShowSearch(s => !s); setSearchQuery(""); }}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cal-cell-today)] shrink-0"
            style={{ color: "var(--cal-text-muted)" }}>
            <Search size={16}/>
          </button>
        </div>

        {/* Theme picker */}
        <div className="shrink-0">
          <ThemePicker themeId={themeId} onSelect={applyTheme} t={t}/>
        </div>

        {/* View mode toggle */}
        <div className="flex rounded-lg p-0.5 shrink-0" style={{ background: "var(--cal-cell-today)", border: "1px solid var(--cal-border)" }}>
          {(["month","week","day"] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              className="px-1.5 sm:px-3 py-1 rounded-md text-[10px] sm:text-xs font-semibold capitalize transition-all"
              style={{
                background: viewMode === v ? "var(--cal-cell-bg)" : "transparent",
                color: viewMode === v ? "var(--cal-text)" : "var(--cal-text-muted)",
                boxShadow: viewMode === v ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}>
              {t(`calendar_view_${v}` as any)}
            </button>
          ))}
        </div>

        {/* Add event */}
        <button onClick={() => { setForm(blankForm(selectedDay)); setShowForm(true); }}
          className="flex items-center justify-center w-8 h-8 sm:w-auto sm:px-3.5 sm:py-2 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 shrink-0 shadow-sm"
          style={{ background: "var(--cal-accent)", color: "var(--cal-accent-fg)" }}>
          <Plus size={14}/><span className="hidden sm:inline ml-1.5">{t('calendar_save')}</span>
        </button>
      </header>

      {/* ── Main Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-52 flex flex-col shrink-0 overflow-y-auto hidden md:flex"
          style={{ borderRight: "1px solid var(--cal-border)", background: "var(--cal-sidebar-bg)" }}>
          <MiniCalendar
            viewDate={viewMode === "month" ? viewDate : new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)}
            selectedDay={selectedDay}
            onSelectDay={handleMiniCalendarSelectDay}
            onChangeMonth={d => setViewDate(d)}
            events={events}
            t={t}
          />
          {/* Upcoming events */}
          <div className="px-3 pb-3 mt-2">
            <p className="text-xs font-bold uppercase tracking-widest mb-2 px-1" style={{ color: "var(--cal-text-muted)" }}>{language === 'en' ? 'Upcoming' : 'À venir'}</p>
            {events
              .filter(e => new Date(e.startAt) >= new Date())
              .sort((a,b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
              .slice(0, 5)
              .map(e => {
                const color = getColor(e.color);
                return (
                  <button key={e.id} onClick={() => setSelectedEvent(e)}
                    className="w-full text-left flex items-start gap-2 py-1.5 px-1 rounded-lg transition-colors hover:bg-[var(--cal-cell-today)]">
                    <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", color.dot)}/>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--cal-text)" }}>{e.title}</p>
                      <p className="text-xs" style={{ color: "var(--cal-text-muted)" }}>{new Date(e.startAt).toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR',{month:"short",day:"numeric"})}</p>
                    </div>
                  </button>
                );
              })}
            {events.filter(e => new Date(e.startAt) >= new Date()).length === 0 && (
              <p className="text-xs px-1" style={{ color: "var(--cal-text-muted)" }}>{language === 'en' ? 'No upcoming events' : 'Aucun événement à venir'}</p>
            )}
          </div>
        </aside>

        {/* Calendar view */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div key={`${viewMode}-${viewDate.toDateString()}`} className="flex-1 flex flex-col overflow-hidden"
              initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}>
              {viewMode === "month" && (
                <MonthView viewDate={viewDate} selectedDay={selectedDay} events={filteredEvents}
                  onDayClick={handleMonthGridDayClick} onEventClick={setSelectedEvent} themeId={themeId} t={t}/>
              )}
              {viewMode === "week" && (
                <WeekView viewDate={viewDate} events={filteredEvents}
                  onEventClick={setSelectedEvent} onSlotClick={handleSlotClick} t={t}/>
              )}
              {viewMode === "day" && (
                <DayView viewDate={viewDate} events={filteredEvents}
                  onEventClick={setSelectedEvent} onSlotClick={handleSlotClick} t={t} language={language}/>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showForm && (
          <NewEventModal form={form} setForm={setForm} onSubmit={handleSubmit}
            onClose={() => setShowForm(false)} isPending={createMutation.isPending} t={t}/>
        )}
        {selectedEvent && (
          <EventPopover
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onDelete={id => deleteMutation.mutate({ id })}
            onUpdated={() => eventsQuery.refetch()}
            t={t}
            language={language}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
