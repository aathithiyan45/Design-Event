import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../services/AuthContext';
import { useHistory } from '../../hooks/useHistory';
import { useTimer } from '../../hooks/useTimer';
import { useFullscreenGuard } from '../../hooks/useFullscreenGuard';
import { useArrowQuota } from '../../hooks/useArrowQuota';
import { submitDesignService } from '../../services/supabase';
import { tasksData } from '../../data/tasks';

import DesignCanvas from '../../components/editor/DesignCanvas';
import Toolbar from '../../components/editor/Toolbar';
import PropertiesPanel from '../../components/editor/PropertiesPanel';
import TaskPanel from '../../components/editor/TaskPanel';
import { Clock, Send, LogOut, CheckCircle2, AlertCircle, Maximize } from 'lucide-react';

const ChallengePage = () => {
  const { profile, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();
  const { tryConsumeArrow } = useArrowQuota();

  const [tasks] = useState(tasksData);
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);
  const activeTask = tasks[activeTaskIndex] || tasks[0];

  const [selectedId, setSelectedId] = useState(null);
  const [activeTool, setActiveTool] = useState('select');

  const [challengeState, setChallengeState] = useState(() => {
    const fallbackState = {};
    tasksData.forEach(task => {
      fallbackState[task.id] = task.public_config?.initialElements || [];
    });

    const saved = profile?.id ? localStorage.getItem(`design_event_elements_${profile.id}`) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const merged = {};
        tasksData.forEach(task => {
          const savedElements = parsed?.[task.id];
          merged[task.id] = (Array.isArray(savedElements) && savedElements.length > 0)
            ? savedElements
            : fallbackState[task.id];
        });
        return merged;
      } catch (e) {
        console.error('Failed to parse elements cache:', e);
      }
    }

    return fallbackState;
  });

  const [taskCompletion, setTaskCompletion] = useState({});

  useEffect(() => {
    if (!profile?.id) return;
    const saved = localStorage.getItem(`design_event_elements_${profile.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setChallengeState(prev => {
          const merged = {};
          let changed = false;
          tasksData.forEach(task => {
            const savedElements = parsed?.[task.id];
            const validSaved = (Array.isArray(savedElements) && savedElements.length > 0)
              ? savedElements
              : (task.public_config?.initialElements || []);
            merged[task.id] = validSaved;
            if (JSON.stringify(prev[task.id]) !== JSON.stringify(validSaved)) {
              changed = true;
            }
          });
          return changed ? merged : prev;
        });
      } catch (e) {
        console.error('Failed to restore saved elements:', e);
      }
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.id) {
      localStorage.setItem(`design_event_elements_${profile.id}`, JSON.stringify(challengeState));
    }

    const completion = {};
    tasks.forEach(task => {
      const savedTaskElements = challengeState[task.id];
      const current = (Array.isArray(savedTaskElements) && savedTaskElements.length > 0)
        ? savedTaskElements
        : (task.public_config?.initialElements || []);
      const initial = task.public_config?.initialElements || [];
      completion[task.id] = JSON.stringify(current) !== JSON.stringify(initial) && current.length > 0;
    });
    setTaskCompletion(completion);
  }, [challengeState, profile?.id, tasks]);

  const savedTaskElements = challengeState[activeTask.id];
  const initialTaskElements = (Array.isArray(savedTaskElements) && savedTaskElements.length > 0)
    ? savedTaskElements
    : (activeTask.public_config?.initialElements || []);

  const {
    state: currentElements,
    setState: setCurrentElements,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
  } = useHistory(initialTaskElements);

  useEffect(() => {
    setChallengeState(prev => {
      const existing = prev[activeTask.id] || [];
      if (currentElements.length === 0 && existing.length > 0) {
        return prev;
      }
      if (JSON.stringify(existing) === JSON.stringify(currentElements)) return prev;
      return {
        ...prev,
        [activeTask.id]: currentElements
      };
    });
  }, [currentElements, activeTask.id]);

  useEffect(() => {
    const savedNext = challengeState[activeTask.id];
    const nextElements = (Array.isArray(savedNext) && savedNext.length > 0)
      ? savedNext
      : (activeTask.public_config?.initialElements || []);
    resetHistory(nextElements);
    setSelectedId(null);
  }, [activeTaskIndex, activeTask.id, resetHistory]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteElement();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }

      // Arrow-key MOVE control: with an element selected, the arrow keys
      // nudge its position by 1px (Shift = 10px) in the pressed direction.
      // Up = move up, Down = move down, Left = move left, Right = move right.
      // SIZE (width/height) is intentionally left untouched by this feature —
      // resizing stays a drag-handle-only action.
      if (
        e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      ) {
        if (selectedId) {
          e.preventDefault();
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const step = e.shiftKey ? 10 : 1;
            const dx = e.key === 'ArrowLeft' ? -step : step;
            handlePositionNudge(dx, 0);
          } else {
            const target = currentElements.find(el => el.id === selectedId);
            if (target) {
              const currentY = Number.isFinite(target.y) ? target.y : 0;
              const res = tryConsumeArrow(currentY, 0, 600, false);
              if (res.allowed) {
                const dy = e.key === 'ArrowUp' ? -1 : 1;
                handlePositionNudge(0, dy);
              }
            }
          }
        }
      }

      if (e.key === 'v' || e.key === 'V') setActiveTool('select');
      if (e.key === 't' || e.key === 'T') handleAddElement('text');
      if (e.key === 'r' || e.key === 'R') handleAddElement('rectangle');
      if (e.key === 'o' || e.key === 'O') handleAddElement('circle');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, currentElements, undo, redo, tryConsumeArrow]);

  // Adjusts the selected element's POSITION (x/y) by `dx`/`dy`, clamped to
  // the 800x600 canvas bounds the same way the drag-to-move logic in
  // DesignCanvas clamps it. Missing/invalid x or y is treated as 0 by
  // default before applying the delta. SIZE (width/height) is never touched
  // here — resizing remains a drag-handle-only action.
  const handlePositionNudge = (dx, dy) => {
    if (!selectedId) return;
    const target = currentElements.find(el => el.id === selectedId);
    if (!target) return;

    const currentX = Number.isFinite(target.x) ? target.x : 0;
    const currentY = Number.isFinite(target.y) ? target.y : 0;
    const width = Number.isFinite(target.width) ? target.width : 0;
    const height = Number.isFinite(target.height) ? target.height : 0;

    const nextX = Math.max(0, Math.min(800 - width, currentX + dx));
    const nextY = Math.max(0, Math.min(600 - height, currentY + dy));

    if (nextX === currentX && nextY === currentY) return;

    const updated = currentElements.map(el =>
      el.id === selectedId ? { ...el, x: nextX, y: nextY } : el
    );
    setCurrentElements(updated);
  };

  const handleAddElement = (type) => {
    const id = `${type}_${Date.now()}`;
    let newEl = {
      id,
      type,
      x: 350,
      y: 250,
      width: 100,
      height: 100,
      name: `New ${type}`,
    };

    if (type === 'text') {
      newEl = {
        ...newEl,
        width: 300,
        height: 60,
        text: 'Sample Text',
        fontSize: 20,
        fontWeight: 400,
        fontFamily: 'Inter',
        color: '#000000',
        align: 'left',
      };
    } else if (type === 'rectangle') {
      newEl = {
        ...newEl,
        backgroundColor: '#2563EB',
        borderRadius: 0,
      };
    } else if (type === 'circle') {
      newEl = {
        ...newEl,
        backgroundColor: '#16A34A',
      };
    } else if (type === 'image') {
      newEl = {
        ...newEl,
        width: 200,
        height: 150,
        url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60',
      };
    } else if (type === 'logo') {
      newEl = {
        ...newEl,
        type: 'rectangle',
        width: 120,
        height: 40,
        backgroundColor: '#2563EB',
        borderRadius: 8,
      };
    }

    const updated = [...currentElements, newEl];
    setCurrentElements(updated);
    setSelectedId(id);
  };

  const handleUpdateElement = (updatedEl) => {
    const updated = currentElements.map(el => (el.id === updatedEl.id ? updatedEl : el));
    setCurrentElements(updated);
  };

  const handleDeleteElement = () => {
    if (!selectedId) return;
    const updated = currentElements.filter(el => el.id !== selectedId);
    setCurrentElements(updated);
    setSelectedId(null);
  };

  const handleDuplicateElement = () => {
    if (!selectedId) return;
    const original = currentElements.find(el => el.id === selectedId);
    if (!original) return;

    const id = `${original.type}_${Date.now()}`;
    const duplicated = {
      ...original,
      id,
      x: Math.min(800 - original.width, original.x + 20),
      y: Math.min(600 - original.height, original.y + 20),
      name: `${original.name} Copy`
    };

    setCurrentElements([...currentElements, duplicated]);
    setSelectedId(id);
  };

  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoSubmitting, setIsAutoSubmitting] = useState(false);
  const [autoSubmitReason, setAutoSubmitReason] = useState('');
  const [submitError, setSubmitError] = useState('');

  const isSubmittingRef = React.useRef(false);

  const handleFinalSubmit = async (reason = 'manual') => {
    // Atomic lock to prevent duplicate concurrent executions
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setIsSubmitting(true);
    if (reason === 'timer_expired') {
      setIsAutoSubmitting(true);
      setAutoSubmitReason("Time's up! Your submission has been automatically finalized.");
    } else if (reason === 'proctor_violation') {
      setIsAutoSubmitting(true);
      setAutoSubmitReason("Fullscreen violation limit exceeded. Automatically submitting your challenge.");
    }
    setSubmitError('');

    try {
      const sessionId = sessionStorage.getItem('design_event_session_id');

      // Construct immutable initial challenge state baseline for attempt evaluation
      const initialChallengeState = {};
      tasksData.forEach(task => {
        initialChallengeState[task.id] = task.public_config?.initialElements || [];
      });

      const { data, error } = await submitDesignService(challengeState, sessionId, initialChallengeState);

      if (error) {
        // If error indicates already submitted or time expired in DB, treat as successful completion
        const errStr = (error.message || '').toLowerCase();
        if (errStr.includes('already') || errStr.includes('locked') || errStr.includes('expired') || errStr.includes('finalized')) {
          console.warn('Submission already recorded or locked in database:', error.message);
        } else {
          throw error;
        }
      }

      if (data?.submissionId) {
        sessionStorage.setItem('design_event_last_submission_id', data.submissionId);
      }

      if (profile?.id) {
        localStorage.removeItem(`design_event_elements_${profile.id}`);
      }
      sessionStorage.removeItem('design_event_session_id');

      await refreshProfile();
      navigate('/result', { replace: true });
    } catch (err) {
      console.error('Final submit processing error:', err);
      setSubmitError(err.message || 'Submission failed. Please check network connection and try again.');
      setIsSubmitting(false);
      setIsAutoSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  const handleTimerExpire = React.useCallback(() => {
    console.log('Timer expired, auto-submitting current design...');
    handleFinalSubmit('timer_expired');
  }, [challengeState]);

  // Support dev test duration via window.DEV_TIMER_MINUTES if set in development
  const timerDurationMinutes = typeof window !== 'undefined' && window.DEV_TIMER_MINUTES ? window.DEV_TIMER_MINUTES : 25;
  const { formatTime, timeLeft } = useTimer(profile?.started_at, timerDurationMinutes, handleTimerExpire);

  const isTimeUp = (timeLeft !== null && timeLeft <= 0) || profile?.status === 'submitted';

  // Ensure auto-submit triggers if time is up on mount or timer expires
  useEffect(() => {
    if (isTimeUp && !isSubmittingRef.current) {
      console.warn('[timer] time is up on render — triggering auto-submit');
      handleFinalSubmit('timer_expired');
    }
  }, [isTimeUp]);

  // Keep the participant locked into a fullscreen, single-tab test view.
  const { isFullscreen, violationCount, enterFullscreen } = useFullscreenGuard({
    enabled: true,
    onViolation: (type) => {
      console.warn('[proctor] fullscreen guard violation:', type);
    },
  });

  // Auto-submit once the participant has left fullscreen more than 2 times
  useEffect(() => {
    if (violationCount > 2 && !isSubmittingRef.current) {
      console.warn('[proctor] fullscreen violation limit exceeded — auto-submitting.');
      handleFinalSubmit('proctor_violation');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [violationCount]);

  const isDangerTime = timeLeft !== null && timeLeft <= 60;
  const isWarningTime = timeLeft !== null && timeLeft <= 300 && !isDangerTime;

  const selectedElement = currentElements.find(el => el.id === selectedId);

  return (
    <div className="h-screen bg-[#F9FAFB] flex flex-col justify-between overflow-hidden text-[#111827] font-sans select-none">

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .font-sans { font-family: 'Inter', system-ui, sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
      `}</style>

      {/* 1. TOP NAVBAR — clean, matches the editor workspace below */}
      <header className="h-16 px-6 bg-white border-b border-[#E5E7EB] flex items-center justify-between z-30 shrink-0">

        {/* Left Brand */}
        <div className="flex items-center gap-4">
          <div>
            <span className="text-lg sm:text-xl font-bold tracking-tight block text-[#111827]">
              Design-Event
            </span>
            <span className="text-[10px] text-[#6B7280] block font-medium -mt-0.5">Poster Design 2026 - Round 1</span>
          </div>
        </div>

        {/* Center Task & Timer Display */}
        <div className="flex items-center gap-3">
          <div className="text-xs sm:text-sm font-semibold bg-white px-3.5 py-2 rounded-full border border-[#E5E7EB] text-[#111827]">
            Task <strong className="text-[#2563EB]">{String(activeTaskIndex + 1).padStart(2, '0')}</strong> / 10
          </div>

          {/* Timer Display */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border font-mono font-semibold text-xs sm:text-sm tracking-wider transition ${
            isDangerTime
              ? 'bg-red-50 border-red-200 text-red-600 motion-safe:animate-pulse'
              : isWarningTime
              ? 'bg-amber-50 border-amber-200 text-amber-600'
              : 'bg-white border-[#E5E7EB] text-[#111827]'
          }`}>
            <Clock size={14} />
            <span>{formatTime()}</span>
          </div>
        </div>

        {/* Right Actions & Status */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-[#374151]">
            <span className="w-2 h-2 rounded-full bg-[#16A34A] motion-safe:animate-pulse" />
            <span>Saved</span>
          </div>

          <span className="hidden sm:inline-flex items-center px-3.5 py-2 bg-white border border-[#E5E7EB] rounded-full text-xs sm:text-sm font-semibold text-[#374151] whitespace-nowrap">
            {profile?.roll_number || 'Participant'}
          </span>

          <button
            onClick={() => setIsSubmitModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-xs sm:text-sm font-semibold text-white rounded-full transition-colors cursor-pointer"
          >
            <Send size={13} /> Submit round
          </button>

          <button
            onClick={logout}
            className="p-2 bg-white text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] rounded-full border border-[#E5E7EB] transition-colors cursor-pointer"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* 2. MAIN EDITOR WORKSPACE — unchanged for editing precision/usability */}
      <div className="flex-grow flex overflow-hidden relative">

        {/* Left Task Sidebar */}
        <TaskPanel
          tasks={tasks}
          activeTaskIndex={activeTaskIndex}
          setActiveTaskIndex={setActiveTaskIndex}
          taskCompletion={taskCompletion}
        />

        {/* Center Workspace */}
        <div className="flex-grow flex overflow-hidden relative">
          <Toolbar
            allowedTypes={activeTask.public_config.allowedTypes || []}
            onAddElement={handleAddElement}
            onDeleteSelected={handleDeleteElement}
            onDuplicateSelected={handleDuplicateElement}
            selectedId={selectedId}
            undo={undo}
            redo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
          />

          <DesignCanvas
            elements={currentElements}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            updateElements={setCurrentElements}
          />
        </div>

        {/* Right Inspector Panel */}
        <PropertiesPanel
          selectedElement={selectedElement}
          onUpdateElement={handleUpdateElement}
          elements={currentElements}
          onSelectElement={setSelectedId}
        />
      </div>

      {/* 3. CONFIRMATION SUBMIT MODAL — clean, matches the editor workspace */}
      {isSubmitModalOpen && (
        <div className="font-sans fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#E5E7EB] shadow-xl overflow-hidden">

            <div className="px-6 pt-6 pb-5 border-b border-[#E5E7EB]">
              <h3 className="text-lg font-bold text-[#111827] flex items-center gap-2">
                <CheckCircle2 size={20} className="text-[#2563EB]" /> Submit your design?
              </h3>
            </div>

            <div className="p-6 space-y-5">
              <p className="text-sm leading-relaxed text-[#6B7280]">
                You will not be able to edit your submission after submitting. All 10 poster workspaces will be evaluated server-side.
              </p>

              {submitError && (
                <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
                  <span className="text-xs font-medium text-red-700 leading-relaxed">{submitError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsSubmitModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 text-sm font-semibold text-[#6B7280] hover:text-[#111827] bg-transparent hover:bg-[#F3F4F6] rounded-full transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFinalSubmit}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-sm font-semibold text-white rounded-full transition-colors cursor-pointer"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full motion-safe:animate-spin" />
                      Evaluating
                    </span>
                  ) : (
                    'Submit design'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. TIME'S UP / AUTO-SUBMITTING BLOCKING OVERLAY */}
      {(isTimeUp || isAutoSubmitting) && (
        <div className="font-sans fixed inset-0 bg-[#0F172A]/90 backdrop-blur-md flex items-center justify-center p-4 z-[120]">
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#E5E7EB] shadow-2xl overflow-hidden text-center p-8 space-y-4 animate-in fade-in duration-200">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Clock size={32} className="animate-spin" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-[#111827]">
                {timeLeft <= 0 ? "Time's Up!" : "Finalizing Submission"}
              </h3>
              <p className="text-sm text-[#6B7280] mt-2 leading-relaxed font-medium">
                {autoSubmitReason || "Your 25-minute competition window has ended. Your design is being automatically evaluated and recorded."}
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-2 text-xs font-mono font-semibold text-[#2563EB] bg-[#EFF6FF] py-2.5 px-4 rounded-xl border border-[#BFDBFE]">
              <span className="w-4 h-4 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin shrink-0" />
              <span>Time's up. Your submission has been automatically submitted.</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. FULLSCREEN GUARD OVERLAY — blocks the whole test screen until the
          participant returns to fullscreen. The timer keeps running underneath. */}
      {!isFullscreen && (
        <div className="font-sans fixed inset-0 bg-[#0B1120]/95 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#E5E7EB] shadow-xl overflow-hidden text-center p-8">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#EFF6FF] flex items-center justify-center mb-4">
              <Maximize size={24} className="text-[#2563EB]" />
            </div>
            <h3 className="text-lg font-bold text-[#111827] mb-2">Fullscreen required</h3>
            <p className="text-sm text-[#6B7280] leading-relaxed mb-1">
              This round must be attempted in fullscreen mode. Your timer keeps running while you're out of fullscreen.
            </p>
            {violationCount > 0 && (
              <p className="text-xs font-semibold text-red-600 mb-4">
                Exited fullscreen {violationCount} {violationCount === 1 ? 'time' : 'times'}.
              </p>
            )}
            <button
              onClick={enterFullscreen}
              className="mt-4 flex items-center gap-2 mx-auto px-6 py-3 bg-[#2563EB] hover:bg-[#1D4ED8] rounded-full text-sm font-semibold text-white transition-colors cursor-pointer"
            >
              <Maximize size={16} /> Resume fullscreen
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default ChallengePage;