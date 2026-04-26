import React from 'react';
import { motion } from 'framer-motion';

const LoadingScreen = () => {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-[9999]">
      <div className="relative flex items-center justify-center w-32 h-32">
        {/* Outermost gold pulse */}
        <motion.div
          className="absolute rounded-full border border-primary/20"
          style={{ width: '100%', height: '100%' }}
          animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.1, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Inner gold pulse */}
        <motion.div
          className="absolute rounded-full border-2 border-primary/40"
          style={{ width: '70%', height: '70%' }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        />
        {/* Central Logo/Icon placeholder */}
        <motion.div
          className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent shadow-xl flex items-center justify-center relative z-10"
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        >
          <img src="/floguru-logo.png" alt="Loading" className="w-12 h-12 rounded-full object-cover" />
        </motion.div>
      </div>
      
      <motion.div 
        className="mt-8 flex flex-col items-center gap-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <h2 className="text-xl font-bold tracking-widest uppercase text-foreground">FLO GURU</h2>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default LoadingScreen;
