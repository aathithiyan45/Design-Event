import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    'Warning: Supabase credentials (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are missing. ' +
    'The application is running in offline mode. Configure .env to restore database actions.'
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: () =>
          Promise.reject(
            new Error(
              'Supabase connection details are missing. Please define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
            )
          ),
        signUp: () => Promise.reject(new Error('Supabase is not configured.')),
        signOut: () => Promise.resolve(),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            single: () => Promise.resolve({ data: null, error: null }),
            order: () => Promise.resolve({ data: [], error: null }),
          }),
          order: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
        insert: () => Promise.reject(new Error('Supabase is not configured.')),
        update: () => ({
          eq: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      functions: {
        invoke: () =>
          Promise.reject(
            new Error('Supabase is not configured. Submission and evaluation functions are unavailable.')
          ),
      },
      channel: () => ({
        on: () => ({
          subscribe: () => {},
        }),
      }),
      removeChannel: () => {},
    };

/**
 * Format roll number as a virtual email for Supabase Auth.
 */
export const formatRollNumberToEmail = (rollNumber) => {
  return `${rollNumber.trim().toLowerCase()}@design-event.com`;
};

/**
 * Log in a participant using their Roll Number.
 * Roll numbers are translated to virtual emails.
 */
export const loginParticipantService = async (rollNumber) => {
  const formattedRoll = rollNumber.trim().toUpperCase();

  try {
    // 1. Call database RPC function to authenticate atomically and acquire active session lock
    const { data: rpcData, error: rpcError } = await supabase.rpc('authenticate_participant', {
      p_roll_number: formattedRoll
    });

    if (rpcError) {
      throw new Error(rpcError.message || 'Database RPC connection failed.');
    }

    if (!rpcData.success) {
      throw new Error(rpcData.error || 'Access denied.');
    }

    // 2. Store active session details in sessionStorage
    sessionStorage.setItem('design_event_session_id', rpcData.session_id);
    sessionStorage.setItem('design_event_user_id', rpcData.user_id);

    const user = { id: rpcData.user_id, roll_number: formattedRoll };

    return { user, session_id: rpcData.session_id };
  } catch (error) {
    return { error };
  }
};

/**
 * Log out a participant and clear the active session lock in database.
 */
export const logoutParticipantService = async () => {
  try {
    const userId = sessionStorage.getItem('design_event_user_id');
    if (userId) {
      await supabase.rpc('release_participant_session', { p_user_id: userId });
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase.rpc('release_participant_session', { p_user_id: session.user.id });
      }
    }
  } catch (e) {
    console.error('Failed to release participant session:', e);
  } finally {
    sessionStorage.removeItem('design_event_session_id');
    sessionStorage.removeItem('design_event_user_id');
    await supabase.auth.signOut();
  }
};

/**
 * Admin Login
 */
export const loginAdminService = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    // Verify they are in the admins table
    const { data: adminRecord, error: adminErr } = await supabase
      .from('admins')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();

    if (adminErr || !adminRecord) {
      // Not an admin
      await supabase.auth.signOut();
      throw new Error('Access denied: User is not registered as an administrator.');
    }

    return { user: data.user, session: data.session };
  } catch (error) {
    return { error };
  }
};

/**
 * Get current participant data
 */
export const getParticipantProfile = async (userId) => {
  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return { data, error };
};

/**
 * Record participant click on "Start Round"
 */
export const startParticipantRound = async (userId) => {
  const { data, error } = await supabase
    .from('participants')
    .update({
      started_at: new Date().toISOString(),
      status: 'started'
    })
    .eq('id', userId)
    .select()
    .single();

  return { data, error };
};

/**
 * Get all tasks (excluding target layouts)
 */
export const getTasksService = async () => {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, instruction, reference_asset, max_points, public_config')
    .order('id', { ascending: true });
  return { data, error };
};

/**
 * Submit design JSON for evaluation
 * Calls the Supabase Edge Function to calculate the score server-side
 */
export const submitDesignService = async (designJson, sessionId, initialDesigns) => {
  try {
    const activeSessionId = sessionId || sessionStorage.getItem('design_event_session_id') || '';

    if (!activeSessionId) {
      throw new Error('Participant session not found. Please log in again.');
    }

    // There is intentionally ONE production scoring path.
    // The score must come from the deployed evaluate-submission Edge Function.
    const { data, error } = await supabase.functions.invoke('evaluate-submission', {
      body: {
        designJson,
        initialDesigns,
        sessionId: activeSessionId,
      },
    });

    if (error) {
      // Check if the participant is already submitted in database
      const userId = sessionStorage.getItem('design_event_user_id');
      if (userId) {
        const { data: p } = await supabase.from('participants').select('id, status, final_score').eq('id', userId).maybeSingle();
        if (p?.status === 'submitted') {
          const { submission } = await getSubmissionResult(userId);
          if (submission) {
            return { data: { success: true, score: submission.total_score, submissionId: submission.id, alreadySubmitted: true }, error: null };
          }
        }
      }
      throw new Error(error.message || 'Evaluation service is unavailable. Please try again.');
    }

    if (!data || data.success !== true) {
      if (data?.error?.includes('locked') || data?.error?.includes('already finalized')) {
        const userId = sessionStorage.getItem('design_event_user_id');
        if (userId) {
          const { submission } = await getSubmissionResult(userId);
          if (submission) {
            return { data: { success: true, score: submission.total_score, submissionId: submission.id, alreadySubmitted: true }, error: null };
          }
        }
      }
      throw new Error(data?.error || 'Evaluation failed. Please try again.');
    }

    return { data, error: null };
  } catch (error) {
    console.error('Submission processing error:', error);
    return { data: null, error };
  }
};

/**
 * Retrieve current user's submission & results
 */
export const getSubmissionResult = async (participantId, submissionId = null) => {
  let query = supabase
    .from('submissions')
    .select('*')
    .eq('participant_id', participantId);

  if (submissionId) {
    query = query.eq('id', submissionId);
  } else {
    query = query.order('submitted_at', { ascending: false }).limit(1);
  }

  const { data: submissions, error: subError } = await query;

  const submission = submissions && submissions.length > 0 ? submissions[0] : null;

  if (subError || !submission) {
    return { submission: null, results: [], error: subError };
  }

  const { data: results, error: resError } = await supabase
    .from('task_results')
    .select('*')
    .eq('submission_id', submission.id);

  return { submission, results, error: resError };
};

/**
 * Reset participant status to in_progress to allow retaking the challenge
 */
export const resetParticipantStatusService = async (participantId) => {
  if (!participantId) return { error: 'No participant ID provided' };

  const { error } = await supabase
    .from('participants')
    .update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
      final_score: null,
      submitted_at: null,
      active_session_id: null
    })
    .eq('id', participantId);

  return { error };
};

/**
 * Admin: Manually Add a Participant
 */
export const addParticipantService = async (participantData) => {
  const { rollNumber, name, year, department, email, phone } = participantData;
  const formattedRoll = (rollNumber || '').trim().toUpperCase();
  const trimmedName = (name || '').trim();
  const numYear = Number(year) || 2;
  const trimmedDept = (department || '').trim() || null;
  const trimmedEmail = (email || '').trim() || null;
  const trimmedPhone = (phone || '').trim() || null;

  if (!formattedRoll) {
    return { error: new Error('Register Number is required.') };
  }
  if (!trimmedName) {
    return { error: new Error('Participant Name is required.') };
  }

  try {
    // 1. Call database RPC function for atomic server-side creation
    const { data: rpcData, error: rpcError } = await supabase.rpc('register_participant', {
      p_roll_number: formattedRoll,
      p_name: trimmedName,
      p_year: numYear,
      p_department: trimmedDept,
      p_email: trimmedEmail,
      p_phone: trimmedPhone
    });

    const isRpcMissing = rpcError && (
      rpcError.status === 404 ||
      rpcError.code === 'PGRST202' ||
      rpcError.message?.includes('Could not find') ||
      rpcError.message?.includes('does not exist') ||
      rpcError.message?.includes('404')
    );

    if (rpcError && !isRpcMissing) {
      return { error: new Error(rpcError.message) };
    }

    if (rpcData) {
      if (rpcData.success) {
        return { data: rpcData.participant, error: null };
      }
      // If RPC fails due to legacy year check constraint, continue to fallback client insert
      if (!rpcData.error?.includes('participants_year_check') && !rpcData.error?.includes('check constraint')) {
        return { error: new Error(rpcData.error || 'Failed to register participant.') };
      }
    }

    // 2. Fallback to client-side insert if RPC is missing/offline or hits legacy constraint
    const { data: existing } = await supabase
      .from('participants')
      .select('id')
      .eq('roll_number', formattedRoll)
      .maybeSingle();

    if (existing) {
      return { error: new Error(`Participant with Register Number "${formattedRoll}" is already registered.`) };
    }

    const newId = crypto.randomUUID ? crypto.randomUUID() : `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const finalEmail = trimmedEmail || `${formattedRoll.toLowerCase()}@design-event.com`;

    // Attempt client-side insert with full fields
    let { data: newParticipant, error: insertError } = await supabase
      .from('participants')
      .insert({
        id: newId,
        roll_number: formattedRoll,
        name: trimmedName,
        year: numYear,
        department: trimmedDept,
        email: finalEmail,
        phone: trimmedPhone,
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    // If extended columns do not exist or year check constraint fails, retry with core schema fields
    if (insertError && (
      insertError.code === '42703' ||
      insertError.code === '23514' ||
      insertError.message?.includes('column') ||
      insertError.message?.includes('participants_year_check') ||
      insertError.message?.includes('check constraint')
    )) {
      const basicResult = await supabase
        .from('participants')
        .insert({
          id: newId,
          roll_number: formattedRoll,
          name: trimmedName,
          status: 'pending'
        })
        .select()
        .single();

      newParticipant = basicResult.data;
      insertError = basicResult.error;
    }

    if (insertError) {
      if (insertError.code === '23505' || insertError.message?.includes('unique')) {
        return { error: new Error(`Participant with Register Number "${formattedRoll}" is already registered.`) };
      }
      return { error: insertError };
    }

    return { data: newParticipant, error: null };
  } catch (error) {
    console.error('Error adding participant:', error);
    return { error };
  }
};

/**
 * Admin: Get active dashboard metrics
 */
export const getAdminStatsService = async () => {
  // Fetch participants
  let query = supabase.from('participants').select('id, status, final_score');
  const { data: participants, error } = await query;

  if (error) return { error };

  const total = participants.length;
  const active = participants.filter(p => p.status === 'started').length;
  const completed = participants.filter(p => p.status === 'submitted').length;
  const pending = participants.filter(p => p.status === 'pending').length;

  const scores = participants.filter(p => p.status === 'submitted').map(p => Number(p.final_score));
  const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 0;
  const maxScore = scores.length ? Math.max(...scores) : 0;

  return {
    data: {
      total,
      active,
      completed,
      pending,
      avgScore,
      maxScore
    }
  };
};

/**
 * Admin: Get Leaderboard & Full Participant List
 */
export const getAdminLeaderboardService = async () => {
  let { data, error } = await supabase
    .from('participants')
    .select('id, roll_number, name, year, department, email, phone, created_at, final_score, started_at, submitted_at, status')
    .order('created_at', { ascending: true });

  // Fallback if schema does not have created_at / extended columns
  if (error) {
    const fallbackRes = await supabase
      .from('participants')
      .select('id, roll_number, name, final_score, started_at, submitted_at, status');

    if (!fallbackRes.error && fallbackRes.data) {
      return { data: fallbackRes.data, error: null };
    }
  }

  return { data, error };
};

/**
 * General: Get event settings
 */
export const getEventSettingsService = async () => {
  const { data, error } = await supabase
    .from('event_settings')
    .select('*')
    .eq('id', 'round_1')
    .maybeSingle();

  return { data, error };
};

/**
 * Admin: Update event status (SCHEDULED -> LIVE -> CLOSED)
 */
export const updateEventStatusService = async (newStatus) => {
  const { data, error } = await supabase.rpc('update_event_status', {
    p_status: newStatus
  });

  return { data, error };
};

/**
 * Admin: Reset Round 1 participant attempt data, active session locks, submissions, and task results
 */
export const resetRound1DataService = async () => {
  try {
    // 1. Try calling the database RPC reset function
    const { data: rpcData, error: rpcError } = await supabase.rpc('reset_round1_attempts');
    if (!rpcError && rpcData?.success) {
      return { success: true };
    }

    // 2. Fallback to client queries across ALL participants
    const { data: pData } = await supabase.from('participants').select('id');
    const pIds = (pData || []).map(p => p.id);

    if (pIds.length > 0) {
      const { data: subData } = await supabase.from('submissions').select('id').in('participant_id', pIds);
      const subIds = (subData || []).map(s => s.id);

      if (subIds.length > 0) {
        await supabase.from('task_results').delete().in('submission_id', subIds);
      }
      await supabase.from('submissions').delete().in('participant_id', pIds);

      await supabase.from('participants').update({
        status: 'pending',
        started_at: null,
        submitted_at: null,
        final_score: 0,
        active_session_id: null
      }).in('id', pIds);
    }

    await supabase.from('event_settings').update({
      status: 'SCHEDULED',
      started_at: null,
      closed_at: null,
      updated_at: new Date().toISOString()
    }).eq('id', 'round_1');

    return { success: true };
  } catch (error) {
    console.error('Reset Round 1 Data Error:', error);
    return { error };
  }
};

/**
 * Admin: Clear all pre-seeded dummy participants & submissions
 */
export const clearAllParticipantsService = async () => {
  try {
    // 1. Try calling the database RPC clear function
    const { data: rpcData, error: rpcError } = await supabase.rpc('clear_all_participants');
    if (!rpcError && rpcData?.success) {
      return { success: true };
    }

    // 2. Fallback to client queries
    const { data: pData } = await supabase.from('participants').select('id');
    const pIds = (pData || []).map(p => p.id);

    if (pIds.length > 0) {
      const { data: subData } = await supabase.from('submissions').select('id').in('participant_id', pIds);
      const subIds = (subData || []).map(s => s.id);

      if (subIds.length > 0) {
        await supabase.from('task_results').delete().in('submission_id', subIds);
      }
      await supabase.from('submissions').delete().in('participant_id', pIds);
      await supabase.from('participants').delete().in('id', pIds);
    }

    return { success: true };
  } catch (error) {
    console.error('Clear All Participants Error:', error);
    return { error };
  }
};

/**
 * Admin: Delete an individual participant by Register / Roll Number
 */
export const deleteParticipantService = async (rollNumber) => {
  const formattedRoll = (rollNumber || '').trim().toUpperCase();
  if (!formattedRoll) {
    return { error: new Error('Register Number is required for deletion.') };
  }

  try {
    // 1. Primary path: Call the secure database RPC function
    const { data: rpcData, error: rpcError } = await supabase.rpc('delete_participant_by_roll', {
      p_roll_number: formattedRoll
    });

    const isRpcMissing = rpcError && (
      rpcError.status === 404 ||
      rpcError.code === 'PGRST202' ||
      rpcError.message?.includes('Could not find') ||
      rpcError.message?.includes('does not exist') ||
      rpcError.message?.includes('404')
    );

    if (rpcError && !isRpcMissing) {
      return { error: new Error(rpcError.message || 'Failed to delete participant.') };
    }

    if (rpcData) {
      if (rpcData.success) {
        return { data: rpcData, error: null };
      }
      return { error: new Error(rpcData.error || 'Failed to delete participant.') };
    }

    // 2. Fallback path for offline/mock environments if RPC is missing
    const { data: participant, error: findErr } = await supabase
      .from('participants')
      .select('id, roll_number')
      .eq('roll_number', formattedRoll)
      .maybeSingle();

    if (findErr) {
      return { error: findErr };
    }

    if (!participant) {
      return { error: new Error(`Participant with Register Number "${formattedRoll}" was not found.`) };
    }

    const pId = participant.id;

    // Delete task_results
    const { data: subData } = await supabase.from('submissions').select('id').eq('participant_id', pId);
    const subIds = (subData || []).map(s => s.id);
    if (subIds.length > 0) {
      await supabase.from('task_results').delete().in('submission_id', subIds);
    }

    // Delete submissions
    await supabase.from('submissions').delete().eq('participant_id', pId);

    // Delete participant record
    const { error: deleteErr } = await supabase.from('participants').delete().eq('id', pId);
    if (deleteErr) {
      return { error: deleteErr };
    }

    return { data: { success: true, deleted_roll_number: formattedRoll }, error: null };
  } catch (error) {
    console.error('Error deleting participant:', error);
    return { error };
  }
};

/**
 * Native CSV Parser (Zero dependencies)
 * Handles quoted strings with commas (e.g. "Arun, Kumar"), escaped quotes (""), CRLF/LF line endings, and UTF-8.
 */
export const parseCSVText = (text) => {
  const lines = [];
  let currentLine = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentLine.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentLine.push(currentField);
      lines.push(currentLine);
      currentLine = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField);
    lines.push(currentLine);
  }

  return lines.filter(row => row.some(cell => cell.trim().length > 0));
};

/**
 * Admin: Bulk import valid participants via RPC function with fallback
 */
export const bulkImportParticipantsService = async (validParticipants) => {
  if (!Array.isArray(validParticipants) || validParticipants.length === 0) {
    return { data: { success: true, imported: 0, skipped: 0 }, error: null };
  }

  try {
    // 1. Primary path: Call the secure database RPC function
    const { data: rpcData, error: rpcError } = await supabase.rpc('bulk_import_participants', {
      p_participants: validParticipants
    });

    const isRpcMissing = rpcError && (
      rpcError.status === 404 ||
      rpcError.code === 'PGRST202' ||
      rpcError.message?.includes('Could not find') ||
      rpcError.message?.includes('does not exist') ||
      rpcError.message?.includes('404')
    );

    if (rpcError && !isRpcMissing) {
      return { error: new Error(rpcError.message || 'Failed to bulk import participants.') };
    }

    if (rpcData && rpcData.success) {
      return { data: rpcData, error: null };
    }

    // 2. Fallback path for offline/mock environments: Sequential import
    let imported = 0;
    let skipped = 0;

    for (const p of validParticipants) {
      const { error } = await addParticipantService({
        rollNumber: p.roll_number,
        name: p.name,
        year: p.year
      });
      if (error) {
        skipped++;
      } else {
        imported++;
      }
    }

    return { data: { success: true, imported, skipped }, error: null };
  } catch (error) {
    console.error('Error bulk importing participants:', error);
    return { error };
  }
};


