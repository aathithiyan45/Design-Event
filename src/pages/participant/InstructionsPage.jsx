import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../services/AuthContext';
import { startParticipantRound } from '../../services/supabase';
import { Clock, ShieldCheck, LogOut, ArrowRight, AlertCircle, Target, Award, Eye, MousePointerClick, Crosshair, Send, TimerReset, Maximize } from 'lucide-react';
import { useFullscreenGuard } from '../../hooks/useFullscreenGuard';

const InstructionsPage = () => {
  const { profile, logout, refreshProfile } = useAuth();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { enterFullscreen } = useFullscreenGuard({ enabled: false });

  const handleStartRound = async () => {
    setIsStarting(true);
    setError('');

    try {
      // Must be requested inside this click handler (a real user gesture) -
      // browsers block requestFullscreen() called any other way.
      await enterFullscreen();

      const { error: startError } = await startParticipantRound(profile.id);
      if (startError) throw startError;

      await refreshProfile();
      navigate('/challenge');
    } catch (err) {
      console.error(err);
      setError('Could not start round. Please try again or contact organizers.');
    } finally {
      setIsStarting(false);
    }
  };

  const stats = [
    { icon: Clock, value: '25 min', label: 'Timed round' },
    { icon: Target, value: '10 tasks', label: 'Layout workspaces' },
    { icon: Award, value: '100 pts', label: 'Max score' },
    { icon: ShieldCheck, value: 'Top 30', label: 'Advance to Rd 2' },
  ];

  const guidelines = [
    { num: '01', icon: Eye, title: 'Read each task carefully', desc: "Each task specifies exact position (X, Y), dimensions (W, H), and styling properties." },
    { num: '02', icon: MousePointerClick, title: 'Use the design editor to match required layout', desc: 'Interact directly with the 800x600 pixel white canvas or use the Inspector panel.' },
    { num: '03', icon: Crosshair, title: 'Coordinates and dimensions matter', desc: "Server evaluation scores your accuracy within a precise +/-3px tolerance window." },
    { num: '04', icon: Send, title: 'Single final submission attempt', desc: 'Once submitted or when the 25-minute timer expires, your poster JSON is evaluated automatically.' },
    { num: '05', icon: TimerReset, title: 'The timer starts when you click Start Round', desc: 'Closing or refreshing your browser window will NOT pause the timer.', full: true },
  ];

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#111827] font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .font-sans { font-family: 'Inter', system-ui, sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }

        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeScaleIn {
          from { opacity: 0; transform: scale(0.94); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes ctaPulseIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }

        .anim-navbar { animation: fadeSlideDown 0.5s ease-out both; }
        .anim-stat { opacity: 0; animation: fadeScaleIn 0.45s ease-out forwards; }
        .anim-heading { opacity: 0; animation: fadeSlideUp 0.5s ease-out forwards; animation-delay: 0.15s; }
        .anim-guideline { opacity: 0; animation: fadeSlideUp 0.45s ease-out forwards; }
        .anim-cta { opacity: 0; animation: ctaPulseIn 0.5s ease-out forwards; animation-delay: 0.75s; }

        @media (prefers-reduced-motion: reduce) {
          .anim-navbar, .anim-stat, .anim-heading, .anim-guideline, .anim-cta {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      <div className="max-w-5xl mx-auto px-6 sm:px-10 lg:px-12 py-8">

        {/* NAVBAR */}
        <nav className="anim-navbar pb-8 border-b border-[#E5E7EB]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xl font-bold tracking-tight block text-[#111827]">
                Design-Event
              </span>
              <span className="text-xs text-[#6B7280] block font-medium mt-0.5">
                Poster Design 2026 · Round 1
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <img src="/assets/logo.png" alt="College Logo" className="h-14 sm:h-16 w-auto object-contain mr-2 drop-shadow-sm" />
              <span className="hidden sm:inline-flex items-center px-3.5 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-full font-mono text-xs font-semibold text-[#374151] whitespace-nowrap">
                {profile?.name} ({profile?.roll_number})
              </span>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#F0FDF4] border border-[#BBF7D0] rounded-full font-mono text-[11px] font-semibold uppercase tracking-wider text-[#16A34A] whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] motion-safe:animate-pulse" />
                Round 01
              </span>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-[#F9FAFB] text-[#374151] border border-[#E5E7EB] rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                title="Sign out"
              >
                <LogOut size={14} /> <span>Sign out</span>
              </button>
            </div>
          </div>
        </nav>

        {/* AT A GLANCE */}
        <section className="pt-10">

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className="anim-stat bg-white border border-[#E5E7EB] rounded-xl p-4 flex items-center gap-3 transition-transform hover:-translate-y-0.5"
                style={{ animationDelay: `${0.25 + i * 0.08}s` }}
              >
                <div className="shrink-0 w-9 h-9 rounded-full bg-[#EFF6FF] flex items-center justify-center">
                  <s.icon size={16} className="text-[#2563EB]" />
                </div>
                <div>
                  <span className="text-base font-bold block leading-none text-[#111827]">{s.value}</span>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-[#9CA3AF] mt-1 block">{s.label}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* INSTRUCTIONS */}
        <section className="py-10">
          <span className="anim-heading text-xs font-semibold uppercase tracking-[0.2em] text-[#9CA3AF] mb-2 block">
            Competition instructions
          </span>
          <h1 className="anim-heading text-3xl sm:text-4xl font-bold tracking-tight mb-6 text-[#111827]">
            Read before you start.
          </h1>

          {error && (
            <div className="mb-5 flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg animate-[fadeSlideUp_0.3s_ease-out]">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
              <span className="text-xs font-medium text-red-700 leading-relaxed">{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {guidelines.map((step, i) => (
              <div
                key={step.num}
                className={`anim-guideline bg-white border border-[#E5E7EB] rounded-xl p-5 transition-transform hover:-translate-y-0.5 ${step.full ? 'md:col-span-2' : ''}`}
                style={{ animationDelay: `${0.4 + i * 0.08}s` }}
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center">
                    <step.icon size={17} className="text-[#2563EB]" />
                  </div>
                  <div>
                    <span className="font-mono text-[11px] font-semibold text-[#9CA3AF] block mb-1">STEP {step.num}</span>
                    <p className="text-sm sm:text-base leading-snug text-[#111827]">
                      <span className="font-semibold">{step.title}.</span>{' '}
                      <span className="font-normal text-[#6B7280]">{step.desc}</span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* START ROUND CTA */}
        <section className="anim-cta pb-12 flex flex-col items-center text-center">
          <div className="flex flex-wrap items-center justify-center gap-2.5 mb-6">
            <span className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-full font-mono text-xs font-medium text-[#374151]">
              <Clock size={14} /> 25 min round
            </span>
            <span className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-full font-mono text-xs font-medium text-[#374151]">
              <ShieldCheck size={14} /> Single attempt
            </span>
            <span className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-full font-mono text-xs font-medium text-[#374151]">
              <Maximize size={14} /> Fullscreen required
            </span>
          </div>

          <button
            onClick={handleStartRound}
            disabled={isStarting}
            className="flex items-center gap-2 px-8 py-4 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-sm font-semibold text-white transition-all cursor-pointer hover:scale-[1.03] active:scale-[0.98]"
          >
            {isStarting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full motion-safe:animate-spin" />
                Launching
              </>
            ) : (
              <>
                Start round
                <ArrowRight size={16} strokeWidth={2.5} />
              </>
            )}
          </button>
        </section>
      </div>
    </div>
  );
};

export default InstructionsPage;