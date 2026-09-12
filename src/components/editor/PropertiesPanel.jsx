import React from 'react';
import { Sliders, Layers, AlignLeft, AlignCenter, AlignRight, Type, Move, Palette, Lock } from 'lucide-react';
import { useArrowQuota } from '../../hooks/useArrowQuota';

const PropertiesPanel = ({ selectedElement, onUpdateElement, elements = [], onSelectElement }) => {
  const { count, isCooldownActive, remainingSeconds, consumeQuotaChange, tryConsumeArrow } = useArrowQuota();

  if (!selectedElement) {
    return (
      <aside className="w-72 bg-white border-l border-[#E5E7EB] p-5 flex flex-col justify-between select-none z-20 shadow-sm">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
            <h3 className="text-xs font-bold text-[#111827] uppercase tracking-wider flex items-center gap-2">
              <Sliders size={14} className="text-[#2563EB]" /> Inspector
            </h3>
            <span className="text-[10px] font-semibold text-[#6B7280]">No Selection</span>
          </div>

          <div className="py-12 text-center text-[#6B7280] space-y-2">
            <Move size={24} className="mx-auto text-[#94A3B8]" />
            <p className="text-xs font-bold text-[#111827]">No Selection</p>
            <p className="text-[11px] text-[#6B7280]">Select an element on the canvas to edit its properties.</p>
          </div>

          {/* Layers Overview */}
          {elements.length > 0 && (
            <div className="space-y-2 pt-4 border-t border-[#E5E7EB]">
              <h4 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Layers size={13} className="text-[#2563EB]" /> Canvas Layers ({elements.length})
              </h4>
              <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {elements.map((item, idx) => (
                  <button
                    key={item.id || idx}
                    onClick={() => onSelectElement && onSelectElement(item.id)}
                    className="w-full text-left px-3 py-2 rounded-xl bg-[#F8FAFF] border border-[#E5E7EB] hover:border-[#2563EB]/40 text-xs text-[#374151] hover:text-[#111827] flex items-center justify-between transition cursor-pointer"
                  >
                    <span className="font-mono text-[11px] truncate font-semibold">{item.id}</span>
                    <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB]">
                      {item.type}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="text-[10px] text-[#9CA3AF] font-medium text-center pt-4 border-t border-[#E5E7EB]">
          Design-Event Inspector Engine
        </div>
      </aside>
    );
  }

  const el = selectedElement;

  const handleChange = (key, value) => {
    onUpdateElement({
      ...el,
      [key]: value,
    });
  };

  const handleNumericChange = (key, rawValue) => {
    if (isCooldownActive) return;
    if (rawValue === '') {
      handleChange(key, '');
      return;
    }
    const num = parseInt(rawValue, 10);
    if (isNaN(num)) return;
    const allowed = consumeQuotaChange();
    if (allowed) {
      handleChange(key, num);
    }
  };

  const handleNumericBlur = (key, min, max) => {
    let num = parseInt(el[key], 10);
    if (isNaN(num)) num = min;
    const clamped = Math.max(min, Math.min(max, num));
    if (clamped !== el[key]) handleChange(key, clamped);
  };

  const blockWheelIncrement = (e) => {
    e.target.blur();
  };

  const nudgeWithArrowKeys = (key, min, max) => (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const current = parseInt(el[key], 10) || 0;
      const result = tryConsumeArrow(current, min, max, e.key === 'ArrowUp');
      if (result.allowed) {
        handleChange(key, result.newValue);
      }
    } else if (e.key !== 'Tab' && e.key !== 'Shift') {
      e.preventDefault();
    }
  };

  return (
    <aside className="w-72 bg-white border-l border-[#E5E7EB] p-5 flex flex-col justify-between overflow-y-auto z-20 select-none text-[#111827] shadow-sm">
      <div className="space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
          <h3 className="text-xs font-bold text-[#111827] uppercase tracking-wider flex items-center gap-2">
            <Sliders size={14} className="text-[#2563EB]" /> Inspector
          </h3>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB] border border-[#2563EB]/20 uppercase">
            {el.type}
          </span>
        </div>

        {/* Cooldown / Lock Banner */}
        {isCooldownActive && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] font-semibold flex items-center justify-between shadow-sm motion-safe:animate-pulse">
            <span className="flex items-center gap-1.5">
              <Lock size={12} className="text-amber-600 shrink-0" />
              <span>Arrow controls locked — {remainingSeconds}s cooldown</span>
            </span>
          </div>
        )}

        {/* 1. POSITION */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Position</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center bg-[#F8FAFF] border border-[#E5E7EB] rounded-xl px-2.5 py-1.5 focus-within:border-[#2563EB]">
              <span className="text-[11px] font-bold text-[#6B7280] mr-2">X</span>
              <input
                type="number"
                value={el.x}
                readOnly={true}
                onWheel={blockWheelIncrement}
                onKeyDown={nudgeWithArrowKeys('x', 0, 800)}
                className={`w-full bg-transparent text-xs text-[#111827] font-mono font-bold focus:outline-none select-none cursor-default ${isCooldownActive ? 'opacity-60' : ''}`}
              />
            </div>
            <div className="flex items-center bg-[#F8FAFF] border border-[#E5E7EB] rounded-xl px-2.5 py-1.5 focus-within:border-[#2563EB]">
              <span className="text-[11px] font-bold text-[#6B7280] mr-2">Y</span>
              <input
                type="number"
                value={el.y}
                readOnly={true}
                onWheel={blockWheelIncrement}
                onKeyDown={nudgeWithArrowKeys('y', 0, 600)}
                className={`w-full bg-transparent text-xs text-[#111827] font-mono font-bold focus:outline-none select-none cursor-default ${isCooldownActive ? 'opacity-60' : ''}`}
              />
            </div>
          </div>
        </div>

        {/* 2. SIZE */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Size</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center bg-[#F8FAFF] border border-[#E5E7EB] rounded-xl px-2.5 py-1.5 focus-within:border-[#2563EB]">
              <span className="text-[11px] font-bold text-[#6B7280] mr-2">W</span>
              <input
                type="number"
                value={el.width}
                readOnly={true}
                onWheel={blockWheelIncrement}
                onKeyDown={nudgeWithArrowKeys('width', 5, 800)}
                className={`w-full bg-transparent text-xs text-[#111827] font-mono font-bold focus:outline-none select-none cursor-default ${isCooldownActive ? 'opacity-60' : ''}`}
              />
            </div>
            <div className="flex items-center bg-[#F8FAFF] border border-[#E5E7EB] rounded-xl px-2.5 py-1.5 focus-within:border-[#2563EB]">
              <span className="text-[11px] font-bold text-[#6B7280] mr-2">H</span>
              <input
                type="number"
                value={el.height}
                readOnly={true}
                onWheel={blockWheelIncrement}
                onKeyDown={nudgeWithArrowKeys('height', 5, 600)}
                className={`w-full bg-transparent text-xs text-[#111827] font-mono font-bold focus:outline-none select-none cursor-default ${isCooldownActive ? 'opacity-60' : ''}`}
              />
            </div>
          </div>
        </div>

        {/* 3. TYPOGRAPHY */}
        {el.type === 'text' && (
          <div className="space-y-3 pt-2 border-t border-[#E5E7EB]">
            <h4 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider flex items-center gap-1">
              <Type size={12} className="text-[#2563EB]" /> Typography
            </h4>
            
            <div>
              <label className="block text-[10px] text-[#6B7280] mb-1 font-semibold">Content</label>
              <textarea
                value={el.text}
                onChange={(e) => handleChange('text', e.target.value)}
                rows={2}
                className="w-full bg-[#F8FAFF] border border-[#E5E7EB] focus:border-[#2563EB] rounded-xl p-2.5 text-xs text-[#111827] font-sans focus:outline-none resize-none font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-[#6B7280] mb-1 font-semibold font-mono">Size (px)</label>
                <input
                  type="number"
                  value={el.fontSize ?? ''}
                  readOnly={true}
                  onWheel={blockWheelIncrement}
                  onKeyDown={nudgeWithArrowKeys('fontSize', 8, 120)}
                  className={`w-full bg-[#F8FAFF] border border-[#E5E7EB] rounded-xl px-2.5 py-1.5 text-xs text-[#111827] font-mono font-bold focus:outline-none select-none cursor-default ${isCooldownActive ? 'opacity-60' : ''}`}
                />
              </div>

              <div>
                <label className="block text-[10px] text-[#6B7280] mb-1 font-semibold">Weight</label>
                <select
                  value={el.fontWeight || 400}
                  onChange={(e) => handleChange('fontWeight', parseInt(e.target.value, 10))}
                  className="w-full bg-[#F8FAFF] border border-[#E5E7EB] rounded-xl px-2 py-1.5 text-xs text-[#111827] focus:outline-none cursor-pointer font-semibold"
                >
                  <option value={300}>300 Light</option>
                  <option value={400}>400 Normal</option>
                  <option value={500}>500 Medium</option>
                  <option value={600}>600 SemiBold</option>
                  <option value={700}>700 Bold</option>
                  <option value={900}>900 Black</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-[#6B7280] mb-1 font-semibold">Alignment</label>
              <div className="flex bg-[#F8FAFF] p-1 rounded-xl border border-[#E5E7EB] gap-1">
                {[
                  { id: 'left', icon: AlignLeft },
                  { id: 'center', icon: AlignCenter },
                  { id: 'right', icon: AlignRight },
                ].map(item => {
                  const IconComp = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleChange('align', item.id)}
                      className={`flex-1 py-1 rounded-lg flex items-center justify-center transition cursor-pointer ${
                        (el.align || 'left') === item.id
                          ? 'bg-[#2563EB] text-white shadow-sm'
                          : 'text-[#6B7280] hover:text-[#111827]'
                      }`}
                    >
                      <IconComp size={14} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 4. APPEARANCE & FILL */}
        {el.type !== 'image' && (
          <div className="space-y-3 pt-2 border-t border-[#E5E7EB]">
            <h4 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider flex items-center gap-1">
              <Palette size={12} className="text-[#2563EB]" /> Appearance
            </h4>
            
            <div>
              <label className="block text-[10px] text-[#6B7280] mb-1 font-semibold">Fill Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={el.color || el.backgroundColor || '#CCCCCC'}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    onUpdateElement({
                      ...el,
                      color: val,
                      backgroundColor: val,
                    });
                  }}
                  className="w-8 h-8 bg-transparent border-0 rounded cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={el.color || el.backgroundColor || '#CCCCCC'}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    onUpdateElement({
                      ...el,
                      color: val,
                      backgroundColor: val,
                    });
                  }}
                  className="w-full bg-[#F8FAFF] border border-[#E5E7EB] rounded-xl px-3 py-1.5 text-xs text-[#111827] font-mono uppercase font-bold focus:outline-none"
                />
              </div>
            </div>

            {el.type === 'rectangle' && (
              <div>
                <label className="block text-[10px] text-[#6B7280] mb-1 font-semibold">Border Radius (px)</label>
                <input
                  type="number"
                  value={el.borderRadius || 0}
                  readOnly={true}
                  onWheel={blockWheelIncrement}
                  onKeyDown={nudgeWithArrowKeys('borderRadius', 0, 50)}
                  className={`w-full bg-[#F8FAFF] border border-[#E5E7EB] rounded-xl px-3 py-1.5 text-xs text-[#111827] font-mono font-bold focus:outline-none select-none cursor-default ${isCooldownActive ? 'opacity-60' : ''}`}
                />
              </div>
            )}
          </div>
        )}

        {/* Layers List */}
        {elements.length > 0 && (
          <div className="space-y-2 pt-3 border-t border-[#E5E7EB]">
            <h4 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider flex items-center gap-1">
              <Layers size={12} className="text-[#2563EB]" /> Layers
            </h4>
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {elements.map((item, idx) => (
                <button
                  key={item.id || idx}
                  onClick={() => onSelectElement && onSelectElement(item.id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl border text-xs flex items-center justify-between transition cursor-pointer ${
                    item.id === el.id
                      ? 'bg-[#EFF6FF] border-[#2563EB] text-[#2563EB] font-bold'
                      : 'bg-[#F8FAFF] border-[#E5E7EB] text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  <span className="font-mono text-[11px] truncate font-semibold">{item.id}</span>
                  <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-white text-[#2563EB] border border-[#E5E7EB]">
                    {item.type}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      <div className="text-[10px] font-mono text-[#9CA3AF] text-center pt-4 border-t border-[#E5E7EB]">
        ID: {el.id}
      </div>
    </aside>
  );
};

export default PropertiesPanel;
