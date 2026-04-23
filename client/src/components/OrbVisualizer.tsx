import React from 'react';
import { motion } from 'framer-motion';

interface OrbVisualizerProps {
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
}

export const OrbVisualizer: React.FC<OrbVisualizerProps> = ({ state }) => {
  const variants = {
    idle: {
      scale: [1, 1.05, 1],
      opacity: [0.4, 0.6, 0.4],
      transition: {
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut"
      }
    },
    listening: {
      scale: [1, 1.2, 1],
      opacity: [0.6, 1, 0.6],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut"
      }
    },
    thinking: {
      rotate: 360,
      scale: [1, 0.9, 1],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: "linear"
      }
    },
    speaking: {
      scale: [1, 1.1, 0.95, 1.15, 1],
      opacity: [0.8, 1, 0.8, 1, 0.8],
      transition: {
        duration: 0.8,
        repeat: Infinity,
        ease: "easeInOut"
      }
    }
  };

  const getGlowColor = () => {
    switch (state) {
      case 'listening': return 'rgba(239, 68, 68, 0.5)'; // Red
      case 'thinking': return 'rgba(59, 130, 246, 0.5)'; // Blue
      case 'speaking': return 'rgba(34, 197, 94, 0.5)'; // Green
      default: return 'rgba(147, 51, 234, 0.3)'; // Purple
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
        className="absolute inset-4 rounded-full blur-xl bg-blue-500/20"
        animate={state === 'thinking' ? { rotate: 360 } : {}}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />

      {/* Main Orb */}
      <motion.div
        className="relative w-20 h-20 rounded-full bg-gradient-to-br from-white/20 via-blue-500/40 to-purple-600/40 backdrop-blur-3xl border border-white/30 shadow-[0_0_40px_rgba(59,130,246,0.5)] overflow-hidden"
        variants={variants}
        animate={state}
      >
        {/* Internal Shimmer */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent"
          animate={{
            x: ['-100%', '100%'],
            y: ['-100%', '100%'],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        
        {/* Dynamic Inner core */}
        <motion.div 
          className="absolute inset-[20%] rounded-full bg-white/10 blur-sm"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </motion.div>

      {/* Decorative Rings */}
      <motion.div
        className="absolute inset-0 border border-white/5 rounded-full"
        animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
      />
    </div>
  );
};
