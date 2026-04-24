import React from 'react';
import { motion } from 'framer-motion';

interface OrbVisualizerProps {
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
}

export const OrbVisualizer: React.FC<OrbVisualizerProps> = ({ state }) => {
  const variants = {
    idle: {
      scale: [1, 1.05, 1],
      opacity: [0.6, 0.8, 0.6],
      transition: {
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut" as any
      }
    },
    listening: {
      scale: [1, 1.2, 1],
      opacity: [0.8, 1, 0.8],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut" as any
      }
    },
    thinking: {
      rotate: 360,
      scale: [1, 0.9, 1],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: "linear" as any
      }
    },
    speaking: {
      scale: [1, 1.1, 0.95, 1.15, 1],
      opacity: [0.8, 1, 0.8, 1, 0.8],
      transition: {
        duration: 0.8,
        repeat: Infinity,
        ease: "easeInOut" as any
      }
    }
  };

  const getGlowColor = () => {
    switch (state) {
      case 'listening': return 'rgba(239, 68, 68, 0.3)'; // Red
      case 'thinking': return 'rgba(139, 92, 24, 0.3)'; // Amber/Leather
      case 'speaking': return 'rgba(34, 197, 94, 0.3)'; // Green
      default: return 'rgba(139, 92, 24, 0.15)'; // Soft Leather
    }
  };

  return (
    <div className="relative flex items-center justify-center w-32 h-32 mx-auto mb-8">
      {/* Outer Glows */}
      <motion.div
        className="absolute inset-0 rounded-full blur-2xl"
        animate={{
          backgroundColor: getGlowColor(),
          scale: state === 'listening' ? 1.5 : 1.2
        }}
        transition={{ duration: 0.5 }}
      />
      
      <motion.div
        className="absolute inset-4 rounded-full blur-xl bg-primary/10"
        animate={state === 'thinking' ? { rotate: 360 } : {}}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" as any }}
      />

      {/* Main Orb - Tanned Leather / Amber Glass Aesthetic */}
      <motion.div
        className="relative w-20 h-20 rounded-full bg-gradient-to-br from-white/40 via-primary/30 to-accent/40 backdrop-blur-3xl border border-white/50 shadow-[0_0_40px_rgba(139,92,24,0.3)] overflow-hidden"
        variants={variants as any}
        animate={state}
      >
        {/* Internal Shimmer */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent"
          animate={{
            x: ['-100%', '100%'],
            y: ['-100%', '100%'],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut" as any
          }}
        />
        
        {/* Dynamic Inner core */}
        <motion.div 
          className="absolute inset-[20%] rounded-full bg-white/20 blur-sm"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </motion.div>

      {/* Decorative Rings */}
      <motion.div
        className="absolute inset-0 border border-primary/20 rounded-full"
        animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" as any }}
      />
    </div>
  );
};
