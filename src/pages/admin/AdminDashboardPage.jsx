import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../services/AuthContext';
import { 
  getAdminStatsService, 
  getAdminLeaderboardService, 
  getEventSettingsService, 
  updateEventStatusService, 
  resetRound1DataService, 
  addParticipantService,
  clearAllParticipantsService,
  deleteParticipantService,
  parseCSVText,
  bulkImportParticipantsService,
  supabase 
} from '../../services/supabase';
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  Download, 
  Upload,
  FileText,
  RefreshCw, 
  LogOut, 
  Power, 
  RotateCcw, 
  Search, 
  Trophy, 
  Activity, 
  TrendingUp, 
  BarChart3, 
  UserPlus,
  X,
  AlertCircle,
  Trash2,
  ShieldCheck
} from 'lucide-react';

const AdminDashboardPage = () => {
  const { logout } = useAuth();

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'participants' | 'leaderboard' | 'analytics'
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    completed: 0,
    pending: 0,
    avgScore: 0,
    maxScore: 0
  });
  const [leaderboard, setLeaderboard] = useState([]);
  const [eventSettings, setEventSettings] = useState({
    status: 'SCHEDULED',
    started_at: null,
    closed_at: null,
  });
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'pending' | 'started' | 'submitted'
  const [sortBy, setSortBy] = useState('order'); // 'order' | 'rank' | 'score' | 'speed' | 'roll'

  // Add Participant Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    rollNumber: '',
    name: '',
    year: 2
  });
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [isSubmittingParticipant, setIsSubmittingParticipant] = useState(false);

  // Individual Delete Participant Modal State
  const [selectedParticipantForDelete, setSelectedParticipantForDelete] = useState(null);
  const [isDeletingParticipant, setIsDeletingParticipant] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');

  const handleDeleteParticipant = async () => {
    if (!selectedParticipantForDelete) return;
    setDeleteError('');
    setDeleteSuccess('');
    setIsDeletingParticipant(true);

    const { error } = await deleteParticipantService(selectedParticipantForDelete.roll_number);
    setIsDeletingParticipant(false);

    if (error) {
      setDeleteError(error.message || 'Failed to delete participant.');
    } else {
      setDeleteSuccess(`Participant ${selectedParticipantForDelete.name} (${selectedParticipantForDelete.roll_number}) deleted successfully.`);
      await fetchDashboardData();
      setTimeout(() => {
        setSelectedParticipantForDelete(null);
        setDeleteSuccess('');
      }, 1000);
    }
  };

  // CSV Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [isParsingCSV, setIsParsingCSV] = useState(false);
  const [isImportingBulk, setIsImportingBulk] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResultSummary, setImportResultSummary] = useState(null);

  const handleCSVFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportError('');
    setImportResultSummary(null);
    setIsParsingCSV(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const rows = parseCSVText(text);

        if (rows.length < 2) {
          setImportError('CSV file is empty or missing data rows.');
          setParsedRows([]);
          setIsParsingCSV(false);
          return;
        }

        // Header mapping
        const headers = rows[0].map(h => h.trim().toLowerCase());
        const rollIdx = headers.findIndex(h => h === 'roll_number' || h === 'register_number' || h === 'roll' || h === 'reg_no');
        const nameIdx = headers.findIndex(h => h === 'name' || h === 'full_name' || h === 'participant_name');
        const yearIdx = headers.findIndex(h => h === 'year' || h === 'year_of_study');

        if (rollIdx === -1 || nameIdx === -1) {
          setImportError('Invalid CSV Header. Required columns: "roll_number", "name", "year"');
          setParsedRows([]);
          setIsParsingCSV(false);
          return;
        }

        // Existing DB roll numbers set
        const existingRolls = new Set(leaderboard.map(p => p.roll_number.toUpperCase()));
        const seenInCSV = new Set();
        const processed = [];

        for (let i = 1; i < rows.length; i++) {
          const rowData = rows[i];
          const rawRoll = (rowData[rollIdx] || '').trim();
          const rawName = (rowData[nameIdx] || '').trim();
          const rawYear = yearIdx !== -1 ? (rowData[yearIdx] || '').trim() : '2';

          const formattedRoll = rawRoll.toUpperCase();
          const numRoll = Number(formattedRoll);
          const numYear = parseInt(rawYear, 10) || 2;

          let status = 'VALID';
          let reason = 'Ready to import';

          // 1. Roll Number Validation
          if (!rawRoll) {
            status = 'INVALID';
            reason = 'Roll Number is required';
          } else if (isNaN(numRoll) || !((numRoll >= 274001 && numRoll <= 274070) || (numRoll >= 284001 && numRoll <= 284070))) {
            status = 'INVALID';
            reason = 'Roll Number outside allowed range (274001-274070, 284001-284070)';
          }
          // 2. Name Validation
          else if (!rawName) {
            status = 'INVALID';
            reason = 'Participant Name is required';
          }
          // 3. Year Validation
          else if (isNaN(numYear) || numYear < 1 || numYear > 4) {
            status = 'INVALID';
            reason = 'Invalid Year of Study (must be 2 or 3)';
          }
          // 4. Duplicate Check inside CSV
          else if (seenInCSV.has(formattedRoll)) {
            status = 'DUPLICATE';
            reason = 'Duplicate Roll Number in uploaded CSV';
          }
          // 5. Existing DB Check
          else if (existingRolls.has(formattedRoll)) {
            status = 'ALREADY REGISTERED';
            reason = 'Participant already registered in database';
          }

          if (status === 'VALID') {
            seenInCSV.add(formattedRoll);
          }

          processed.push({
            rowNum: i + 1,
            roll_number: formattedRoll || rawRoll,
            name: rawName,
            year: numYear,
            status,
            reason
          });
        }

        setParsedRows(processed);
      } catch (err) {
        setImportError('Failed to parse CSV file: ' + err.message);
        setParsedRows([]);
      } finally {
        setIsParsingCSV(false);
      }
    };

    reader.onerror = () => {
      setImportError('Error reading CSV file.');
      setIsParsingCSV(false);
    };

    reader.readAsText(file);
  };

  const handleBulkImportSubmit = async () => {
    const validItems = parsedRows
      .filter(r => r.status === 'VALID')
      .map(r => ({
        roll_number: r.roll_number,
        name: r.name,
        year: r.year
      }));

    if (validItems.length === 0) {
      setImportError('No valid participants available for import.');
      return;
    }

    setIsImportingBulk(true);
    setImportError('');

    const { data, error } = await bulkImportParticipantsService(validItems);
    setIsImportingBulk(false);

    if (error) {
      setImportError(error.message || 'Failed to complete bulk import.');
    } else {
      const importedCount = data?.imported || validItems.length;
      const alreadyRegCount = parsedRows.filter(r => r.status === 'ALREADY REGISTERED').length;
      const duplicateCount = parsedRows.filter(r => r.status === 'DUPLICATE').length;
      const invalidCount = parsedRows.filter(r => r.status === 'INVALID').length;

      setImportResultSummary({
        imported: importedCount,
        alreadyRegistered: alreadyRegCount,
        duplicates: duplicateCount,
        invalid: invalidCount
      });

      await fetchDashboardData();
      setTimeout(() => {
        setShowImportModal(false);
        setImportFile(null);
        setParsedRows([]);
        setImportResultSummary(null);
      }, 2500);
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    
    const statsRes = await getAdminStatsService();
    const leaderRes = await getAdminLeaderboardService();
    const settingsRes = await getEventSettingsService();

    if (settingsRes.data) setEventSettings(settingsRes.data);
    if (statsRes.data) setStats(statsRes.data);
    if (leaderRes.data) {
      const processed = leaderRes.data.map((p, idx) => {
        let durationMs = null;
        if (p.started_at && p.submitted_at) {
          durationMs = new Date(p.submitted_at).getTime() - new Date(p.started_at).getTime();
        } else if (p.started_at) {
          durationMs = new Date().getTime() - new Date(p.started_at).getTime();
        }

        return {
          ...p,
          regIndex: idx + 1,
          durationMs,
        };
      });

      setLeaderboard(processed);
    }
    setLoading(false);
  };

  const handleUpdateStatus = async (newStatus) => {
    if (newStatus === 'CLOSED') {
      const confirmClose = window.confirm("Are you sure you want to CLOSE Round 1?\nParticipants will no longer be able to submit their posters.");
      if (!confirmClose) return;
    }

    setUpdatingStatus(true);
    try {
      const { data, error } = await updateEventStatusService(newStatus);
      setUpdatingStatus(false);

      if (error || (data && !data.success)) {
        const errMsg = error?.message || data?.error || 'Failed to update event status';
        alert(errMsg);
      } else {
        await fetchDashboardData();
      }
    } catch (err) {
      setUpdatingStatus(false);
      alert('Network error: Unable to reach Supabase. Please check your connection.');
    }
  };

  const handleResetData = async () => {
    const confirmReset = window.confirm(
      "Are you sure you want to RESET all Round 1 data?\n\nThis will:\n- Reset all participants to 'pending' (0 score)\n- Clear active session locks\n- Delete submissions & task results\n- Set Event Status to 'SCHEDULED'"
    );
    if (!confirmReset) return;

    setResetting(true);
    const { error } = await resetRound1DataService();
    setResetting(false);

    if (error) {
      alert('Failed to reset Round 1 data: ' + (error.message || 'Unknown error'));
    } else {
      await fetchDashboardData();
    }
  };

  const handleClearAllParticipants = async () => {
    const confirmClear = window.confirm(
      "DANGER: Are you sure you want to PURGE & DELETE ALL participants from the database?\n\nThis will remove all pre-seeded (274001-274070 & 284001-284070) and registered student records!"
    );
    if (!confirmClear) return;

    setClearing(true);
    const { error } = await clearAllParticipantsService();
    setClearing(false);

    if (error) {
      alert('Failed to clear participants: ' + (error.message || 'Unknown error'));
    } else {
      await fetchDashboardData();
      alert('All participant records cleared successfully!');
    }
  };

  const handleAddParticipantSubmit = async (e) => {
    e.preventDefault();
    setAddError('');
    setAddSuccess('');

    if (!addForm.rollNumber.trim()) {
      setAddError('Batch Number / Register Number is required.');
      return;
    }
    if (!addForm.name.trim()) {
      setAddError('Full Name is required.');
      return;
    }

    setIsSubmittingParticipant(true);
    const { data, error } = await addParticipantService(addForm);
    setIsSubmittingParticipant(false);

    if (error) {
      setAddError(error.message || 'Failed to register participant.');
    } else {
      const addedRoll = data?.roll_number || addForm.rollNumber.trim().toUpperCase();
      const addedName = data?.name || addForm.name.trim();
      setAddSuccess(`Participant ${addedName} (${addedRoll}) registered successfully!`);
      setAddForm({ rollNumber: '', name: '', year: 2 });
      await fetchDashboardData();
      setTimeout(() => {
        setShowAddModal(false);
        setAddSuccess('');
      }, 1200);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    const channel = supabase
      .channel('admin_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_settings' }, () => fetchDashboardData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const formatDuration = (ms) => {
    if (ms === null || ms === undefined || ms === Infinity) return '--:--';
    const totalSecs = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSecs / 60);
    const seconds = totalSecs % 60;
    return `${minutes}m ${seconds}s`;
  };

  const handleExportCSV = () => {
    if (!leaderboard.length) return;

    const headers = ['Order', 'Register Number', 'Name', 'Year', 'Speed / Time Taken', 'Score', 'Status', 'Selection'];
    const rows = leaderboard.map((p, idx) => [
      p.regIndex || idx + 1,
      p.roll_number,
      p.name,
      p.year ? `${p.year}nd/rd Year` : '2nd Year',
      formatDuration(p.durationMs),
      Number(p.final_score).toFixed(2),
      p.status,
      idx < 30 ? 'TOP 30 PASS' : 'NOT SELECTED'
    ]);

    const csvContent = 
      "data:text/csv;charset=utf-8," + 
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `round1_participants_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredLeaderboard = useMemo(() => {
    return leaderboard.filter(p => {
      const matchesSearch = 
        p.roll_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.department && p.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.email && p.email.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      if (sortBy === 'order') {
        const orderA = a.created_at ? new Date(a.created_at).getTime() : a.regIndex;
        const orderB = b.created_at ? new Date(b.created_at).getTime() : b.regIndex;
        return orderA - orderB;
      }
      if (sortBy === 'roll') {
        return a.roll_number.localeCompare(b.roll_number);
      }
      if (sortBy === 'speed') {
        const timeA = a.durationMs || Infinity;
        const timeB = b.durationMs || Infinity;
        return timeA - timeB;
      }
      if (sortBy === 'score' || sortBy === 'rank') {
        const scoreDiff = Number(b.final_score) - Number(a.final_score);
        if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
        const timeA = a.durationMs || Infinity;
        const timeB = b.durationMs || Infinity;
        return timeA - timeB;
      }
      return 0;
    });
  }, [leaderboard, searchQuery, statusFilter, sortBy]);

  const recentActivities = useMemo(() => {
    const list = leaderboard
      .filter(p => p.submitted_at || p.started_at)
      .map(p => {
        const timestamp = p.submitted_at || p.started_at;
        return {
          id: p.id,
          roll_number: p.roll_number,
          name: p.name,
          action: p.submitted_at ? 'Submitted Round 1' : 'Started Round 1',
          time: new Date(timestamp),
          score: p.final_score,
          isSubmission: !!p.submitted_at
        };
      });

    list.sort((a, b) => b.time.getTime() - a.time.getTime());
    return list.slice(0, 5);
  }, [leaderboard]);

  const completionPercentage = Math.round((stats.completed / (stats.total || 1)) * 100);
  const activePercentage = Math.round((stats.active / (stats.total || 1)) * 100);
  const pendingPercentage = Math.round((stats.pending / (stats.total || 1)) * 100);

  return (
    <div className="font-sans min-h-screen bg-[#F5F6FA] text-[#111827] flex flex-col justify-between">

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        .font-sans { font-family: 'Inter', system-ui, sans-serif; }
      `}</style>

      {/* 1. TOP NAVIGATION BAR */}
      <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#E5E7EB] px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* Brand & Navigation */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-sm shadow-indigo-500/20">
                <ShieldCheck size={16} className="text-white" strokeWidth={2.4} />
              </div>
              <div>
                <span className="text-sm font-bold tracking-tight text-[#111827] block leading-tight">DESIGN-EVENT</span>
                <span className="text-[11px] text-[#9CA3AF] block font-medium leading-tight">Admin Operations</span>
              </div>
            </div>

            {/* Nav Tabs */}
          </div>

          {/* Right Controls & Admin Profile */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setAddError('');
                setAddSuccess('');
                setShowAddModal(true);
              }}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-xs font-semibold text-white rounded-full shadow-sm shadow-indigo-500/20 transition cursor-pointer"
            >
              <UserPlus size={14} />
              <span className="hidden sm:inline">Add Participant</span>
            </button>

            {/* Live Indicator */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F3F4F6] text-xs">
              <span className={`w-2 h-2 rounded-full ${
                eventSettings?.status === 'LIVE' 
                  ? 'bg-emerald-500 animate-pulse' 
                  : eventSettings?.status === 'CLOSED'
                  ? 'bg-red-400'
                  : 'bg-amber-400'
              }`} />
              <span className="text-[#374151] font-semibold">{eventSettings?.status || 'SCHEDULED'}</span>
            </div>

            <button
              onClick={fetchDashboardData}
              className="p-2 bg-[#F3F4F6] hover:bg-[#E5E7EB] rounded-full text-[#6B7280] hover:text-[#111827] transition cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw size={15} className={loading ? "animate-spin text-indigo-500" : ""} />
            </button>

            <div className="flex items-center gap-2 pl-2 border-l border-[#E5E7EB]">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white">
                AD
              </div>
              <button
                onClick={logout}
                className="p-2 text-[#9CA3AF] hover:text-red-500 hover:bg-red-50 rounded-full transition cursor-pointer"
                title="Logout Admin"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto w-full px-6 py-8 space-y-8 flex-grow">
        
        {/* 2. PAGE HEADER */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#111827]">
              Competition Overview
            </h1>
            <p className="text-sm text-[#6B7280] mt-1">
              Real-time monitoring and control for Poster Design Round 1 (2nd & 3rd Year • {stats.total} Participants)
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setAddError('');
                setAddSuccess('');
                setShowAddModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-xs font-semibold text-white rounded-full shadow-sm shadow-indigo-500/20 transition cursor-pointer"
            >
              <UserPlus size={14} />
              Add Participant
            </button>

            <button
              onClick={() => {
                setImportError('');
                setImportFile(null);
                setParsedRows([]);
                setImportResultSummary(null);
                setShowImportModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold text-emerald-700 rounded-full transition cursor-pointer shadow-sm"
              title="Import participants in bulk from CSV file"
            >
              <Upload size={14} />
              Import Participants
            </button>

            <button
              onClick={handleResetData}
              disabled={resetting}
              className="flex items-center gap-2 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-xs font-semibold text-amber-700 rounded-full transition cursor-pointer disabled:opacity-50"
              title="Reset scores and timers for existing participants"
            >
              <RotateCcw size={14} className={resetting ? "animate-spin" : ""} />
              {resetting ? "Resetting..." : "Reset Round 1 Data"}
            </button>

            <button
              onClick={handleClearAllParticipants}
              disabled={clearing}
              className="flex items-center gap-2 px-3.5 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-xs font-semibold text-red-600 rounded-full transition cursor-pointer disabled:opacity-50"
              title="Delete all participant records from database"
            >
              <Trash2 size={14} className={clearing ? "animate-spin" : ""} />
              {clearing ? "Clearing..." : "Clear All Participants"}
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-semibold text-[#374151] rounded-full transition cursor-pointer shadow-sm"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>

        {/* 3. EVENT CONTROL BANNER CARD */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold text-[#111827]">Poster Design — Round 1</h2>
              
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F3F4F6] text-[#374151]">
                2nd & 3rd Year
              </span>

              <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
                eventSettings?.status === 'LIVE'
                  ? 'bg-emerald-50 text-emerald-600'
                  : eventSettings?.status === 'CLOSED'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-amber-50 text-amber-600'
              }`}>
                ● {eventSettings?.status || 'SCHEDULED'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-[#6B7280] font-medium">
              <span>Registered: <strong className="text-[#111827]">{stats.total}</strong></span>
              <span>Active: <strong className="text-amber-600">{stats.active}</strong></span>
              <span>Completed: <strong className="text-emerald-600">{stats.completed}</strong></span>
              <span>Waiting: <strong className="text-[#6B7280]">{stats.pending}</strong></span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#9CA3AF] pt-1 font-mono">
              <span>Started At: {eventSettings?.started_at ? new Date(eventSettings.started_at).toLocaleTimeString() : 'Not Started'}</span>
              <span>Closed At: {eventSettings?.closed_at ? new Date(eventSettings.closed_at).toLocaleTimeString() : '--:--'}</span>
            </div>
          </div>

          {/* Event Action Button */}
          <div className="shrink-0">
            {eventSettings?.status === 'SCHEDULED' && (
              <button
                onClick={() => handleUpdateStatus('LIVE')}
                disabled={updatingStatus}
                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-xs font-semibold text-white rounded-full shadow-lg shadow-indigo-500/25 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2.5 tracking-wide uppercase active:scale-[0.98]"
              >
                <Power size={16} />
                {updatingStatus ? 'Starting Round 1...' : 'Start Round 1'}
              </button>
            )}

            {eventSettings?.status === 'LIVE' && (
              <button
                onClick={() => handleUpdateStatus('CLOSED')}
                disabled={updatingStatus}
                className="px-6 py-3 bg-red-500 hover:bg-red-600 text-xs font-semibold text-white rounded-full shadow-lg shadow-red-500/25 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2.5 tracking-wide uppercase active:scale-[0.98]"
              >
                <Power size={16} />
                {updatingStatus ? 'Closing Round 1...' : 'Close Round 1'}
              </button>
            )}

            {eventSettings?.status === 'CLOSED' && (
              <button
                onClick={() => handleUpdateStatus('LIVE')}
                disabled={updatingStatus}
                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-xs font-semibold text-white rounded-full shadow-lg shadow-indigo-500/25 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2.5 tracking-wide uppercase active:scale-[0.98]"
              >
                <RotateCcw size={16} />
                {updatingStatus ? 'Re-opening...' : 'Re-open Round 1'}
              </button>
            )}
          </div>
        </div>

        {/* 4. KPI CARDS GRID */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          
          {/* 1. Total Pool */}
          <div className="bg-white border border-[#E5E7EB] p-5 rounded-2xl shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between text-[#9CA3AF] mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide">Total Registered</span>
              <div className="p-2 rounded-full bg-[#F3F4F6] text-[#6B7280]">
                <Users size={16} />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#111827]">{stats.total}</div>
            <p className="text-[11px] text-[#9CA3AF] font-medium mt-1">Total participants</p>
          </div>

          {/* 2. Active */}
          <div className="bg-white border border-[#E5E7EB] p-5 rounded-2xl shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between text-[#9CA3AF] mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide">Active</span>
              <div className="p-2 rounded-full bg-amber-50 text-amber-600">
                <Activity size={16} />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-600">{stats.active}</div>
            <p className="text-[11px] text-[#9CA3AF] font-medium mt-1">Currently attempting</p>
          </div>

          {/* 3. Completed */}
          <div className="bg-white border border-[#E5E7EB] p-5 rounded-2xl shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between text-[#9CA3AF] mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide">Completed</span>
              <div className="p-2 rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={16} />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600">{stats.completed}</div>
            <p className="text-[11px] text-[#9CA3AF] font-medium mt-1">Submissions received</p>
          </div>

          {/* 4. Not Started */}
          <div className="bg-white border border-[#E5E7EB] p-5 rounded-2xl shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between text-[#9CA3AF] mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide">Not Started</span>
              <div className="p-2 rounded-full bg-gray-100 text-gray-500">
                <Clock size={16} />
              </div>
            </div>
            <div className="text-2xl font-bold text-[#374151]">{stats.pending}</div>
            <p className="text-[11px] text-[#9CA3AF] font-medium mt-1">Waiting to begin</p>
          </div>

          {/* 5. Average Score */}
          <div className="bg-white border border-[#E5E7EB] p-5 rounded-2xl shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between text-[#9CA3AF] mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide">Avg Score</span>
              <div className="p-2 rounded-full bg-purple-50 text-purple-600">
                <TrendingUp size={16} />
              </div>
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {Number(stats.avgScore || 0).toFixed(1)} <span className="text-xs text-[#9CA3AF] font-normal">/100</span>
            </div>
            <p className="text-[11px] text-[#9CA3AF] font-medium mt-1">Across completed</p>
          </div>

          {/* 6. Top Score */}
          <div className="bg-white border border-[#E5E7EB] p-5 rounded-2xl shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between text-[#9CA3AF] mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide">Top Score</span>
              <div className="p-2 rounded-full bg-amber-50 text-amber-600">
                <Trophy size={16} />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-600">
              {Number(stats.maxScore || 0).toFixed(1)} <span className="text-xs text-[#9CA3AF] font-normal">/100</span>
            </div>
            <p className="text-[11px] text-[#9CA3AF] font-medium mt-1">Leading submission</p>
          </div>

        </div>

        {/* 5. VISUALIZATIONS & LIVE ACTIVITY GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Progress & Distribution */}
          <div className="lg:col-span-2 bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-[#F1F1F1] pb-4">
              <div>
                <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                  <BarChart3 size={18} className="text-indigo-500" />
                  Participant Progress & Completion Distribution
                </h3>
                <p className="text-xs text-[#9CA3AF] mt-0.5">Real-time status breakdown across {stats.total} registered participants</p>
              </div>
              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                {completionPercentage}% Complete
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-[#374151]">
                <span>Completion Status</span>
                <span>{stats.completed} of {stats.total} Submitted</span>
              </div>
              <div className="w-full h-3 bg-[#F1F5F9] rounded-full overflow-hidden flex">
                <div 
                  style={{ width: `${completionPercentage}%` }} 
                  className="bg-emerald-500 h-full transition-all duration-500" 
                  title={`Completed: ${stats.completed}`}
                />
                <div 
                  style={{ width: `${activePercentage}%` }} 
                  className="bg-amber-400 h-full transition-all duration-500" 
                  title={`Active: ${stats.active}`}
                />
                <div 
                  style={{ width: `${pendingPercentage}%` }} 
                  className="bg-gray-200 h-full transition-all duration-500" 
                  title={`Not Started: ${stats.pending}`}
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-[#374151] font-medium">Completed ({stats.completed})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="text-[#374151] font-medium">Active ({stats.active})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                  <span className="text-[#9CA3AF] font-medium">Not Started ({stats.pending})</span>
                </div>
              </div>
            </div>

            {/* Score Spectrum Chart */}
            <div className="pt-2">
              <h4 className="text-xs font-semibold text-[#9CA3AF] mb-3 uppercase tracking-wide">Score Breakdown Spectrum</h4>
              <div className="h-28 bg-[#F9FAFB] rounded-xl border border-[#F1F1F1] p-4 flex items-end justify-between gap-2">
                {leaderboard.length === 0 || stats.completed === 0 ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[#9CA3AF] text-xs font-medium">
                    <Clock size={20} className="mb-1 text-[#D1D5DB]" />
                    <span>No submissions evaluated yet. Spectrum will render live on submission.</span>
                  </div>
                ) : (
                  leaderboard.slice(0, 15).map((p, idx) => {
                    const heightPercent = Math.max(10, Math.min(100, (Number(p.final_score) / 100) * 100));
                    return (
                      <div key={p.id || idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div className="absolute -top-8 bg-[#111827] text-white text-[10px] font-medium px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-50">
                          {p.roll_number}: {Number(p.final_score).toFixed(1)} pts
                        </div>
                        <div 
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-gradient-to-t from-indigo-500 to-blue-500 hover:opacity-80 rounded-t transition"
                        />
                        <span className="text-[9px] text-[#9CA3AF] font-mono hidden sm:inline font-medium">{p.roll_number.slice(-3)}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* 6. LIVE EVENT ACTIVITY FEED */}
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#F1F1F1] pb-4">
                <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
                  <Activity size={18} className="text-indigo-500" />
                  Live Event Activity
                </h3>
                <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase">
                  Realtime
                </span>
              </div>

              {recentActivities.length === 0 ? (
                <div className="py-12 text-center text-[#9CA3AF] space-y-2">
                  <Clock size={28} className="mx-auto text-[#D1D5DB]" />
                  <p className="text-xs font-semibold text-[#111827]">Waiting for event activity...</p>
                  <p className="text-[11px] text-[#9CA3AF]">
                    Activities will appear live here as participants log in, start tasks, and submit posters.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivities.map((act) => (
                    <div key={act.id} className="p-3 bg-[#F9FAFB] rounded-xl border border-[#F1F1F1] flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                          act.isSubmission
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-amber-50 text-amber-600'
                        }`}>
                          {act.roll_number.slice(-3)}
                        </div>
                        <div>
                          <div className="font-semibold text-[#111827]">{act.roll_number}</div>
                          <div className="text-[11px] text-[#9CA3AF]">{act.action}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        {act.isSubmission && (
                          <span className="font-semibold text-indigo-600 block">
                            {Number(act.score).toFixed(1)} <span className="text-[10px] text-[#9CA3AF] font-normal">pts</span>
                          </span>
                        )}
                        <span className="text-[10px] text-[#9CA3AF] font-mono">
                          {act.time.toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#F1F1F1] text-[11px] text-[#9CA3AF] flex items-center justify-between font-medium">
              <span>Auto-syncing via Supabase Realtime</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
          </div>

        </div>

        {/* 7. PARTICIPANTS & LEADERBOARD TABLE */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden space-y-4 p-6">
          
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#F1F1F1] pb-4">
            <div>
              <h3 className="text-lg font-bold text-[#111827] flex items-center gap-2">
                <Users size={18} className="text-indigo-500" />
                Registered Participants Roster
              </h3>
              <p className="text-xs text-[#9CA3AF] mt-0.5">Manually registered 2nd & 3rd year participants preserved in registration order</p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              
              <button
                onClick={() => {
                  setAddError('');
                  setAddSuccess('');
                  setShowAddModal(true);
                }}
                className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-xs font-semibold text-white rounded-full shadow-sm shadow-indigo-500/20 transition cursor-pointer"
              >
                <UserPlus size={14} />
                <span>Add Participant</span>
              </button>

              <button
                onClick={() => {
                  setImportError('');
                  setImportFile(null);
                  setParsedRows([]);
                  setImportResultSummary(null);
                  setShowImportModal(true);
                }}
                className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold text-emerald-700 rounded-full transition cursor-pointer shadow-sm"
                title="Import participants in bulk from CSV file"
              >
                <Upload size={14} />
                <span>Import Participants</span>
              </button>


              <div className="relative flex-1 md:w-56">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  type="text"
                  placeholder="Search roll, name, dept..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-full pl-9 pr-3 py-2 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-indigo-400 focus:bg-white transition font-medium"
                />
              </div>

              <div className="flex items-center bg-[#F3F4F6] p-1 rounded-full text-xs">
                {['ALL', 'pending', 'started', 'submitted'].map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-2.5 py-1 rounded-full font-semibold text-[11px] uppercase transition cursor-pointer ${
                      statusFilter === f
                        ? 'bg-white text-[#111827] shadow-sm'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-full px-3 py-2 text-xs text-[#111827] focus:outline-none cursor-pointer font-semibold"
              >
                <option value="order">Registration Order</option>
                <option value="rank">Sort by Rank</option>
                <option value="score">Sort by Score</option>
                <option value="roll">Sort by Roll No</option>
                <option value="speed">Sort by Speed</option>
              </select>
            </div>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#374151]">
              <thead className="bg-[#F9FAFB] text-[#6B7280] uppercase font-semibold text-[11px] tracking-wide border-b border-[#E5E7EB]">
                <tr>
                  <th className="py-3.5 px-4 text-center w-16">Order</th>
                  <th className="py-3.5 px-4">Register Number</th>
                  <th className="py-3.5 px-4">Participant Name</th>
                  <th className="py-3.5 px-4 text-center">Year</th>
                  <th className="py-3.5 px-4 text-center">Speed (Time Taken)</th>
                  <th className="py-3.5 px-4 text-right">Score (/100)</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F1F1]">
                {filteredLeaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[#9CA3AF] space-y-2">
                      <Clock size={28} className="mx-auto text-[#D1D5DB]" />
                      <p className="text-sm font-semibold text-[#111827]">No participant records found</p>
                      <p className="text-xs text-[#9CA3AF]">
                        {searchQuery ? "Try resetting your search query" : "Click 'Add Participant' to register students for the event."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredLeaderboard.map((p, index) => {
                    const orderNum = p.regIndex || index + 1;
                    
                    return (
                      <tr 
                        key={p.id || p.roll_number}
                        className="hover:bg-[#F9FAFB] transition group"
                      >
                        {/* Order Number */}
                        <td className="py-3.5 px-4 text-center font-medium">
                          <span className="text-[#374151] font-mono text-xs bg-[#F3F4F6] px-2 py-0.5 rounded-full">
                            #{orderNum}
                          </span>
                        </td>

                        {/* Roll Number */}
                        <td className="py-3.5 px-4 font-mono font-semibold text-[#111827]">
                          {p.roll_number}
                        </td>

                        {/* Participant Name */}
                        <td className="py-3.5 px-4 font-medium text-[#111827]">
                          {p.name}
                        </td>

                        {/* Year */}
                        <td className="py-3.5 px-4 text-center font-semibold">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            p.year === 3 
                              ? 'bg-purple-50 text-purple-700 border-purple-200' 
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {p.year === 3 ? '3rd Year' : '2nd Year'}
                          </span>
                        </td>

                        {/* Speed / Time Taken */}
                        <td className="py-3.5 px-4 text-center font-mono font-semibold">
                          {p.status === 'submitted' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md text-xs font-semibold">
                              ⏱️ {formatDuration(p.durationMs)}
                            </span>
                          ) : p.status === 'started' ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-md text-xs font-semibold animate-pulse">
                              ⏳ {formatDuration(p.durationMs)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs font-medium">—</span>
                          )}
                        </td>

                        {/* Score */}
                        <td className="py-3.5 px-4 text-right font-semibold">
                          <span className={p.final_score > 0 ? "text-indigo-600 font-bold text-sm" : "text-[#D1D5DB]"}>
                            {Number(p.final_score || 0).toFixed(1)}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${
                            p.status === 'submitted'
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                              : p.status === 'started'
                              ? 'bg-amber-50 text-amber-600 border-amber-200'
                              : 'bg-gray-100 text-gray-500 border-gray-200'
                          }`}>
                            {p.status}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => {
                              setDeleteError('');
                              setDeleteSuccess('');
                              setSelectedParticipantForDelete(p);
                            }}
                            disabled={isDeletingParticipant && selectedParticipantForDelete?.roll_number === p.roll_number}
                            className="px-2.5 py-1 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 font-semibold text-xs"
                            title={`Delete participant ${p.roll_number}`}
                          >
                            <Trash2 size={13} className="shrink-0" />
                            <span>Delete</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer Summary */}
          <div className="flex items-center justify-between text-xs text-[#9CA3AF] pt-2 border-t border-[#F1F1F1] font-medium">
            <span>Showing {filteredLeaderboard.length} of {leaderboard.length} participants</span>
            <span>Manual Admin Registration Active</span>
          </div>

        </div>

      </main>

      {/* ADD PARTICIPANT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg">
            <div className="relative bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl overflow-hidden">

              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-[#F1F1F1] flex items-center justify-between bg-[#F9FAFB]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center shadow-sm shadow-indigo-500/20">
                    <UserPlus size={16} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#111827]">Add New Participant</h3>
                    <p className="text-xs text-[#9CA3AF]">Manually register a student for Round 1</p>
                  </div>
                </div>

                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1.5 rounded-full text-[#9CA3AF] hover:text-[#111827] hover:bg-white transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleAddParticipantSubmit} className="p-6 space-y-4">
                
                {addError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{addError}</span>
                  </div>
                )}

                {addSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-2">
                    <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                    <span>{addSuccess}</span>
                  </div>
                )}

                {/* Field 1: Batch Number / Register Number & Full Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5">
                      Batch Number / Register Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 23IT001 or 24CS015"
                      value={addForm.rollNumber}
                      onChange={(e) => setAddForm({ ...addForm, rollNumber: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-xs font-mono font-semibold text-[#111827] focus:border-indigo-400 focus:bg-white focus:outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. John Doe"
                      value={addForm.name}
                      onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-xs font-medium text-[#111827] focus:border-indigo-400 focus:bg-white focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Field 2: Year of Study */}
                <div>
                  <label className="block text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5">
                    Year of Study <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={addForm.year}
                    onChange={(e) => setAddForm({ ...addForm, year: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-xs font-semibold text-[#111827] focus:border-indigo-400 focus:bg-white focus:outline-none cursor-pointer transition-colors"
                  >
                    <option value={2}>2nd Year</option>
                    <option value={3}>3rd Year</option>
                  </select>
                </div>

                {/* Modal Actions */}
                <div className="pt-4 border-t border-[#F1F1F1] flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2.5 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-xs font-semibold text-[#374151] rounded-full transition cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmittingParticipant}
                    className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:opacity-50 text-xs font-semibold text-white rounded-full shadow-lg shadow-indigo-500/25 transition-all cursor-pointer flex items-center gap-2 active:scale-[0.98]"
                  >
                    {isSubmittingParticipant ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Adding Participant...
                      </>
                    ) : (
                      <>
                        <UserPlus size={14} />
                        Register Participant
                      </>
                    )}
                  </button>
                </div>

              </form>

            </div>
          </div>
        </div>
      )}

      {/* DELETE INDIVIDUAL PARTICIPANT MODAL */}
      {selectedParticipantForDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md">
            <div className="relative bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl overflow-hidden">
              
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-[#F1F1F1] flex items-center justify-between bg-red-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shadow-sm">
                    <Trash2 size={16} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#111827]">Delete Participant</h3>
                    <p className="text-xs text-red-600 font-medium">Confirmation Required</p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedParticipantForDelete(null)}
                  disabled={isDeletingParticipant}
                  className="p-1.5 rounded-full text-[#9CA3AF] hover:text-[#111827] hover:bg-white transition cursor-pointer disabled:opacity-50"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                
                {deleteError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{deleteError}</span>
                  </div>
                )}

                {deleteSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-2">
                    <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                    <span>{deleteSuccess}</span>
                  </div>
                )}

                {/* Target Participant Summary Card */}
                <div className="p-3.5 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-[#111827]">
                      {selectedParticipantForDelete.roll_number}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${
                      selectedParticipantForDelete.status === 'submitted'
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : selectedParticipantForDelete.status === 'started'
                        ? 'bg-amber-50 text-amber-600 border-amber-200'
                        : 'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>
                      {selectedParticipantForDelete.status}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[#374151]">
                    {selectedParticipantForDelete.name}
                  </div>
                  <div className="text-[11px] text-[#6B7280]">
                    {selectedParticipantForDelete.year ? `${selectedParticipantForDelete.year}nd/rd Year` : '2nd Year'}
                    {selectedParticipantForDelete.final_score > 0 && ` • Score: ${Number(selectedParticipantForDelete.final_score).toFixed(1)} pts`}
                  </div>
                </div>

                {/* Status-specific warning messages */}
                {selectedParticipantForDelete.status === 'started' && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-amber-900">
                      <span>⚠️ Active Session In Progress!</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Participant is currently attempting the test. Deleting this participant will terminate their active session and unlock their device.
                    </p>
                  </div>
                )}

                {selectedParticipantForDelete.status === 'submitted' && (
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-red-900">
                      <span>⚠️ Submission Recorded!</span>
                    </div>
                    <p className="text-[11px] text-red-800 leading-relaxed">
                      Participant has submitted their poster (Score: {Number(selectedParticipantForDelete.final_score).toFixed(1)} pts). Deleting will permanently erase their submission, scores, and task results.
                    </p>
                  </div>
                )}

                {/* Scope confirmation note */}
                <div className="text-xs text-[#374151] space-y-1">
                  <p className="font-medium">
                    Are you sure you want to delete participant <strong className="text-[#111827]">{selectedParticipantForDelete.roll_number}</strong>?
                  </p>
                  <p className="text-[11px] text-[#6B7280] bg-blue-50/60 border border-blue-100 p-2 rounded-lg text-blue-700">
                    ℹ️ <strong>Scope Notice:</strong> This action affects <strong>ONLY</strong> this participant ({selectedParticipantForDelete.roll_number}). No other participants will be modified or deleted.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-[#F1F1F1] flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedParticipantForDelete(null)}
                    disabled={isDeletingParticipant}
                    className="px-4 py-2 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-xs font-semibold text-[#374151] rounded-full transition cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteParticipant}
                    disabled={isDeletingParticipant}
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-xs font-semibold text-white rounded-full shadow-md shadow-red-500/25 transition-all cursor-pointer flex items-center gap-2 active:scale-[0.98]"
                  >
                    {isDeletingParticipant ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 size={14} />
                        Confirm Delete
                      </>
                    )}
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}



      {/* BULK CSV IMPORT MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#F1F1F1] flex items-center justify-between bg-[#F9FAFB] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-sm shadow-emerald-500/20">
                  <Upload size={16} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111827]">Import Participants from CSV</h3>
                  <p className="text-xs text-[#9CA3AF]">Bulk register students using a valid CSV file</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                  setParsedRows([]);
                  setImportResultSummary(null);
                }}
                disabled={isImportingBulk}
                className="p-1.5 rounded-full text-[#9CA3AF] hover:text-[#111827] hover:bg-white transition cursor-pointer disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 overflow-y-auto flex-grow">
              
              {/* File Selector & CSV Guide */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <label className="block text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                    Select CSV File <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleCSVFileSelect}
                      disabled={isParsingCSV || isImportingBulk}
                      className="block w-full text-xs text-[#374151] file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer border border-[#E5E7EB] rounded-xl p-1.5 bg-[#F9FAFB]"
                    />
                  </div>
                </div>

                <div className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs space-y-1">
                  <div className="font-semibold text-[#111827] flex items-center gap-1.5">
                    <FileText size={14} className="text-emerald-600" />
                    <span>Expected CSV Format:</span>
                  </div>
                  <pre className="font-mono text-[10px] text-[#4B5563] bg-white p-2 rounded border border-[#E5E7EB] overflow-x-auto">
{`roll_number,name,year
274066,Arun Kumar,3
284001,Karthik,2`}
                  </pre>
                  <p className="text-[10px] text-[#9CA3AF]">
                    Supported ranges: <strong>274001–274070</strong> &amp; <strong>284001–284070</strong>
                  </p>
                </div>
              </div>

              {/* Error Message */}
              {importError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Success Result Summary Alert */}
              {importResultSummary && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>Import Completed Successfully!</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 font-medium text-[11px]">
                    <span>Successfully Imported: <strong className="text-emerald-700">{importResultSummary.imported}</strong></span>
                    <span>Already Registered: <strong>{importResultSummary.alreadyRegistered}</strong></span>
                    <span>Duplicates: <strong>{importResultSummary.duplicates}</strong></span>
                    <span>Invalid: <strong>{importResultSummary.invalid}</strong></span>
                  </div>
                </div>
              )}

              {/* Parsing Spinner */}
              {isParsingCSV && (
                <div className="py-8 text-center text-xs text-[#6B7280] space-y-2">
                  <span className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin inline-block" />
                  <p>Parsing and validating CSV contents...</p>
                </div>
              )}

              {/* Parsed Rows Summary Badges */}
              {parsedRows.length > 0 && !isParsingCSV && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F1F1] pb-3">
                    <div className="text-xs font-bold text-[#111827]">
                      CSV Preview &amp; Validation Results ({parsedRows.length} Rows)
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Valid: {parsedRows.filter(r => r.status === 'VALID').length}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        Already Reg: {parsedRows.filter(r => r.status === 'ALREADY REGISTERED').length}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        Duplicates: {parsedRows.filter(r => r.status === 'DUPLICATE').length}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                        Invalid: {parsedRows.filter(r => r.status === 'INVALID').length}
                      </span>
                    </div>
                  </div>

                  {/* Preview Data Table */}
                  <div className="overflow-x-auto max-h-64 border border-[#E5E7EB] rounded-xl">
                    <table className="w-full text-left text-xs text-[#374151]">
                      <thead className="bg-[#F9FAFB] text-[#6B7280] uppercase font-semibold text-[10px] tracking-wide border-b border-[#E5E7EB] sticky top-0 bg-white z-10">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-12">Row</th>
                          <th className="py-2.5 px-3">Roll Number</th>
                          <th className="py-2.5 px-3">Name</th>
                          <th className="py-2.5 px-3 text-center">Year</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                          <th className="py-2.5 px-3">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F1F1]">
                        {parsedRows.map((row) => (
                          <tr key={row.rowNum} className="hover:bg-[#F9FAFB]">
                            <td className="py-2 px-3 text-center font-mono text-[11px] text-[#9CA3AF]">
                              #{row.rowNum}
                            </td>
                            <td className="py-2 px-3 font-mono font-semibold text-[#111827]">
                              {row.roll_number || '—'}
                            </td>
                            <td className="py-2 px-3 font-medium text-[#111827]">
                              {row.name || '—'}
                            </td>
                            <td className="py-2 px-3 text-center font-semibold">
                              {row.year === 3 ? '3rd Year' : '2nd Year'}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${
                                row.status === 'VALID'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : row.status === 'ALREADY REGISTERED'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : row.status === 'DUPLICATE'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }`}>
                                {row.status}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-[11px] text-[#6B7280]">
                              {row.reason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[#F1F1F1] flex items-center justify-between bg-[#F9FAFB] shrink-0">
              <div className="text-xs text-[#6B7280] font-medium">
                {parsedRows.filter(r => r.status === 'VALID').length > 0 ? (
                  <span>
                    Ready to import <strong>{parsedRows.filter(r => r.status === 'VALID').length}</strong> new valid participant(s).
                  </span>
                ) : (
                  <span>Select a valid CSV file to preview.</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportModal(false);
                    setImportFile(null);
                    setParsedRows([]);
                    setImportResultSummary(null);
                  }}
                  disabled={isImportingBulk}
                  className="px-4 py-2 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-xs font-semibold text-[#374151] rounded-full transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleBulkImportSubmit}
                  disabled={isImportingBulk || parsedRows.filter(r => r.status === 'VALID').length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-xs font-semibold text-white rounded-full shadow-md shadow-emerald-500/25 transition-all cursor-pointer flex items-center gap-2 active:scale-[0.98]"
                >
                  {isImportingBulk ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Importing Participants...
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      Import {parsedRows.filter(r => r.status === 'VALID').length} Valid Participant(s)
                    </>
                  )}
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="border-t border-[#E5E7EB] py-4 px-6 text-center text-xs text-[#9CA3AF] bg-white font-medium">
        © 2026 Poster Competition Admin Operations Console • 2nd & 3rd Year • Manual Participant Registration Active
      </footer>

    </div>
  );
};

export default AdminDashboardPage;