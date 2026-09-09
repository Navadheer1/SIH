import React, { useState, useEffect, useRef } from 'react';

interface LandingNavProps {
  onLaunchDashboard: () => void;
  onScrollToSection: (sectionKey: 'space' | 'orbit' | 'india' | 'hotspots' | 'pipeline' | 'final') => void;
}

export const LandingNav: React.FC<LandingNavProps> = ({
  onLaunchDashboard,
  onScrollToSection,
}) => {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Clean Web Audio drone generator (strictly user-initiated, muted by default)
  const toggleAudio = () => {
    if (!audioEnabled) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        // Master Gain
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
        masterGain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 2.0);
        masterGain.connect(ctx.destination);
        gainNodeRef.current = masterGain;

        // Sub oscillator (Deep 55Hz space drone)
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(55, ctx.currentTime);

        // Harmonic oscillator (110Hz subtle fifth)
        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(82.4, ctx.currentTime);

        const osc2Gain = ctx.createGain();
        osc2Gain.gain.value = 0.04;

        // Lowpass filter for cosmic atmosphere
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(140, ctx.currentTime);

        osc1.connect(filter);
        osc2.connect(osc2Gain);
        osc2Gain.connect(filter);
        filter.connect(masterGain);

        osc1.start();
        osc2.start();

        setAudioEnabled(true);
      } catch (err) {
        console.warn('Audio initialization deferred:', err);
      }
    } else {
      if (gainNodeRef.current && audioCtxRef.current) {
        gainNodeRef.current.gain.exponentialRampToValueAtTime(0.0001, audioCtxRef.current.currentTime + 0.8);
        setTimeout(() => {
          audioCtxRef.current?.close();
          audioCtxRef.current = null;
          gainNodeRef.current = null;
          setAudioEnabled(false);
        }, 800);
      } else {
        setAudioEnabled(false);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  return (
    <header className="cinematic-navbar">
      <div className="nav-brand" onClick={() => onScrollToSection('space')}>
        <span className="brand-logo-text">THERMOSCOPE</span>
        <span className="brand-badge">SIH 26162</span>
      </div>

      <nav className="nav-links">
        <button
          type="button"
          className="nav-link-btn"
          onClick={() => onScrollToSection('space')}
        >
          Overview
        </button>
        <button
          type="button"
          className="nav-link-btn"
          onClick={() => onScrollToSection('orbit')}
        >
          Technology
        </button>
        <button
          type="button"
          className="nav-link-btn"
          onClick={() => onScrollToSection('hotspots')}
        >
          Live Intelligence
        </button>
        <button
          type="button"
          className="nav-link-btn"
          onClick={() => onScrollToSection('pipeline')}
        >
          AI Pipeline
        </button>
      </nav>

      <div className="nav-actions">
        {/* User-controlled ambient sound toggle */}
        <button
          type="button"
          className={`nav-audio-toggle ${audioEnabled ? 'active' : ''}`}
          onClick={toggleAudio}
          title={audioEnabled ? 'Mute ambient mission sound' : 'Enable ambient mission sound'}
          aria-label="Toggle Mission Audio"
        >
          <span className="audio-icon-dot" />
          <span className="audio-label">{audioEnabled ? 'AUDIO ON' : 'AUDIO OFF'}</span>
        </button>

        {/* Primary CTA */}
        <button
          type="button"
          className="nav-launch-btn"
          onClick={onLaunchDashboard}
        >
          <span>Launch Dashboard</span>
        </button>
      </div>
    </header>
  );
};
