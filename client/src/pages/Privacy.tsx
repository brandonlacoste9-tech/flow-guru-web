import React from "react";
import { motion } from "framer-motion";
import { Shield, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function Privacy() {
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
          <Shield className="text-primary w-6 h-6" />
          <h1 className="text-xl font-black uppercase tracking-tighter">Privacy Policy</h1>
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
            At Flow Guru, we believe your data is your sovereignty. We are committed to protecting your privacy through advanced security and transparent data practices.
          </p>

          <div className="mt-10 space-y-8">
            <div>
              <h2 className="text-xl font-bold mb-4">1. Information We Collect</h2>
              <p className="text-muted-foreground leading-relaxed">
                We collect information you provide directly to us, such as when you create an account, connect your calendar (Google/Microsoft), or interact with the AI assistant. This includes your name, email address, and calendar event metadata required for orchestration.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-4">2. How We Use Your Data</h2>
              <p className="text-muted-foreground leading-relaxed">
                Your data is used exclusively to power the Flow Guru AI features:
                <ul className="list-disc pl-5 mt-4 space-y-2">
                  <li>To provide personalized planning and reminders.</li>
                  <li>To synchronize and manage your calendar events.</li>
                  <li>To improve the AI's understanding of your lifestyle preferences (stored in your private Memory).</li>
                </ul>
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-4">3. Data Sovereignty & Security</h2>
              <p className="text-muted-foreground leading-relaxed">
                We do not sell your personal data to third parties. We use industry-standard encryption (AES-256) and secure OAuth protocols to ensure your calendar and message history remain private.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-4">4. Third-Party Integrations</h2>
              <p className="text-muted-foreground leading-relaxed">
                Flow Guru integrates with third-party services like Google Calendar, Microsoft Outlook, and Telegram. Your use of these services is governed by their respective privacy policies.
              </p>
            </div>
          </div>
        </motion.section>

        <footer className="pt-12 border-t border-border/40 text-center">
          <p className="text-xs text-muted-foreground">Last Updated: May 7, 2026</p>
          <p className="text-xs text-muted-foreground mt-2">Contact: support@floguru.com</p>
        </footer>
      </main>
    </div>
  );
}
