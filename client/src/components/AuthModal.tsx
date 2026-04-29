import { useState } from "react";
import { Eye, EyeOff, X, Loader2 } from "lucide-react";

type View = "signin" | "signup" | "forgot" | "forgot-sent" | "reset-sent";

interface AuthModalProps {
  onClose: () => void;
  onSuccess: (name: string) => void;
  resetToken?: string;
}

// Shared leather-style classes
const leatherInput =
  "w-full rounded-xl px-4 py-2.5 text-sm transition focus:outline-none " +
  "placeholder-[#7a5c38] " +
  "text-[#f0e4cc] " +
  "bg-[#1e1208] " +
  "border border-[#6b4a22] " +
  "focus:border-[#c8900a] focus:ring-1 focus:ring-[#c8900a]/40";

const leatherLabel = "block text-xs font-semibold uppercase tracking-widest mb-1.5 text-[#a07840]";

const leatherBtn =
  "w-full rounded-xl py-3 text-sm font-bold uppercase tracking-widest transition flex items-center justify-center gap-2 " +
  "bg-gradient-to-b from-[#c8900a] to-[#9a6a08] " +
  "text-[#1e1208] " +
  "hover:from-[#e0a820] hover:to-[#b07a10] " +
  "disabled:opacity-50 " +
  "shadow-lg shadow-[#c8900a]/30";

const leatherLink = "text-[#c8900a] hover:text-[#e0a820] transition font-semibold";

export function AuthModal({ onClose, onSuccess, resetToken }: AuthModalProps) {
  const [view, setView] = useState<View>(resetToken ? "reset-sent" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function callAuth(action: string, body: object) {
    const res = await fetch(`/api/auth/email?action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try { const data = await callAuth("login", { email, password, promoCode }); onSuccess(data.name || email.split("@")[0]); }
    catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try { const data = await callAuth("register", { name, email, password, promoCode }); onSuccess(data.name || name); }
    catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try { await callAuth("forgot-password", { email }); setView("forgot-sent"); }
    catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try { await callAuth("reset-password", { token: resetToken, password: newPassword }); setView("reset-sent"); }
    catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,6,2,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Card */}
      <div
        className="relative w-full max-w-sm mx-4 rounded-2xl p-7 shadow-2xl"
        style={{
          background: 'linear-gradient(160deg, #1e1208 0%, #140c04 60%, #1a1008 100%)',
          border: '1.5px solid #6b4a22',
          boxShadow: '0 0 0 1px rgba(200,144,10,0.15), 0 8px 48px rgba(0,0,0,0.7), 0 0 40px rgba(180,120,10,0.12)',
        }}
      >
        {/* Gold corner accents */}
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-[#c8900a]/60 rounded-tl-2xl pointer-events-none" />
        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-[#c8900a]/60 rounded-tr-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-[#c8900a]/60 rounded-bl-2xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-[#c8900a]/60 rounded-br-2xl pointer-events-none" />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#7a5c38] hover:text-[#c8900a] transition-colors"
        >
          <X size={18} />
        </button>

        {/* Logo + title */}
        <div className="mb-6 text-center">
          {/* Logo with gold glow */}
          <div className="relative flex justify-center mb-4">
            <div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: '110px', height: '110px',
                background: 'radial-gradient(circle, rgba(212,160,23,0.5) 0%, rgba(180,120,10,0.25) 45%, transparent 70%)',
                filter: 'blur(18px)',
              }}
            />
            <div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: '80px', height: '80px',
                background: 'radial-gradient(circle, rgba(255,200,50,0.6) 0%, rgba(210,150,20,0.3) 50%, transparent 70%)',
                filter: 'blur(8px)',
              }}
            />
            <img
              src="/floguru-logo.png"
              alt="FLO GURU"
              width={80}
              height={80}
              fetchPriority="high"
              decoding="async"
              className="relative w-20 h-20 rounded-full object-cover"
              style={{ boxShadow: '0 0 20px 6px rgba(212,160,23,0.55), 0 0 40px 12px rgba(180,120,10,0.3)' }}
            />
          </div>

          {/* Decorative divider */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[#6b4a22]" />
            <span className="text-[#c8900a] text-xs font-bold tracking-[0.3em] uppercase">
              {view === "signin" && "Welcome Back"}
              {view === "signup" && "Join FLO GURU"}
              {view === "forgot" && "Reset Password"}
              {view === "forgot-sent" && "Check Email"}
              {view === "reset-sent" && "All Done"}
            </span>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[#6b4a22]" />
          </div>

          {view === "signin" && (
            <p className="text-xs text-[#7a5c38] tracking-wide">Sign in to your FLO GURU account</p>
          )}
          {view === "signup" && (
            <p className="text-xs text-[#7a5c38] tracking-wide">Free to use — no credit card required</p>
          )}
        </div>

        {/* SIGN IN */}
        {view === "signin" && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className={leatherLabel}>Email</label>
              <input type="email" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} className={leatherInput} placeholder="you@example.com" />
            </div>
            <div>
              <label className={leatherLabel}>Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} required autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className={leatherInput + " pr-10"} placeholder="••••••••" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a5c38] hover:text-[#c8900a] transition">
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className={leatherLabel}>
                Promo code <span className="text-[#5a3c18] normal-case tracking-normal font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                className={leatherInput}
                placeholder="GURU1976"
                autoComplete="off"
              />
            </div>
            {error && <p className="text-red-400 text-xs bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className={leatherBtn}>
              {loading && <Loader2 size={14} className="animate-spin" />}
              Sign In
            </button>
            <div className="flex items-center justify-between text-xs text-[#7a5c38] pt-1">
              <button type="button" onClick={() => { setError(""); setView("forgot"); }} className={leatherLink}>
                Forgot password?
              </button>
              <button type="button" onClick={() => { setError(""); setView("signup"); }} className={leatherLink}>
                Create account
              </button>
            </div>
          </form>
        )}

        {/* SIGN UP */}
        {view === "signup" && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className={leatherLabel}>Your name</label>
              <input type="text" autoComplete="name" value={name}
                onChange={(e) => setName(e.target.value)} className={leatherInput} placeholder="Brandon" />
            </div>
            <div>
              <label className={leatherLabel}>Email</label>
              <input type="email" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} className={leatherInput} placeholder="you@example.com" />
            </div>
            <div>
              <label className={leatherLabel}>Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} required autoComplete="new-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className={leatherInput + " pr-10"} placeholder="Min. 8 characters" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a5c38] hover:text-[#c8900a] transition">
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className={leatherLabel}>
                Promo code <span className="text-[#5a3c18] normal-case tracking-normal font-normal">(optional)</span>
              </label>
              <input type="text" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                className={leatherInput} placeholder="EARLYBIRD" />
            </div>
            {error && <p className="text-red-400 text-xs bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className={leatherBtn}>
              {loading && <Loader2 size={14} className="animate-spin" />}
              Create Account
            </button>
            <p className="text-center text-xs text-[#7a5c38] pt-1">
              Already have an account?{" "}
              <button type="button" onClick={() => { setError(""); setView("signin"); }} className={leatherLink}>
                Sign in
              </button>
            </p>
          </form>
        )}

        {/* FORGOT PASSWORD */}
        {view === "forgot" && (
          <form onSubmit={handleForgot} className="space-y-4">
            <p className="text-sm text-[#7a5c38]">Enter your email and we'll send you a reset link.</p>
            <div>
              <label className={leatherLabel}>Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className={leatherInput} placeholder="you@example.com" />
            </div>
            {error && <p className="text-red-400 text-xs bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className={leatherBtn}>
              {loading && <Loader2 size={14} className="animate-spin" />}
              Send Reset Link
            </button>
            <button type="button" onClick={() => { setError(""); setView("signin"); }}
              className="w-full text-center text-xs text-[#7a5c38] hover:text-[#c8900a] transition pt-1">
              Back to sign in
            </button>
          </form>
        )}

        {/* FORGOT SENT */}
        {view === "forgot-sent" && (
          <div className="text-center space-y-4">
            <p className="text-sm text-[#a07840]">
              If an account exists for <strong className="text-[#f0e4cc]">{email}</strong>, you'll receive a reset link shortly.
            </p>
            <button onClick={() => setView("signin")} className={leatherBtn}>
              Back to Sign In
            </button>
          </div>
        )}

        {/* RESET PASSWORD */}
        {view === "reset-sent" && resetToken && (
          <form onSubmit={handleReset} className="space-y-4">
            <p className="text-sm text-[#7a5c38]">Enter your new password below.</p>
            <div>
              <label className={leatherLabel}>New password</label>
              <div className="relative">
                <input type={showNewPassword ? "text" : "password"} required value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={leatherInput + " pr-10"} placeholder="Min. 8 characters" />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a5c38] hover:text-[#c8900a] transition">
                  {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {error && <p className="text-red-400 text-xs bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className={leatherBtn}>
              {loading && <Loader2 size={14} className="animate-spin" />}
              Update Password
            </button>
          </form>
        )}

        {/* RESET DONE */}
        {view === "reset-sent" && !resetToken && (
          <div className="text-center space-y-4">
            <p className="text-sm text-[#a07840]">Your password has been updated. You can now sign in.</p>
            <button onClick={() => setView("signin")} className={leatherBtn}>
              Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
