import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, MapPin, Clock, Trash2,
  ArrowLeft, Calendar as CalendarIcon, AlignLeft, Search, RefreshCw, Bell
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { useLocation } from "wouter";

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const EVENT_COLORS = [
  { id: "blue",   label: "Blueberry",  bg: "bg-blue-500",   text: "text-white",  dot: "bg-blue-500",   light: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { id: "green",  label: "Sage",       bg: "bg-emerald-500",text: "text-white",  dot: "bg-emerald-500",light: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { id: "red",    label: "Tomato",     bg: "bg-red-500",    text: "text-white",  dot: "bg-red-500",    light: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  { id: "yellow", label: "Banana",     bg: "bg-yellow-400", text: "text-gray-900",dot:"bg-yellow-400", light: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  { id: "purple", label: "Grape",      bg: "bg-purple-500", text: "text-white",  dot: "bg-purple-500", light: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  { id: "pink",   label: "Flamingo",   bg: "bg-pink-400",   text: "text-white",  dot: "bg-pink-400",   light: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300" },
  { id: "orange", label: "Tangerine",  bg: "bg-orange-400", text: "text-white",  dot: "bg-orange-400", light: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  { id: "teal",   label: "Peacock",    bg: "bg-teal-500",   text: "text-white",  dot: "bg-teal-500",   light: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300" },
];

function getColor(colorId?: string | null) {
  return EVENT_COLORS.find(c => c.id === colorId) ?? EVENT_COLORS[0];
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
  reminderMinutes: string; // comma-separated, e.g. '30,15,5'
};

const blankForm = (day: Date): EventForm => {
  const start = new Date(day);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(10, 0, 0, 0);
  return { title: "", description: "", startAt: formatDatetimeLocal(start), endAt: formatDatetimeLocal(end), location: "", allDay: false, color: "blue", recurrence: "none", reminderMinutes: "30,15,5" };
};

// ─── Mini Calendar (sidebar) ──────────────────────────────────────────────────
function MiniCalendar({ viewDate, selectedDay, onSelectDay, onChangeMonth, events }: {
  viewDate: Date; selectedDay: Date; onSelectDay: (d: Date) => void;
  onChangeMonth: (d: Date) => void; events: any[];
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
        <span className="text-sm font-semibold text-foreground">{MONTHS_SHORT[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
        <div className="flex gap-1">
          <button onClick={() => onChangeMonth(new Date(viewDate.getFullYear(), viewDate.getMonth()-1,1))} className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent transition-colors"><ChevronLeft size={12}/></button>
          <button onClick={() => onChangeMonth(new Date(viewDate.getFullYear(), viewDate.getMonth()+1,1))} className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent transition-colors"><ChevronRight size={12}/></button>
        </div>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS_SHORT.map(d => <div key={d} className="text-center text-[9px] font-semibold text-muted-foreground py-0.5">{d[0]}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {days.map((day, i) => {
          const isCurrentMonth = day.getMonth() === viewDate.getMonth();
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDay);
          const hasDot = hasEvent(day);
          return (
            <button key={i} onClick={() => onSelectDay(day)}
              className={cn("relative w-7 h-7 mx-auto flex items-center justify-center rounded-full text-[11px] transition-colors",
                !isCurrentMonth && "text-muted-foreground/40",
                isToday && !isSelected && "text-primary font-bold",
                isSelected && "bg-primary text-primary-foreground font-bold",
                !isSelected && isCurrentMonth && "hover:bg-accent",
              )}>
              {day.getDate()}
              {hasDot && !isSelected && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary/60"/>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Event Detail Popover ─────────────────────────────────────────────────────
function EventPopover({ event, onClose, onDelete }: { event: any; onClose: () => void; onDelete: (id: number) => void }) {
  const color = getColor(event.color);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className={cn("h-2 w-full", color.bg)} />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <h3 className="text-lg font-bold leading-tight flex-1">{event.title}</h3>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => { onDelete(event.id); onClose(); }}
                className="w-8 h-8 rounded-full hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors text-muted-foreground">
                <Trash2 size={14}/>
              </button>
              <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-accent flex items-center justify-center transition-colors text-muted-foreground">
                <X size={14}/>
              </button>
            </div>
          </div>
          <div className="space-y-2.5">
            {!event.allDay && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Clock size={14} className="shrink-0 text-primary/70"/>
                <span>{new Date(event.startAt).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})} · {formatTime(new Date(event.startAt))} – {formatTime(new Date(event.endAt))}</span>
              </div>
            )}
            {event.allDay === 1 && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <CalendarIcon size={14} className="shrink-0 text-primary/70"/>
                <span>{new Date(event.startAt).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})} · All day</span>
              </div>
            )}
            {event.location && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <MapPin size={14} className="shrink-0 text-primary/70"/>
                <span>{event.location}</span>
              </div>
            )}
            {event.description && (
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <AlignLeft size={14} className="shrink-0 mt-0.5 text-primary/70"/>
                <span className="leading-relaxed">{event.description}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── New Event Modal ──────────────────────────────────────────────────────────
function NewEventModal({ form, setForm, onSubmit, onClose, isPending }: {
  form: EventForm; setForm: (f: EventForm) => void;
  onSubmit: (e: React.FormEvent) => void; onClose: () => void; isPending: boolean;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => titleRef.current?.focus(), 50); }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.97 }}
        className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Color bar */}
        <div className={cn("h-1.5 w-full transition-colors", getColor(form.color).bg)} />
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold">New event</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-accent flex items-center justify-center transition-colors text-muted-foreground"><X size={15}/></button>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Title */}
            <input ref={titleRef} value={form.title} onChange={e => setForm({...form, title: e.target.value})}
              placeholder="Add title" required
              className="w-full text-xl font-semibold bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none pb-2 placeholder:text-muted-foreground/50 transition-colors"/>

            {/* All day toggle */}
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setForm({...form, allDay: !form.allDay})}
                className={cn("relative w-10 h-5 rounded-full transition-colors", form.allDay ? "bg-primary" : "bg-muted")}>
                <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all", form.allDay ? "left-5" : "left-0.5")}/>
              </button>
              <span className="text-sm text-muted-foreground">All day</span>
            </div>

            {/* Date/time */}
            {!form.allDay ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Start</label>
                  <input type="datetime-local" value={form.startAt} onChange={e => setForm({...form, startAt: e.target.value})}
                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"/>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">End</label>
                  <input type="datetime-local" value={form.endAt} onChange={e => setForm({...form, endAt: e.target.value})}
                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"/>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                <input type="date" value={form.startAt.split("T")[0]} onChange={e => setForm({...form, startAt: e.target.value+"T09:00", endAt: e.target.value+"T10:00"})}
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"/>
              </div>
            )}

            {/* Location */}
            <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2">
              <MapPin size={14} className="text-muted-foreground shrink-0"/>
              <input value={form.location} onChange={e => setForm({...form, location: e.target.value})}
                placeholder="Add location" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"/>
            </div>

            {/* Description */}
            <div className="flex items-start gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2">
              <AlignLeft size={14} className="text-muted-foreground shrink-0 mt-0.5"/>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Add description" rows={2}
                className="flex-1 bg-transparent text-sm outline-none resize-none placeholder:text-muted-foreground/50"/>
            </div>

            {/* Recurrence */}
            <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2">
              <RefreshCw size={14} className="text-muted-foreground shrink-0"/>
              <select value={form.recurrence} onChange={e => setForm({...form, recurrence: e.target.value as RecurrenceType})}
                className="flex-1 bg-transparent text-sm outline-none text-foreground">
                <option value="none">Does not repeat</option>
                <option value="daily">Every day</option>
                <option value="weekdays">Every weekday (Mon–Fri)</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
                <option value="yearly">Every year</option>
              </select>
            </div>

            {/* Reminder time */}
            <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2">
              <Bell size={14} className="text-muted-foreground shrink-0"/>
              <select value={form.reminderMinutes} onChange={e => setForm({...form, reminderMinutes: e.target.value})}
                className="flex-1 bg-transparent text-sm outline-none text-foreground">
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
              <label className="text-xs text-muted-foreground mb-2 block">Color</label>
              <div className="flex gap-2 flex-wrap">
                {EVENT_COLORS.map(c => (
                  <button key={c.id} type="button" onClick={() => setForm({...form, color: c.id})}
                    className={cn("w-6 h-6 rounded-full transition-all", c.bg, form.color === c.id ? "ring-2 ring-offset-2 ring-offset-card ring-foreground scale-110" : "hover:scale-110")}>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={isPending}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
                {isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────
function MonthView({ viewDate, selectedDay, events, onDayClick, onEventClick }: {
  viewDate: Date; selectedDay: Date; events: any[];
  onDayClick: (d: Date) => void; onEventClick: (e: any) => void;
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
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS_SHORT.map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {d}
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
          return (
            <div key={i} onClick={() => onDayClick(day)}
              className={cn("border-b border-r border-border p-1 cursor-pointer hover:bg-accent/30 transition-colors overflow-hidden",
                !isCurrentMonth && "bg-muted/20",
                isSelected && "bg-primary/5",
              )}>
              <div className="flex justify-center mb-1">
                <span className={cn("w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium transition-colors",
                  isToday && "bg-primary text-primary-foreground font-bold",
                  isSelected && !isToday && "bg-primary/15 text-primary font-bold",
                  !isCurrentMonth && "text-muted-foreground/50",
                )}>
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(e => {
                  const color = getColor(e.color);
                  return (
                    <div key={e.id} onClick={ev => { ev.stopPropagation(); onEventClick(e); }}
                      className={cn("text-[10px] leading-tight truncate px-1.5 py-0.5 rounded-md font-medium cursor-pointer hover:opacity-80 transition-opacity", color.light)}>
                      {!e.allDay && <span className="opacity-70 mr-1">{formatTime(new Date(e.startAt)).replace(":00","")}</span>}
                      {e.title}
                    </div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pl-1 font-medium">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────
function WeekView({ viewDate, events, onEventClick, onSlotClick }: {
  viewDate: Date; events: any[]; onEventClick: (e: any) => void; onSlotClick: (d: Date) => void;
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
    const top = (startMins / 60) * 56;
    const height = Math.max(((endMins - startMins) / 60) * 56, 20);
    return { top: `${top}px`, height: `${height}px` };
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Day headers */}
      <div className="grid border-b border-border" style={{gridTemplateColumns: "56px repeat(7, 1fr)"}}>
        <div className="py-2"/>
        {weekDays.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <div key={i} className="py-2 text-center">
              <div className="text-xs font-semibold text-muted-foreground uppercase">{WEEKDAYS_SHORT[d.getDay()]}</div>
              <div className={cn("w-8 h-8 mx-auto mt-0.5 flex items-center justify-center rounded-full text-sm font-bold",
                isToday ? "bg-primary text-primary-foreground" : "text-foreground")}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative grid" style={{gridTemplateColumns: "56px repeat(7, 1fr)"}}>
          {/* Hour labels */}
          <div className="col-start-1">
            {hours.map(h => (
              <div key={h} className="h-14 flex items-start justify-end pr-2 pt-0.5">
                {h > 0 && <span className="text-[10px] text-muted-foreground">{h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h-12} PM`}</span>}
              </div>
            ))}
          </div>
          {/* Day columns */}
          {weekDays.map((day, di) => (
            <div key={di} className="relative border-l border-border">
              {hours.map(h => (
                <div key={h} onClick={() => { const d = new Date(day); d.setHours(h,0,0,0); onSlotClick(d); }}
                  className="h-14 border-b border-border/50 hover:bg-accent/20 cursor-pointer transition-colors"/>
              ))}
              {/* Events */}
              {eventsOnDay(day).map(e => {
                const color = getColor(e.color);
                const style = getEventStyle(e);
                return (
                  <div key={e.id} onClick={ev => { ev.stopPropagation(); onEventClick(e); }}
                    style={style}
                    className={cn("absolute left-0.5 right-0.5 rounded-lg px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer hover:opacity-90 transition-opacity overflow-hidden z-10", color.bg, color.text)}>
                    {e.title}
                    <div className="text-[9px] opacity-80">{formatTime(new Date(e.startAt))}</div>
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
function DayView({ viewDate, events, onEventClick, onSlotClick }: {
  viewDate: Date; events: any[]; onEventClick: (e: any) => void; onSlotClick: (d: Date) => void;
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
    const top = (startMins / 60) * 64;
    const height = Math.max(((endMins - startMins) / 60) * 64, 24);
    return { top: `${top}px`, height: `${height}px` };
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Day header */}
      <div className="border-b border-border py-3 px-4 flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold",
          isToday ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
          {viewDate.getDate()}
        </div>
        <div>
          <div className="font-semibold">{WEEKDAYS_FULL[viewDate.getDay()]}</div>
          <div className="text-xs text-muted-foreground">{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</div>
        </div>
      </div>
      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative" style={{display:"grid", gridTemplateColumns:"64px 1fr"}}>
          <div>
            {hours.map(h => (
              <div key={h} className="h-16 flex items-start justify-end pr-3 pt-0.5">
                {h > 0 && <span className="text-[11px] text-muted-foreground">{h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h-12} PM`}</span>}
              </div>
            ))}
          </div>
          <div className="relative border-l border-border">
            {hours.map(h => (
              <div key={h} onClick={() => { const d = new Date(viewDate); d.setHours(h,0,0,0); onSlotClick(d); }}
                className="h-16 border-b border-border/50 hover:bg-accent/20 cursor-pointer transition-colors"/>
            ))}
            {dayEvents.map(e => {
              const color = getColor(e.color);
              const style = getEventStyle(e);
              return (
                <div key={e.id} onClick={ev => { ev.stopPropagation(); onEventClick(e); }}
                  style={style}
                  className={cn("absolute left-1 right-1 rounded-xl px-3 py-1.5 cursor-pointer hover:opacity-90 transition-opacity overflow-hidden z-10 shadow-sm", color.bg, color.text)}>
                  <div className="font-semibold text-sm leading-tight">{e.title}</div>
                  <div className="text-[11px] opacity-80 mt-0.5">{formatTime(new Date(e.startAt))} – {formatTime(new Date(e.endAt))}</div>
                  {e.location && <div className="text-[11px] opacity-70 mt-0.5 flex items-center gap-1"><MapPin size={9}/>{e.location}</div>}
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
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>(blankForm(today));
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Query range based on view
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

  const handleDayClick = (day: Date) => {
    setSelectedDay(day);
    if (viewMode === "month") setViewDate(new Date(day.getFullYear(), day.getMonth(), day.getDate()));
  };

  const handleSlotClick = (d: Date) => {
    setForm(blankForm(d));
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }

    const baseStart = new Date(form.startAt);
    const baseEnd = new Date(form.endAt);
    const durationMs = baseEnd.getTime() - baseStart.getTime();

    // Generate recurring dates (up to 52 occurrences / 1 year)
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
        else if (form.recurrence === 'monthly') { next.setMonth(next.getMonth() + i); }
        else if (form.recurrence === 'yearly') { next.setFullYear(next.getFullYear() + i); break; /* only 1 year ahead */ }
        dates.push(next);
      }
    }

    // Create all occurrences sequentially
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
    if (viewMode === "month") return `${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
    if (viewMode === "week") {
      const start = new Date(viewDate); start.setDate(viewDate.getDate() - viewDate.getDay());
      const end = new Date(start); end.setDate(end.getDate() + 6);
      if (start.getMonth() === end.getMonth()) return `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
      return `${MONTHS_SHORT[start.getMonth()]} – ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
    }
    return `${WEEKDAYS_FULL[viewDate.getDay()]}, ${MONTHS[viewDate.getMonth()]} ${viewDate.getDate()}`;
  }, [viewDate, viewMode]);

  return (
    <div className="h-screen bg-background text-foreground flex flex-col font-['Outfit'] overflow-hidden">
      {/* ── Top Header ── */}
      <header className="px-4 py-2 flex items-center gap-2 border-b border-border bg-card/80 backdrop-blur-md z-30 shrink-0">
        {/* Back */}
        <button onClick={() => navigate("/")}
          className="w-9 h-9 rounded-full hover:bg-accent flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground shrink-0">
          <ArrowLeft size={16}/>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 mr-2">
          <CalendarIcon size={20} className="text-primary"/>
          <span className="font-bold text-base hidden sm:block">Calendar</span>
        </div>

        {/* Today button */}
        <button onClick={goToToday}
          className="px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors shrink-0">
          Today
        </button>

        {/* Prev / Next */}
        <div className="flex gap-0.5">
          <button onClick={navigate_prev} className="w-8 h-8 rounded-full hover:bg-accent flex items-center justify-center transition-colors"><ChevronLeft size={16}/></button>
          <button onClick={navigate_next} className="w-8 h-8 rounded-full hover:bg-accent flex items-center justify-center transition-colors"><ChevronRight size={16}/></button>
        </div>

        {/* Title */}
        <h1 className="text-base font-semibold flex-1 truncate">{headerTitle}</h1>

        {/* Search */}
        <div className="flex items-center gap-1">
          {showSearch && (
            <motion.input initial={{ width: 0, opacity: 0 }} animate={{ width: 180, opacity: 1 }}
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search events…" autoFocus
              className="bg-muted/60 border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"/>
          )}
          <button onClick={() => { setShowSearch(s => !s); setSearchQuery(""); }}
            className="w-9 h-9 rounded-full hover:bg-accent flex items-center justify-center transition-colors text-muted-foreground">
            <Search size={16}/>
          </button>
        </div>

        {/* View mode toggle */}
        <div className="flex bg-muted rounded-lg p-0.5 shrink-0">
          {(["month","week","day"] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              className={cn("px-3 py-1 rounded-md text-xs font-semibold capitalize transition-all",
                viewMode === v ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {v}
            </button>
          ))}
        </div>

        {/* Add event */}
        <button onClick={() => { setForm(blankForm(selectedDay)); setShowForm(true); }}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:opacity-90 transition-opacity shrink-0">
          <Plus size={14}/><span className="hidden sm:inline">New</span>
        </button>
      </header>

      {/* ── Main Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-52 border-r border-border bg-card/50 flex flex-col shrink-0 overflow-y-auto hidden md:flex">
          <MiniCalendar
            viewDate={viewMode === "month" ? viewDate : new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)}
            selectedDay={selectedDay}
            onSelectDay={d => { handleDayClick(d); if (viewMode !== "month") setViewMode("day"); }}
            onChangeMonth={d => setViewDate(d)}
            events={events}
          />
          {/* Upcoming events */}
          <div className="px-3 pb-3 mt-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">Upcoming</p>
            {events
              .filter(e => new Date(e.startAt) >= new Date())
              .sort((a,b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
              .slice(0, 5)
              .map(e => {
                const color = getColor(e.color);
                return (
                  <button key={e.id} onClick={() => setSelectedEvent(e)}
                    className="w-full text-left flex items-start gap-2 py-1.5 px-1 rounded-lg hover:bg-accent transition-colors group">
                    <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", color.dot)}/>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{e.title}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(e.startAt).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</p>
                    </div>
                  </button>
                );
              })}
            {events.filter(e => new Date(e.startAt) >= new Date()).length === 0 && (
              <p className="text-xs text-muted-foreground px-1">No upcoming events</p>
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
                  onDayClick={handleDayClick} onEventClick={setSelectedEvent}/>
              )}
              {viewMode === "week" && (
                <WeekView viewDate={viewDate} events={filteredEvents}
                  onEventClick={setSelectedEvent} onSlotClick={handleSlotClick}/>
              )}
              {viewMode === "day" && (
                <DayView viewDate={viewDate} events={filteredEvents}
                  onEventClick={setSelectedEvent} onSlotClick={handleSlotClick}/>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showForm && (
          <NewEventModal form={form} setForm={setForm} onSubmit={handleSubmit}
            onClose={() => setShowForm(false)} isPending={createMutation.isPending}/>
        )}
        {selectedEvent && (
          <EventPopover event={selectedEvent} onClose={() => setSelectedEvent(null)}
            onDelete={id => deleteMutation.mutate({ id })}/>
        )}
      </AnimatePresence>
    </div>
  );
}
