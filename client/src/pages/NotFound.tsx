import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #1a1208 0%, #140c04 100%)" }}
    >
      {/* Leather grain overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <div
        className="relative w-full max-w-md mx-4 rounded-3xl p-8 sm:p-10 text-center"
        style={{
          background: "linear-gradient(160deg, #1e1208 0%, #140c04 100%)",
          border: "1px solid rgba(180,130,60,0.35)",
          boxShadow: "0 0 60px rgba(180,120,30,0.15), 0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Gold corner accents */}
        {[
          "top-3 left-3 border-t-2 border-l-2 rounded-tl-lg",
          "top-3 right-3 border-t-2 border-r-2 rounded-tr-lg",
          "bottom-3 left-3 border-b-2 border-l-2 rounded-bl-lg",
          "bottom-3 right-3 border-b-2 border-r-2 rounded-br-lg",
        ].map((cls, i) => (
          <div
            key={i}
            className={`absolute w-5 h-5 ${cls}`}
            style={{ borderColor: "rgba(200,144,10,0.7)" }}
          />
        ))}

        {/* FLO GURU logo with glow */}
        <div className="flex justify-center mb-6">
          <div
            className="relative w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              background: "radial-gradient(circle, rgba(200,144,10,0.25) 0%, transparent 70%)",
              boxShadow: "0 0 40px rgba(200,144,10,0.3)",
            }}
          >
            <img
              src="/floguru-logo.png"
              alt="FLO GURU"
              className="w-16 h-16 rounded-full object-cover"
              style={{ boxShadow: "0 0 20px rgba(200,144,10,0.4)" }}
            />
          </div>
        </div>

        {/* Gold divider with 404 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, transparent, rgba(200,144,10,0.5))" }} />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(200,144,10,0.8)" }}>404</span>
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to left, transparent, rgba(200,144,10,0.5))" }} />
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-2" style={{ color: "#f0e4cc" }}>
          Page Not Found
        </h1>
        <p className="text-sm leading-relaxed mb-8" style={{ color: "rgba(200,170,120,0.75)" }}>
          The page you're looking for doesn't exist.<br />
          It may have been moved or deleted.
        </p>

        <button
          onClick={() => setLocation("/")}
          className="w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all hover:opacity-90 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #c8900a 0%, #8a5a06 100%)",
            color: "#1a0e04",
            boxShadow: "0 4px 20px rgba(200,144,10,0.35)",
          }}
        >
          Return Home
        </button>
      </div>
    </div>
  );
}
