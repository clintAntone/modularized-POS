
/**
 * UI Sound Utility using a Singleton Web Audio API Context
 * Optimized for mobile "User Gesture" requirements.
 */

let audioCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioCtx) {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
};

/**
 * Browsers block audio until a user gesture occurs.
 * This is now called silently on primary interactions to keep the context warm.
 */
export const resumeAudioContext = async () => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  } catch (e) {
    // Silent catch for audio context issues
  }
};

const makeNote = (ctx: AudioContext, freq: number, startTime: number, duration: number, volume: number, oscType: OscillatorType = 'triangle') => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = oscType;
  filter.type = 'lowpass';
  filter.frequency.value = 2000;

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
};

export const playSound = (type: 'success' | 'warning' | 'click' | 'delete' | 'deposit') => {
  try {
    const ctx = getAudioContext();

    // For click, fire synchronously — no async resume to avoid queuing delay on rapid taps
    if (type === 'click') {
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      makeNote(ctx, 420, now, 0.06, 0.04);
      return;
    }

    // For all other sounds, resume context if needed then play
    const playAsync = async () => {
      if (ctx.state === 'suspended') await ctx.resume();
      const now = ctx.currentTime + 0.01;

      if (type === 'success') {
        makeNote(ctx, 520, now,        0.12, 0.06);
        makeNote(ctx, 660, now + 0.10, 0.15, 0.07);
      }

      if (type === 'warning') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'triangle';
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(260, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.07, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        osc.start(now); osc.stop(now + 0.3);
      }

      if (type === 'delete') {
        makeNote(ctx, 340, now,        0.10, 0.07, 'sine');
        makeNote(ctx, 200, now + 0.09, 0.16, 0.08, 'sine');
      }

      if (type === 'deposit') {
        makeNote(ctx, 523, now,        0.10, 0.06, 'triangle');
        makeNote(ctx, 659, now + 0.09, 0.10, 0.06, 'triangle');
        makeNote(ctx, 784, now + 0.18, 0.18, 0.07, 'triangle');
      }
    };

    playAsync().catch(() => {});
  } catch (e) {
    console.warn('Audio feedback failed:', e);
  }
};

