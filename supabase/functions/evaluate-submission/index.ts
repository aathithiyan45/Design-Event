import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TASK_IDS = Array.from({ length: 10 }, (_, i) => `task_${String(i + 1).padStart(2, '0')}`);
const EPS = 0.0001;

const num = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const normText = (v: any) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const normColor = (el: any) => String(el?.color ?? el?.backgroundColor ?? '').trim().toUpperCase();
const close = (a: any, b: any, tolerance: number) => Math.abs(num(a) - num(b)) <= tolerance;
const scoreTolerance = (actual: any, expected: any, full: number, partial: number) => {
  const diff = Math.abs(num(actual) - num(expected));
  if (diff <= full) return 2;
  if (diff <= partial) return 1;
  if (diff <= partial * 2) return 0.5;
  return 0;
};
const pairScore = (a: any, b: any, tolerance: number) => close(a, b, tolerance) ? 2 : (close(a, b, tolerance * 3) ? 1 : 0);
const boolScore = (value: boolean) => value ? 2 : 0;

function normalizeElements(elements: any[] = []) {
  return (Array.isArray(elements) ? elements : []).map((el) => ({
    id: el?.id,
    type: el?.type,
    x: num(el?.x),
    y: num(el?.y),
    width: num(el?.width),
    height: num(el?.height),
    text: el?.text ?? '',
    fontSize: el?.fontSize ?? null,
    fontWeight: el?.fontWeight ?? null,
    fontFamily: el?.fontFamily ?? null,
    color: normColor(el),
    borderRadius: el?.borderRadius ?? null,
    align: el?.align ?? null,
    url: el?.url ?? null,
    aspectRatioLocked: el?.aspectRatioLocked ?? null,
  })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function attempted(studentElements: any[], initialElements: any[]) {
  return JSON.stringify(normalizeElements(studentElements)) !== JSON.stringify(normalizeElements(initialElements));
}

function find(student: any[], id: string) {
  return student.find((el: any) => el?.id === id);
}

function category(name: string, score: number) {
  return { name, score: Math.max(0, Math.min(2, Number(score.toFixed(2)))) };
}

function imageIdentityScore(image: any, initial: any) {
  if (!image || image.type !== 'image') return 0;
  if (initial?.url && image.url) return normText(image.url) === normText(initial.url) ? 2 : 0;
  return 2;
}

function aspectScore(image: any, expected: any) {
  if (!image || num(image.height) <= EPS || num(expected?.height) <= EPS) return 0;
  const actualRatio = num(image.width) / num(image.height);
  const expectedRatio = num(expected.width) / num(expected.height);
  const diff = Math.abs(actualRatio - expectedRatio);
  if (diff <= 0.03) return 2;
  if (diff <= 0.10) return 1;
  return 0;
}

function evaluateTask(taskId: string, studentElements: any[], expectedElements: any[], initialElements: any[]) {
  const student = Array.isArray(studentElements) ? studentElements : [];
  const expected = Array.isArray(expectedElements) ? expectedElements : [];
  const initial = Array.isArray(initialElements) ? initialElements : [];

  if (!attempted(student, initial)) {
    return { score: 0, details: { attempted: false, feedback: 'Not attempted.', categories: [] } };
  }

  const cats: any[] = [];
  const push = (name: string, score: number) => cats.push(category(name, score));

  switch (taskId) {
    case 'task_01': {
      const logo = find(student, 'logo_element');
      const exp = find(expected, 'logo_element') ?? { x: 690, y: 30, width: 80, height: 80 };
      const init = find(initial, 'logo_element');
      push('Logo Identity', imageIdentityScore(logo, init));
      push('Position', logo ? (close(logo.x, exp.x, 3) && close(logo.y, exp.y, 3) ? 2 : (close(logo.x, exp.x, 10) && close(logo.y, exp.y, 10) ? 1 : 0)) : 0);
      push('Size', logo ? Math.min(scoreTolerance(logo.width, exp.width, 3, 10), scoreTolerance(logo.height, exp.height, 3, 10)) : 0);
      push('Aspect Ratio', aspectScore(logo, exp));
      const rightMargin = logo ? 800 - (num(logo.x) + num(logo.width)) : 999;
      const topMargin = logo ? num(logo.y) : 999;
      push('Margin Precision', logo ? (close(rightMargin, 30, 3) && close(topMargin, 30, 3) ? 2 : (close(rightMargin, 30, 10) && close(topMargin, 30, 10) ? 1 : 0)) : 0);
      break;
    }

    case 'task_02': {
      const text = find(student, 'heading_text');
      const exp = find(expected, 'heading_text')!;
      push('Text Content', text ? (normText(text.text) === normText(exp.text) ? 2 : (normText(text.text).includes(normText(exp.text)) ? 1 : 0)) : 0);
      push('Font Family', text ? (normText(text.fontFamily || 'Inter') === normText(exp.fontFamily || 'Inter') ? 2 : (normText(text.fontFamily).includes('inter') ? 1 : 0)) : 0);
      push('Font Size', text ? scoreTolerance(text.fontSize, exp.fontSize, 2, 6) : 0);
      push('Font Weight', text ? (num(text.fontWeight) === num(exp.fontWeight) ? 2 : (num(text.fontWeight) >= 600 ? 1 : 0)) : 0);
      if (text) {
        const align = text.align === exp.align;
        const pos = close(text.x, exp.x, 10) && close(text.y, exp.y, 10);
        const color = normColor(text) === normColor(exp);
        push('Alignment & Position', align && pos && color ? 2 : ((align && pos) || color ? 1 : 0));
      } else push('Alignment & Position', 0);
      break;
    }

    case 'task_03': {
      const base = find(student, 'button_base');
      const text = find(student, 'button_text');
      const expBase = find(expected, 'button_base')!;
      const expText = find(expected, 'button_text')!;
      push('Button Structure', base?.type === 'rectangle' && text?.type === 'text' ? 2 : (base || text ? 1 : 0));
      if (base && text) {
        const basePos = close(base.x, expBase.x, 5) && close(base.y, expBase.y, 5);
        const textPos = close(text.x, expText.x, 10) && close(text.y, expText.y, 10);
        push('Position', basePos && textPos ? 2 : (basePos || textPos ? 1 : 0));
      } else push('Position', 0);
      push('Dimensions', base ? (close(base.width, expBase.width, 5) && close(base.height, expBase.height, 5) ? 2 : (close(base.width, expBase.width, 15) || close(base.height, expBase.height, 15) ? 1 : 0)) : 0);
      if (base) {
        const color = normColor(base) === normColor(expBase);
        const radius = close(base.borderRadius, expBase.borderRadius, 2);
        push('Appearance', color && radius ? 2 : (color || radius ? 1 : 0));
      } else push('Appearance', 0);
      if (text) {
        const content = normText(text.text) === normText(expText.text);
        const typography = num(text.fontSize) === num(expText.fontSize) && num(text.fontWeight) === num(expText.fontWeight);
        const visual = normColor(text) === normColor(expText) && text.align === expText.align;
        push('Button Text', content && typography && visual ? 2 : (content && (typography || visual) ? 1 : (content ? 1 : 0)));
      } else push('Button Text', 0);
      break;
    }

    case 'task_04': {
      const image = find(student, 'hero_image');
      const exp = find(expected, 'hero_image')!;
      const init = find(initial, 'hero_image');
      push('Image Identity', imageIdentityScore(image, init));
      push('Position', image && close(image.x, exp.x, 5) && close(image.y, exp.y, 5) ? 2 : (image && (close(image.x, exp.x, 15) || close(image.y, exp.y, 15)) ? 1 : 0));
      push('Dimensions', image ? (close(image.width, exp.width, 5) && close(image.height, exp.height, 5) ? 2 : (close(image.width, exp.width, 15) || close(image.height, exp.height, 15) ? 1 : 0)) : 0);
      push('Aspect Ratio', aspectScore(image, exp));
      push('Alignment', image && close(num(image.x) + num(image.width) / 2, 400, 10) ? 2 : (image && close(num(image.x) + num(image.width) / 2, 400, 30) ? 1 : 0));
      break;
    }

    case 'task_05': {
      const head = find(student, 'heading_elem');
      const sub = find(student, 'subtitle_elem');
      const expHead = find(expected, 'heading_elem')!;
      const expSub = find(expected, 'subtitle_elem')!;
      push('Heading', head ? (normText(head.text) === normText(expHead.text) ? 2 : 1) : 0);
      push('Subtitle', sub ? (normText(sub.text) === normText(expSub.text) ? 2 : 1) : 0);
      if (head && sub) {
        const sizes = close(head.fontSize, expHead.fontSize, 2) && close(sub.fontSize, expSub.fontSize, 2);
        const weights = num(head.fontWeight) === num(expHead.fontWeight) && num(sub.fontWeight) === num(expSub.fontWeight);
        const colors = normColor(head) === normColor(expHead) && normColor(sub) === normColor(expSub);
        push('Typography', sizes && weights && colors ? 2 : ((sizes && weights) || (sizes && colors) ? 1 : 0));
      } else push('Typography', 0);
      if (head && sub) {
        const gap = num(sub.y) - (num(head.y) + num(head.height));
        push('Spacing', close(gap, 20, 4) ? 2 : (close(gap, 20, 10) ? 1 : 0));
      } else push('Spacing', 0);
      if (head && sub) {
        const aligned = head.align === expHead.align && sub.align === expSub.align;
        const position = close(head.x, expHead.x, 10) && close(sub.x, expSub.x, 10);
        push('Alignment', aligned && position ? 2 : (aligned || position ? 1 : 0));
      } else push('Alignment', 0);
      break;
    }

    case 'task_06': {
      const cards = ['card_1', 'card_2', 'card_3'].map(id => find(student, id));
      const expCards = ['card_1', 'card_2', 'card_3'].map(id => find(expected, id));
      const count = cards.filter(Boolean).length;
      push('Card Count', count === 3 ? 2 : (count > 0 ? 1 : 0));
      if (count === 3) {
        const equalSize = cards.every((c: any) => close(c.width, 200, 2) && close(c.height, 280, 2));
        const anyCorrectSize = cards.filter((c: any) => close(c.width, 200, 10) && close(c.height, 280, 10)).length >= 2;
        push('Equal Dimensions', equalSize ? 2 : (anyCorrectSize ? 1 : 0));
        const ordered = cards[0].x < cards[1].x && cards[1].x < cards[2].x && cards.every((c: any) => close(c.y, 160, 10));
        push('Horizontal Layout', ordered ? 2 : (cards[0].x < cards[1].x && cards[1].x < cards[2].x ? 1 : 0));
        const gaps = [num(cards[1].x) - (num(cards[0].x) + num(cards[0].width)), num(cards[2].x) - (num(cards[1].x) + num(cards[1].width))];
        push('Equal Spacing', close(gaps[0], 50, 3) && close(gaps[1], 50, 3) ? 2 : (close(gaps[0], gaps[1], 10) ? 1 : 0));
        const colors = cards.every((c: any) => normColor(c) === normColor(expCards[0])) && cards.every((c: any) => close(c.borderRadius, 12, 2));
        push('Alignment & Consistency', colors ? 2 : (cards.every((c: any) => close(c.y, 160, 10)) ? 1 : 0));
      } else {
        ['Equal Dimensions', 'Horizontal Layout', 'Equal Spacing', 'Alignment & Consistency'].forEach(n => push(n, 0));
      }
      break;
    }

    case 'task_07': {
      const bg = find(student, 'banner_bg');
      const title = find(student, 'banner_title');
      const sub = find(student, 'banner_sub');
      const eBg = find(expected, 'banner_bg')!;
      const eTitle = find(expected, 'banner_title')!;
      const eSub = find(expected, 'banner_sub')!;
      push('Banner Structure', bg?.type === 'rectangle' && title?.type === 'text' && sub?.type === 'text' ? 2 : ([bg, title, sub].filter(Boolean).length >= 2 ? 1 : 0));
      push('Position & Dimensions', bg && close(bg.x, eBg.x, 5) && close(bg.y, eBg.y, 5) && close(bg.width, eBg.width, 5) && close(bg.height, eBg.height, 5) ? 2 : (bg && (close(bg.x, eBg.x, 15) || close(bg.width, eBg.width, 15)) ? 1 : 0));
      push('Background Colour', bg && normColor(bg) === normColor(eBg) && close(bg.borderRadius, eBg.borderRadius, 2) ? 2 : (bg && normColor(bg) === normColor(eBg) ? 1 : 0));
      if (title && sub) {
        const content = normText(title.text) === normText(eTitle.text) && normText(sub.text) === normText(eSub.text);
        const colors = normColor(title) === normColor(eTitle) && normColor(sub) === normColor(eSub);
        const typo = close(title.fontSize, eTitle.fontSize, 2) && close(sub.fontSize, eSub.fontSize, 2);
        push('Text & Text Colour', content && colors && typo ? 2 : (content && (colors || typo) ? 1 : (content ? 1 : 0)));
      } else push('Text & Text Colour', 0);
      if (title && sub) {
        const aligned = title.align === 'center' && sub.align === 'center';
        const centered = close(num(title.x) + num(title.width) / 2, 400, 15) && close(num(sub.x) + num(sub.width) / 2, 400, 15);
        const gap = num(sub.y) - (num(title.y) + num(title.height));
        push('Alignment & Spacing', aligned && centered && close(gap, 20, 5) ? 2 : ((aligned && centered) || close(gap, 20, 10) ? 1 : 0));
      } else push('Alignment & Spacing', 0);
      break;
    }

    case 'task_08': {
      const bg = find(student, 'profile_card_bg');
      const img = find(student, 'profile_img');
      const name = find(student, 'profile_name');
      const desc = find(student, 'profile_desc');
      const btn = find(student, 'profile_btn_bg');
      const btnText = find(student, 'profile_btn_text');
      const eBg = find(expected, 'profile_card_bg')!;
      const eImg = find(expected, 'profile_img')!;
      const eName = find(expected, 'profile_name')!;
      const eDesc = find(expected, 'profile_desc')!;
      const eBtn = find(expected, 'profile_btn_bg')!;
      const eBtnText = find(expected, 'profile_btn_text')!;
      push('Card Structure', bg?.type === 'rectangle' && close(bg.width, eBg.width, 10) && close(bg.height, eBg.height, 10) ? 2 : (bg ? 1 : 0));
      const initImg = find(initial, 'profile_img');
      push('Image', img ? (imageIdentityScore(img, initImg) === 2 && close(img.x, eImg.x, 10) && close(img.y, eImg.y, 10) && close(img.width, eImg.width, 10) && close(img.height, eImg.height, 10) ? 2 : 1) : 0);
      if (name && desc) {
        const content = normText(name.text) === normText(eName.text) && normText(desc.text) === normText(eDesc.text);
        const typo = close(name.fontSize, eName.fontSize, 2) && num(name.fontWeight) === num(eName.fontWeight) && close(desc.fontSize, eDesc.fontSize, 2) && num(desc.fontWeight) === num(eDesc.fontWeight);
        push('Text', content && typo ? 2 : (content || typo ? 1 : 0));
      } else push('Text', 0);
      if (btn && btnText) {
        const shape = close(btn.width, eBtn.width, 5) && close(btn.height, eBtn.height, 5) && normColor(btn) === normColor(eBtn) && close(btn.borderRadius, eBtn.borderRadius, 2);
        const label = normText(btnText.text) === normText(eBtnText.text) && normColor(btnText) === normColor(eBtnText);
        push('Button', shape && label ? 2 : (shape || label ? 1 : 0));
      } else push('Button', 0);
      if (bg && img && name && desc && btn && btnText) {
        const aligned = close(name.x, eName.x, 10) && close(desc.x, eDesc.x, 10) && close(btn.x, eBtn.x, 10);
        const spacing = close(num(name.y) - (num(img.y) + num(img.height)), 20, 10) && close(num(btn.y) - (num(desc.y) + num(desc.height)), 30, 15);
        push('Spacing & Alignment', aligned && spacing ? 2 : (aligned || spacing ? 1 : 0));
      } else push('Spacing & Alignment', 0);
      break;
    }

    case 'task_09': {
      const ids = ['nav_bg','nav_logo','nav_menu','hero_title','hero_desc','hero_cta_bg','hero_cta_text','hero_graphic'];
      const els = Object.fromEntries(ids.map(id => [id, find(student, id)]));
      const exp = Object.fromEntries(ids.map(id => [id, find(expected, id)]));
      const present = ids.filter(id => els[id]).length;
      push('Overall Structure', present === ids.length ? 2 : (present >= 6 ? 1 : 0));
      const headerOk = els.nav_bg && els.nav_logo && els.nav_menu && normColor(els.nav_bg) === normColor(exp.nav_bg) && close(els.nav_bg.width, exp.nav_bg.width, 10);
      push('Header / Navigation', headerOk ? 2 : (els.nav_bg || els.nav_logo || els.nav_menu ? 1 : 0));
      const typographyOk = els.hero_title && els.hero_desc && normText(els.hero_title.text) === normText(exp.hero_title.text) && normText(els.hero_desc.text) === normText(exp.hero_desc.text) && close(els.hero_title.fontSize, exp.hero_title.fontSize, 2) && close(els.hero_desc.fontSize, exp.hero_desc.fontSize, 2);
      push('Typography / Content', typographyOk ? 2 : (els.hero_title && els.hero_desc ? 1 : 0));
      const ctaOk = els.hero_graphic && els.hero_cta_bg && els.hero_cta_text && normText(els.hero_cta_text.text) === normText(exp.hero_cta_text.text) && normColor(els.hero_cta_bg) === normColor(exp.hero_cta_bg);
      push('Image & CTA', ctaOk ? 2 : (els.hero_graphic || els.hero_cta_bg || els.hero_cta_text ? 1 : 0));
      const layoutOk = els.hero_title && els.hero_graphic && num(els.hero_title.x) < num(els.hero_graphic.x) && close(num(els.hero_title.y), 150, 15) && close(num(els.hero_graphic.y), 140, 15);
      push('Layout & Spacing', layoutOk ? 2 : (els.hero_title && els.hero_graphic ? 1 : 0));
      break;
    }

    case 'task_10': {
      const ids = ['full_header_bg','full_title','full_logo','full_divider','full_illustration','full_box','full_box_title','full_box_text','full_cta_bg','full_cta_text'];
      const els = Object.fromEntries(ids.map(id => [id, find(student, id)]));
      const exp = Object.fromEntries(ids.map(id => [id, find(expected, id)]));
      const present = ids.filter(id => els[id]).length;
      push('Element Presence', present === ids.length ? 2 : (present >= 7 ? 1 : 0));
      const positionIds = ['full_header_bg','full_title','full_logo','full_divider','full_illustration','full_box','full_cta_bg'];
      const positionMatches = positionIds.filter(id => els[id] && exp[id] && close(els[id].x, exp[id].x, 10) && close(els[id].y, exp[id].y, 10)).length;
      push('Position', positionMatches === positionIds.length ? 2 : (positionMatches >= 4 ? 1 : 0));
      const dimensionIds = ['full_header_bg','full_divider','full_illustration','full_box','full_cta_bg'];
      const dimensionMatches = dimensionIds.filter(id => els[id] && exp[id] && close(els[id].width, exp[id].width, 10) && close(els[id].height, exp[id].height, 10)).length;
      push('Dimensions & Proportions', dimensionMatches === dimensionIds.length ? 2 : (dimensionMatches >= 3 ? 1 : 0));
      const textChecks = ['full_title','full_box_title','full_box_text','full_cta_text'];
      const textMatches = textChecks.filter(id => els[id] && exp[id] && normText(els[id].text) === normText(exp[id].text) && num(els[id].fontWeight) === num(exp[id].fontWeight)).length;
      push('Typography', textMatches === textChecks.length ? 2 : (textMatches >= 2 ? 1 : 0));
      const colorChecks = ['full_header_bg','full_title','full_divider','full_box','full_cta_bg','full_cta_text'];
      const colorMatches = colorChecks.filter(id => els[id] && exp[id] && normColor(els[id]) === normColor(exp[id])).length;
      push('Visual Appearance', colorMatches === colorChecks.length ? 2 : (colorMatches >= 3 ? 1 : 0));
      break;
    }

    default:
      return { score: 0, details: { attempted: false, feedback: 'Unknown task ID.', categories: [] } };
  }

  const score = Number(cats.reduce((sum, c) => sum + c.score, 0).toFixed(2));
  return {
    score,
    details: {
      attempted: true,
      feedback: score >= 9.5 ? 'Matches the task requirements.' : 'Evaluated using the five task-specific categories.',
      categories: cats,
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const sessionId = body.sessionId;
    const submittedDesigns = body.designJson?.designs ?? body.designJson ?? {};
    const initialDesigns = body.initialDesigns ?? body.designJson?.initialDesigns ?? {};

    if (!sessionId || !submittedDesigns || typeof submittedDesigns !== 'object') {
      return new Response(JSON.stringify({ success: false, error: 'Invalid submission payload.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: participant, error: participantError } = await supabaseClient
      .from('participants')
      .select('*')
      .eq('active_session_id', sessionId)
      .maybeSingle();

    if (participantError || !participant) {
      return new Response(JSON.stringify({ success: false, error: 'Participant session expired or not found.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (participant.status === 'submitted') {
      return new Response(JSON.stringify({ success: false, error: 'Submission locked. Challenge already finalized.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!participant.started_at) {
      return new Response(JSON.stringify({ success: false, error: 'Round has not been started yet.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const elapsedMinutes = (Date.now() - new Date(participant.started_at).getTime()) / 60000;
    if (elapsedMinutes > 120) {
      return new Response(JSON.stringify({ success: false, error: 'Attempt window expired (over 2 hours). Submission rejected.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: answers, error: answersError } = await supabaseClient
      .from('task_answers')
      .select('*')
      .in('task_id', TASK_IDS);

    if (answersError) throw new Error(`Unable to load scoring configuration: ${answersError.message}`);

    const answerMap = new Map((answers ?? []).map((a: any) => [a.task_id, a]));
    const missing = TASK_IDS.filter(id => !answerMap.has(id));
    if (missing.length) {
      throw new Error(`Scoring configuration is incomplete. Missing: ${missing.join(', ')}`);
    }

    const taskScoringDetails: any[] = [];
    let totalScore = 0;

    for (const taskId of TASK_IDS) {
      const answerKey: any = answerMap.get(taskId);
      const expectedElements = Array.isArray(answerKey.target_layout?.elements) ? answerKey.target_layout.elements : [];
      const initialElements = Array.isArray(initialDesigns?.[taskId]) ? initialDesigns[taskId] : (answerKey.initial_layout?.elements ?? []);
      const studentElements = Array.isArray(submittedDesigns?.[taskId]) ? submittedDesigns[taskId] : [];

      const result = evaluateTask(taskId, studentElements, expectedElements, initialElements);
      totalScore += result.score;
      taskScoringDetails.push({ task_id: taskId, score: result.score, evaluation_details: result.details });
    }

    totalScore = Number(totalScore.toFixed(2));
    const submissionTime = new Date().toISOString();

    const { data: submission, error: submissionError } = await supabaseClient
      .from('submissions')
      .insert({
        participant_id: participant.id,
        design_json: submittedDesigns,
        total_score: totalScore,
        submitted_at: submissionTime,
        status: 'submitted',
      })
      .select('id')
      .single();

    if (submissionError || !submission) throw new Error(`Failed to write submission: ${submissionError?.message ?? 'unknown error'}`);

    const resultsPayload = taskScoringDetails.map((item) => ({
      submission_id: submission.id,
      task_id: item.task_id,
      score: item.score,
      evaluation_details: item.evaluation_details,
    }));

    const { error: resultsError } = await supabaseClient.from('task_results').insert(resultsPayload);
    if (resultsError) {
      await supabaseClient.from('submissions').delete().eq('id', submission.id);
      throw new Error(`Failed to write task results: ${resultsError.message}`);
    }

    const { error: participantErrorAfter } = await supabaseClient
      .from('participants')
      .update({ final_score: totalScore, submitted_at: submissionTime, status: 'submitted', active_session_id: null })
      .eq('id', participant.id);

    if (participantErrorAfter) {
      await supabaseClient.from('task_results').delete().eq('submission_id', submission.id);
      await supabaseClient.from('submissions').delete().eq('id', submission.id);
      throw new Error(`Failed to finalize participant: ${participantErrorAfter.message}`);
    }

    return new Response(JSON.stringify({
      success: true,
      score: totalScore,
      submissionId: submission.id,
      submittedAt: submissionTime,
      taskResults: taskScoringDetails,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Evaluation error:', error);
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Internal Server Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
