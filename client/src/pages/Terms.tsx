import React from "react";
import { motion } from "framer-motion";
import { FileText, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function Terms() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground font-['Outfit'] pb-20">
      <header className="px-6 pt-12 pb-8 flex items-center justify-between max-w-4xl mx-auto">
        <button 
          onClick={() => navigate("/")}
          className="w-10 h-10 rounded-full border border-border flex items-center justify-center bg-card hover:bg-accent/10 transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-3">
          <FileText className="text-primary w-6 h-6" />
          <h1 className="text-xl font-black uppercase tracking-tighter">Terms of Service</h1>
        </div>
        <div className="w-10" />
      </header>

      <main className="px-6 max-w-3xl mx-auto space-y-12">
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="prose prose-invert max-w-none"
        >
          <p className="text-lg text-muted-foreground leading-relaxed">
            Welcome to Flow Guru. By using our application, you agree to the following terms and conditions. Please read them carefully.
          </p>

          <div className="mt-10 space-y-8">
            <div>
              <h2 className="text-xl font-bold mb-4">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing Flow Guru, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree, you are prohibited from using the service.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-4">2. Use License</h2>
              <p className="text-muted-foreground leading-relaxed">
                We grant you a personal, non-exclusive, non-transferable license to use Flow Guru for your own personal organization and productivity purposes. You may not attempt to decompile or reverse engineer any software contained on Flow Guru's platform.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-4">3. AI Service Limitations</h2>
              <p className="text-muted-foreground leading-relaxed">
                Flow Guru uses advanced AI to assist with planning. While we strive for 100% accuracy, the AI may occasionally provide incorrect information. Users are responsible for verifying critical calendar events and reminders.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-4">4. Subscriptions & Payments</h2>
              <p className="text-muted-foreground leading-relaxed">
                Premium features require a paid subscription. All payments are processed securely via Stripe. You may cancel your subscription at any time through the Billing settings.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-4">5. Disclaimer</h2>
              <p className="text-muted-foreground leading-relaxed">
                The services on Flow Guru are provided on an 'as is' basis. Flow Guru makes no warranties, expressed or implied, and hereby disclaims all other warranties including, without limitation, implied warranties of merchantability or fitness for a particular purpose.
              </p>
            </div>
          </div>
        </motion.section>

        <footer className="pt-12 border-t border-border/40 text-center">
          <p className="text-xs text-muted-foreground">Last Updated: May 7, 2026</p>
          <p className="text-xs text-muted-foreground mt-2">Legal: legal@floguru.com</p>
        </footer>
      </main>
    </div>
  );
}
