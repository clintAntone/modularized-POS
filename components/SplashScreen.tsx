import React from 'react';
import Lottie from 'lottie-react';
import splashData from '../src/assets/splash.json';

interface SplashScreenProps {
  message?: string;
  subMessage?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ 
  message = "Initializing Core Systems", 
  subMessage = "Establishing secure connection to master node" 
}) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-6 max-w-xs w-full px-4">
        <div className="w-48 h-48 sm:w-64 sm:h-64">
          <Lottie 
            animationData={splashData} 
            loop={true} 
            autoplay={true}
          />
        </div>
        <div className="text-center space-y-3">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-emerald-600 animate-pulse">
            {message}
          </p>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
            {subMessage}
          </p>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
