import { useState } from "react";
import { Eye, EyeOff, X, Loader2 } from "lucide-react";

type View = "signin" | "signup" | "forgot" | "forgot-sent" | "reset-sent";

interface AuthModalProps {
  onClose: () => void;
  onSuccess: (name: string) => void;
  resetToken?: string; // passed when URL has ?reset_token=
}

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
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await callAuth("login", { email, password });
      onSuccess(data.name || email.split("@")[0]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await callAuth("register", { name, email, password, promoCode });
      onSuccess(data.name || name);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await callAuth("forgot-password", { email });
      setView("forgot-sent");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await callAuth("reset-password", { token: resetToken, password: newPassword });
      setView("reset-sent");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-sm mx-4 rounded-2xl bg-[#1a1a2e] border border-white/10 shadow-2xl p-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Logo / title */}
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold text-white tracking-tight">
            {view === "signin" && "Welcome back"}
            {view === "signup" && "Create your account"}
            {view === "forgot" && "Reset your password"}
            {view === "forgot-sent" && "Check your email"}
            {view === "reset-sent" && "Password updated"}
          </h2>
          {view === "signin" && (
            <p className="mt-1 text-sm text-white/50">Sign in to your Flow Guru account</p>
          )}
          {view === "signup" && (
            <p className="mt-1 text-sm text-white/50">Free to use — no credit card required</p>
          )}
        </div>

        {/* SIGN IN */}
        {view === "signin" && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 pr-10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-2.5 text-sm font-semibold text-white transition flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Sign in
            </button>
            <div className="flex items-center justify-between text-xs text-white/40 pt-1">
              <button type="button" onClick={() => { setError(""); setView("forgot"); }} className="hover:text-white/70 transition">
                Forgot password?
              </button>
              <button type="button" onClick={() => { setError(""); setView("signup"); }} className="hover:text-white/70 transition">
                Create account
              </button>
            </div>
          </form>
        )}

        {/* SIGN UP */}
        {view === "signup" && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Your name</label>
              <input
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition"
                placeholder="Brandon"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 pr-10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition"
                  placeholder="Min. 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">
                Promo code <span className="text-white/30">(optional)</span>
              </label>
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition"
                placeholder="EARLYBIRD"
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-2.5 text-sm font-semibold text-white transition flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Create account
            </button>
            <p className="text-center text-xs text-white/40 pt-1">
              Already have an account?{" "}
              <button type="button" onClick={() => { setError(""); setView("signin"); }} className="text-indigo-400 hover:text-indigo-300 transition">
                Sign in
              </button>
            </p>
          </form>
        )}

        {/* FORGOT PASSWORD */}
        {view === "forgot" && (
          <form onSubmit={handleForgot} className="space-y-4">
            <p className="text-sm text-white/50">Enter your email and we'll send you a reset link.</p>
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition"
                placeholder="you@example.com"
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-2.5 text-sm font-semibold text-white transition flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Send reset link
            </button>
            <button type="button" onClick={() => { setError(""); setView("signin"); }} className="w-full text-center text-xs text-white/40 hover:text-white/70 transition pt-1">
              Back to sign in
            </button>
          </form>
        )}

        {/* FORGOT SENT */}
        {view === "forgot-sent" && (
          <div className="text-center space-y-4">
            <p className="text-sm text-white/60">
              If an account exists for <strong className="text-white">{email}</strong>, you'll receive a reset link shortly.
            </p>
            <button
              onClick={() => { setView("signin"); }}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 py-2.5 text-sm font-semibold text-white transition"
            >
              Back to sign in
            </button>
          </div>
        )}

        {/* RESET PASSWORD (when reset_token in URL) */}
        {view === "reset-sent" && resetToken && (
          <form onSubmit={handleReset} className="space-y-4">
            <p className="text-sm text-white/50">Enter your new password below.</p>
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">New password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 pr-10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition"
                  placeholder="Min. 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
                >
                  {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-2.5 text-sm font-semibold text-white transition flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Update password
            </button>
          </form>
        )}

        {/* RESET DONE */}
        {view === "reset-sent" && !resetToken && (
          <div className="text-center space-y-4">
            <p className="text-sm text-white/60">Your password has been updated. You can now sign in.</p>
            <button
              onClick={() => setView("signin")}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 py-2.5 text-sm font-semibold text-white transition"
            >
              Sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
