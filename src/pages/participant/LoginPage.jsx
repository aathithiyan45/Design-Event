import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../services/AuthContext';
import { isSupabaseConfigured } from '../../services/supabase';
import { ArrowRight, Clock, Users, AlertCircle, AlertTriangle } from 'lucide-react';

const LoginPage = () => {
  const [rollNumber, setRollNumber] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, isAdmin, loginParticipant, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && !isAdmin) {
      navigate('/instructions');
    }
  }, [user, isAdmin, loading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!rollNumber.trim()) {
      setError('Please enter your registration roll number.');
      return;
    }

    setIsSubmitting(true);
    const { error: loginError } = await loginParticipant(rollNumber.trim());
    setIsSubmitting(false);

    if (loginError) {
      let friendlyError = loginError.message || 'Login failed. Please check your credentials or network connection.';
      if (friendlyError.includes('Invalid roll number')) {
        friendlyError = 'Please enter a valid registration roll number.';
      } else if (friendlyError.includes('Not registered')) {
        friendlyError = 'This roll number is not registered for this event.';
      } else if (friendlyError.includes('Wrong year')) {
        friendlyError = "This participant is not registered for this year's competition.";
      } else if (friendlyError.includes('Already active')) {
        friendlyError = 'This roll number is already active on another device session.';
      } else if (friendlyError.includes('Already completed')) {
        friendlyError = 'You have already submitted and completed Round 1.';
      }
      setError(friendlyError);
    } else {
      navigate('/instructions');
    }
  };

  return (
    <div className="h-screen w-full overflow-hidden bg-[#F9FAFB] text-[#111827] font-sans flex flex-col lg:grid lg:grid-cols-2 relative">
      {/* College Logo in top right corner */}
      <div className="absolute top-6 right-6 sm:top-8 sm:right-10 z-30 flex items-center gap-3 pointer-events-none">
        <img
          src="/assets/logo.png"
          alt="College Logo"
          className="h-20 w-auto object-contain sm:h-24 md:h-28 drop-shadow-md transition-transform hover:scale-105"
        />
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .font-sans { font-family: 'Inter', system-ui, sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }

        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-2%, 3%) scale(1.05); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .enter-item {
          opacity: 0;
          animation: fadeSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .enter-1 { animation-delay: 0.05s; }
        .enter-2 { animation-delay: 0.15s; }
        .enter-3 { animation-delay: 0.25s; }
        .enter-4 { animation-delay: 0.35s; }
        .enter-5 { animation-delay: 0.45s; }
        .enter-6 { animation-delay: 0.55s; }
        .enter-7 { animation-delay: 0.65s; }

        .ambient-glow {
          animation: drift 12s ease-in-out infinite;
        }

        .stat-card {
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease, border-color 0.25s ease;
        }
        .stat-card:hover {
          transform: translateY(-3px);
          border-color: #D1D5DB;
          box-shadow: 0 8px 20px -6px rgba(17, 24, 39, 0.08);
        }

        .cta-button {
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, background-color 0.2s ease;
          box-shadow: 0 1px 2px rgba(37, 99, 235, 0.05);
        }
        .cta-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 24px -8px rgba(37, 99, 235, 0.45);
        }
        .cta-button:active:not(:disabled) {
          transform: translateY(0px);
        }

        .roll-input {
          transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }
        .roll-input:focus {
          transform: translateY(-1px);
        }

        .live-dot-ring {
          box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.4);
          animation: pulseRing 2s ease-out infinite;
        }
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.35); }
          70% { box-shadow: 0 0 0 6px rgba(22, 163, 74, 0); }
          100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
        }

        .pill-chip {
          transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .pill-chip:hover {
          transform: translateY(-2px);
          border-color: #D1D5DB;
        }

        @media (prefers-reduced-motion: reduce) {
          .enter-item, .ambient-glow, .live-dot-ring, .stat-card, .cta-button, .roll-input, .pill-chip {
            animation: none !important;
            transition: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* LEFT — form */}
      <div className="relative flex-1 min-h-0 lg:h-full bg-white lg:border-r border-[#E5E7EB] flex flex-col px-6 sm:px-12 py-8 sm:py-10 lg:justify-center overflow-y-auto">
        <div className="max-w-md mx-auto lg:mx-0 w-full flex-1 flex flex-col justify-between lg:justify-normal gap-0 lg:gap-10 lg:flex-none">

          {/* Top block: brand */}
          <div className="enter-item enter-1 flex items-center justify-between">
            <div>
              <span className="text-2xl sm:text-xl font-bold tracking-tight block text-[#111827]">
                Design-Event
              </span>
              <span className="text-sm sm:text-[10px] text-[#6B7280] block font-medium mt-1">
                Poster Design 2026 · Round 1
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-4 py-2.5 sm:py-1.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-full font-mono text-sm sm:text-[10px] font-semibold uppercase tracking-wider text-[#16A34A]">
              <span className="live-dot-ring w-2 h-2 sm:w-1.5 sm:h-1.5 rounded-full bg-[#16A34A]" />
              Live
            </span>
          </div>

          {/* Middle block: heading + form */}
          <div className="py-8 sm:py-0">
            <h1 className="enter-item enter-2 text-4xl sm:text-4xl font-bold tracking-tight mb-4 sm:mb-3 text-[#111827]">
              Sign in to continue
            </h1>
            <p className="enter-item enter-3 text-base sm:text-base text-[#6B7280] leading-relaxed mb-8 sm:mb-8">
              Enter your registration roll number to unlock the workspace and begin Round 1.
            </p>

            {!isSupabaseConfigured && (
              <div className="mb-5 flex items-start gap-3 px-4 py-3.5 sm:py-3 bg-amber-50 border border-amber-200 rounded-lg animate-[scaleIn_0.3s_ease-out]">
                <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
                <p className="text-sm sm:text-xs font-medium text-amber-700 leading-relaxed">
                  Configuration warning: database credentials missing. Demo mode active.
                </p>
              </div>
            )}

            {error && (
              <div className="mb-5 flex items-start gap-3 px-4 py-3.5 sm:py-3 bg-red-50 border border-red-200 rounded-lg animate-[scaleIn_0.3s_ease-out]">
                <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-600" />
                <p className="text-sm sm:text-xs font-medium text-red-700 leading-relaxed">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-5">
              <div className="enter-item enter-4">
                <label htmlFor="rollNumber" className="block text-sm sm:text-sm font-semibold uppercase tracking-wide text-[#6B7280] mb-2.5 sm:mb-3">
                  Roll number
                </label>
                <input
                  id="rollNumber"
                  type="text"
                  placeholder="e.g. 274001"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                  autoComplete="off"
                  className="roll-input w-full px-5 py-5 sm:py-4 bg-white border border-[#E5E7EB] rounded-xl font-mono text-lg sm:text-lg font-medium tracking-wide text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="cta-button enter-item enter-5 w-full flex items-center justify-center gap-2 px-6 py-5 sm:py-4 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-base sm:text-base font-semibold text-white cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full motion-safe:animate-spin" />
                    Connecting
                  </>
                ) : (
                  <>
                    Enter competition
                    <ArrowRight size={17} strokeWidth={2.5} />
                  </>
                )}
              </button>
            </form>

            <div className="enter-item enter-6 flex flex-wrap gap-3 mt-8 sm:mt-8">
              <span className="pill-chip inline-flex items-center gap-2 px-4 py-2.5 sm:py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-full text-sm sm:text-sm font-medium text-[#374151]">
                <Clock size={16} /> 25 min
              </span>
              <span className="pill-chip inline-flex items-center gap-2 px-4 py-2.5 sm:py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-full text-sm sm:text-sm font-medium text-[#374151]">
                <Users size={16} /> 2nd &amp; 3rd year
              </span>
            </div>

            <p className="enter-item enter-7 hidden lg:block mt-10 text-xs font-medium text-[#9CA3AF] leading-relaxed max-w-sm">
              Trouble logging in? Check with your event coordinator before the round starts.
            </p>
          </div>

          {/* About section — mobile only */}
          <div className="lg:hidden pt-8 border-t border-[#E5E7EB]">
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9CA3AF]">
              About the event
            </span>
            <p className="text-base text-[#6B7280] leading-relaxed mt-4 mb-6">
              Ten timed tasks, one workspace, one poster to submit before the clock runs out.
              Round 1 tests speed, taste, and execution under pressure.
            </p>
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="stat-card bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-4 text-center">
                <span className="block text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">Tasks</span>
                <span className="text-xl font-bold text-[#111827]">10</span>
              </div>
              <div className="stat-card bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-4 text-center">
                <span className="block text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">Time</span>
                <span className="text-xl font-bold text-[#111827]">25m</span>
              </div>
              <div className="stat-card bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-4 text-center">
                <span className="block text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">Year</span>
                <span className="text-xl font-bold text-[#111827]">2/3</span>
              </div>
              <div className="stat-card bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-4 text-center">
                <span className="block text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">Type</span>
                <span className="text-xl font-bold text-[#111827]">Solo</span>
              </div>
            </div>
            <p className="text-sm font-medium text-[#9CA3AF] leading-relaxed">
              Trouble logging in? Check with your event coordinator before the round starts.
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT — about the event (desktop only) */}
      <div className="relative hidden lg:flex lg:h-full items-center bg-[#F9FAFB] px-6 sm:px-12 py-10 overflow-hidden">
        {/* ambient glow accents */}
        <div className="ambient-glow pointer-events-none absolute -top-24 -right-16 w-96 h-96 rounded-full bg-[#2563EB]/[0.06] blur-3xl" />
        <div className="ambient-glow pointer-events-none absolute -bottom-32 -left-10 w-80 h-80 rounded-full bg-[#16A34A]/[0.05] blur-3xl" style={{ animationDelay: '2s' }} />

        <div className="relative max-w-md mx-auto lg:mx-0 w-full">
          <span className="enter-item enter-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#9CA3AF]">
            About the event
          </span>
          <h2 className="enter-item enter-3 text-2xl sm:text-3xl font-bold tracking-tight mt-3 mb-4 text-[#111827]">
            A design sprint for creative minds
          </h2>
          <p className="enter-item enter-4 text-sm text-[#6B7280] leading-relaxed mb-8 max-w-sm">
            Ten timed tasks, one workspace, and a single poster to submit before the clock
            runs out. Round 1 tests speed, taste, and execution under pressure.
          </p>

          <div className="enter-item enter-5 grid grid-cols-2 gap-3">
            <div className="stat-card bg-white border border-[#E5E7EB] rounded-xl p-4">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF] mb-1">Tasks</span>
              <span className="text-xl font-bold text-[#111827]">10</span>
            </div>
            <div className="stat-card bg-white border border-[#E5E7EB] rounded-xl p-4">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF] mb-1">Duration</span>
              <span className="text-xl font-bold text-[#111827]">25 min</span>
            </div>
            <div className="stat-card bg-white border border-[#E5E7EB] rounded-xl p-4">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF] mb-1">Eligibility</span>
              <span className="text-base font-bold text-[#111827]">2nd &amp; 3rd yr</span>
            </div>
            <div className="stat-card bg-white border border-[#E5E7EB] rounded-xl p-4">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF] mb-1">Format</span>
              <span className="text-base font-bold text-[#111827]">Individual</span>
            </div>
          </div>

          <p className="enter-item enter-6 mt-6 text-xs font-medium text-[#9CA3AF] leading-relaxed">
            Trouble logging in? Check with your event coordinator before the round starts.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;