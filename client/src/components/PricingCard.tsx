import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Sparkles, Loader2 } from 'lucide-react';

const PricingCard = ({ userId, isPremium = false }: { userId?: number, isPremium?: boolean }) => {
  const [loading, setLoading] = useState(false);

  const handleAction = async () => {
    if (!userId) {
      window.location.href = '/login'; 
      return;
    }

    setLoading(true);
    try {
      const endpoint = isPremium ? '/api/stripe/create-portal' : '/api/stripe/create-checkout';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, plan: 'premium' }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to initiate session.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error.');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    "Full Autonomous Orchestration",
    "Private Long-term Memory",
    "Cross-platform Sync (Mobile/Web)",
    "Priority AI Response Time",
    "Early Access to New Skills",
    "Premium Leather Themes"
  ];

  return (
    <div className="w-full max-w-lg mx-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="relative p-8 rounded-[3rem] border-2 border-primary/30 bg-card/50 backdrop-blur-2xl shadow-2xl overflow-hidden group leather-glow"
      >
        {/* Animated Background Glow */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/20 blur-[100px] group-hover:bg-primary/30 transition-all duration-700" />
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                Flow Guru Premium
                {isPremium && <div className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] uppercase font-bold tracking-widest">Active</div>}
                <Sparkles size={18} className="text-primary animate-pulse" />
              </h3>
              <p className="text-muted-foreground text-sm">One plan. Unlimited potential.</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-black text-primary">$5</div>
              <div className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">per month</div>
            </div>
          </div>

          <div className="space-y-4 mb-10">
            {features.map((feature, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                  <Check size={12} />
                </div>
                <span className="text-foreground/80">{feature}</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleAction}
            disabled={loading}
            className="w-full py-5 bg-primary text-primary-foreground rounded-2xl font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-3"
          >
            {loading ? (
              <Loader2 size={24} className="animate-spin" />
            ) : (
              <>
                {isPremium ? 'Manage Subscription' : 'Upgrade Now'}
                <Sparkles size={20} />
              </>
            )}
          </button>
          
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {isPremium ? 'Manage your billing via Stripe Portal.' : 'Secure payment via Stripe. Cancel anytime.'}
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default PricingCard;
