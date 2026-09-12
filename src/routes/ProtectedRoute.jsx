import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';

const ProtectedRoute = ({ children, admin = false, stage = null }) => {
  const { user, profile, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-55 font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 font-medium">Validating event session...</p>
        </div>
      </div>
    );
  }

  // Admin Routes protection
  if (admin) {
    if (!user || !isAdmin) {
      return <Navigate to="/admin/login" replace />;
    }
    return children;
  }

  // Participant Routes protection
  if (!user) {
    return <Navigate to="/" replace />;
  }
  if (isAdmin) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (stage) {
    const status = profile?.status || 'pending';

    if (stage === 'instructions') {
      if (status === 'started') {
        return <Navigate to="/challenge" replace />;
      }
      if (status === 'submitted') {
        return <Navigate to="/result" replace />;
      }
    }

    if (stage === 'challenge') {
      if (status === 'pending') {
        return <Navigate to="/instructions" replace />;
      }
      if (status === 'submitted') {
        return <Navigate to="/result" replace />;
      }
      
      // Timer expiry check: 25 minutes limit
      if (profile?.started_at) {
        const startTime = new Date(profile.started_at).getTime();
        const currentTime = new Date().getTime();
        const duration = currentTime - startTime;
        const maxDuration = 25 * 60 * 1000; // 25 mins in ms
        if (duration >= maxDuration) {
          return <Navigate to="/result" replace />;
        }
      }
    }

    if (stage === 'result') {
      if (status === 'pending') {
        return <Navigate to="/instructions" replace />;
      }
      if (status === 'started') {
        // If timer is expired, let result page load. Otherwise, send back to challenge
        if (profile?.started_at) {
          const startTime = new Date(profile.started_at).getTime();
          const currentTime = new Date().getTime();
          const duration = currentTime - startTime;
          const maxDuration = 25 * 60 * 1000;
          if (duration < maxDuration) {
            return <Navigate to="/challenge" replace />;
          }
        } else {
          return <Navigate to="/challenge" replace />;
        }
      }
    }
  }

  return children;
};

export default ProtectedRoute;