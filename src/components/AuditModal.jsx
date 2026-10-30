import React, { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  ExternalLink, 
  ChevronLeft, 
  ChevronRight, 
  ShieldAlert, 
  Sparkles, 
  Info, 
  Check, 
  Camera, 
  Layers, 
  Eye, 
  Mail,
  Wrench,
  PackagePlus,
  Trash2,
  Clock,
  Plus
} from 'lucide-react';
import { EQUIPMENT_CATALOGUE, FAULT_CONDITIONS, REPLACEMENT_URGENCY } from '../data/equipmentItems.js';
import { INITIAL_CENTRAL_RULES } from '../data/centralRules.js';

export default function AuditModal({
  task,
  onClose,
  onPassAudit,
  onFatalAudit,
  onNextTask,
  onPrevTask,
  hasNext,
  hasPrev,
  auditorName,
  auditorLocation,
  onOpenEmail,
  onUpdateReplacements,
  rules = INITIAL_CENTRAL_RULES
}) {
  const [activeCriterionIndex, setActiveCriterionIndex] = useState(0);
  const [rightPanelTab, setRightPanelTab] = useState('sop'); // 'sop' | 'replacements'
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [showFatalPicker, setShowFatalPicker] = useState(false);
  const [selectedViolations, setSelectedViolations] = useState([]);
  const [customRemark, setCustomRemark] = useState('');
  const [criteriaStatus, setCriteriaStatus] = useState({});

  // Equipment Replacements Requisition State
  const [replacements, setReplacements] = useState([]);
  const [selectedItemToAdd, setSelectedItemToAdd] = useState('');
  const [selectedCondition, setSelectedCondition] = useState(FAULT_CONDITIONS[0]);
  const [selectedUrgency, setSelectedUrgency] = useState('CRITICAL');
  const [replacementNotes, setReplacementNotes] = useState('');

  useEffect(() => {
    if (task) {
      setCriteriaStatus(task.criteriaStatus || {});
      setSelectedViolations(task.failedReasons || []);
      setCustomRemark(task.remarks || '');
      setReplacements(task.replacements || []);
      setZoomLevel(1);
      setRotation(0);
      setShowFatalPicker(task.auditStatus === 'FATAL');
    }
  }, [task]);

  if (!task) return null;

  const currentCriterion = rules[activeCriterionIndex] || rules[0] || INITIAL_CENTRAL_RULES[0];
  const fieldKey = currentCriterion.field || currentCriterion.imageKey;
  const originalUrl = task.images?.[fieldKey] || '';

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.5, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.5, 0.75));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleResetView = () => {
    setZoomLevel(1);
    setRotation(0);
  };

  const handleToggleCriterionStatus = (key, status) => {
    const updated = { ...criteriaStatus, [key]: status };
    setCriteriaStatus(updated);
  };

  const toggleViolation = (violation) => {
    if (selectedViolations.includes(violation)) {
      setSelectedViolations(selectedViolations.filter(v => v !== violation));
    } else {
      setSelectedViolations([...selectedViolations, violation]);
    }
  };

  // Add Replacement Item
  const handleAddReplacement = (itemData) => {
    let itemToAdd = itemData;

    if (!itemToAdd && selectedItemToAdd) {
      for (const cat of EQUIPMENT_CATALOGUE) {
        const found = cat.items.find(i => i.id === selectedItemToAdd);
        if (found) {
          itemToAdd = { ...found, category: cat.category };
          break;
        }
      }
    }

    if (!itemToAdd) {
      alert('Please select an equipment or consumable item.');
      return;
    }

    const newEntry = {
      id: `${itemToAdd.id}_${Date.now()}`,
      itemId: itemToAdd.id,
      itemName: itemToAdd.name,
      category: itemToAdd.category || 'General Equipment',
      type: itemToAdd.type || 'Asset',
      condition: selectedCondition,
      urgency: selectedUrgency,
      notes: replacementNotes.trim() || `Flagged during audit of ${currentCriterion.title}`,
      reportedAt: new Date().toISOString(),
      reportedBy: auditorName || 'Auditor',
      posStatus: 'FLAGGED_BY_AUDITOR'
    };

    const updated = [...replacements, newEntry];
    setReplacements(updated);
    setReplacementNotes('');
    setSelectedItemToAdd('');
    onUpdateReplacements?.(task.id, updated);
  };

  const handleRemoveReplacement = (id) => {
    const updated = replacements.filter(r => r.id !== id);
    setReplacements(updated);
    onUpdateReplacements?.(task.id, updated);
  };

  // Keyboard navigation & quick shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.key === 'ArrowRight' && hasNext) onNextTask();
      if (e.key === 'ArrowLeft' && hasPrev) onPrevTask();
      if (e.key === 'Escape') onClose();
      if (e.key === 'p' || e.key === 'P') handlePassClick();
      if (e.key === 'f' || e.key === 'F') {
        setShowFatalPicker(true);
        setRightPanelTab('sop');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasNext, hasPrev, activeCriterionIndex, replacements]);

  const handlePassClick = () => {
    const allPassedCriteria = {};
    rules.forEach(r => {
      allPassedCriteria[r.id || r.imageKey] = 'PASS';
    });
    onPassAudit(task.id, {
      remarks: customRemark || 'All SOP criteria verified and passed.',
      criteriaStatus: allPassedCriteria,
      replacements: replacements,
      taskData: task
    });
  };

  const handleConfirmFatal = () => {
    if (selectedViolations.length === 0 && !customRemark.trim()) {
      alert('Please select at least one violation reason or write a specific remark for the FATAL penalty.');
      return;
    }
    onFatalAudit(task.id, {
      failedReasons: selectedViolations.length > 0 ? selectedViolations : [customRemark],
      remarks: customRemark,
      criteriaStatus: {
        ...criteriaStatus,
        [currentCriterion.id || currentCriterion.imageKey]: 'FAIL'
      },
      replacements: replacements,
      taskData: task
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      
      {/* Modal Container */}
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Top Header Bar */}
        <div className="px-5 py-3.5 bg-slate-850 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-sm font-black text-white">TASK #{task.taskId}</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  {task.zone}
                </span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                  Facility: {task.facilityCode}
                </span>
                {task.pin && (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                    OTP: {task.pin}
                  </span>
                )}
                {replacements.length > 0 && (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-1">
                    <Wrench className="w-3 h-3 text-sky-400" />
                    {replacements.length} Faulty/To Order
                  </span>
                )}
                {task.auditStatus === 'FATAL' && (
                  <span className="text-[10px] uppercase font-black px-2 py-0.2 rounded bg-red-500 text-white animate-pulse">
                    FATAL STRIKE
                  </span>
                )}
                {task.auditStatus === 'PASSED' && (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    PASSED
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                FE: <span className="text-white font-semibold">{task.feName}</span> (ID: <strong className="text-slate-200">{task.feId}</strong> • Code: {task.feCode}) • Date: {task.date}
              </div>
            </div>
          </div>

          {/* Quick task pagination & close */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onPrevTask}
              disabled={!hasPrev}
              className={`p-1.5 rounded-lg border transition-colors ${
                hasPrev 
                  ? 'border-slate-700 hover:bg-slate-800 text-slate-300' 
                  : 'border-slate-800 text-slate-600 cursor-not-allowed'
              }`}
              title="Previous Task (Left Arrow)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onNextTask}
              disabled={!hasNext}
              className={`p-1.5 rounded-lg border transition-colors ${
                hasNext 
                  ? 'border-slate-700 hover:bg-slate-800 text-slate-300' 
                  : 'border-slate-800 text-slate-600 cursor-not-allowed'
              }`}
              title="Next Task (Right Arrow)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors ml-2 cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dynamic Criteria Switcher Tabs (From Central Rules Engine) */}
        <div className="bg-slate-800/90 border-b border-slate-700/80 px-4 py-2 flex items-center gap-1.5 overflow-x-auto">
          {rules.map((crit, idx) => {
            const fieldKey = crit.field || crit.imageKey;
            const hasMedia = Boolean(task.images[fieldKey]);
            const isCurrent = idx === activeCriterionIndex;
            const status = criteriaStatus[crit.id || fieldKey];

            return (
              <button
                key={crit.id}
                onClick={() => {
                  setActiveCriterionIndex(idx);
                  handleResetView();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                  isCurrent
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                <span>{crit.label || crit.title}</span>
                {status === 'PASS' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                {status === 'FAIL' && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                {!status && hasMedia && <span className="w-2 h-2 rounded-full bg-sky-400"></span>}
                {!hasMedia && <span className="text-[10px] text-slate-500">(No URL)</span>}
              </button>
            );
          })}
        </div>

        {/* Modal Main Content */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 min-h-0">
          
          {/* Left Column: Image Viewer (7 cols) */}
          <div className="lg:col-span-7 bg-slate-950 p-4 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
                        {/* Criterion brief & itemized pass/fail buttons */}
            <div className="mt-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">SOP Rule:</span>
                <span className="text-slate-200 font-medium">{currentCriterion.description}</span>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => handleToggleCriterionStatus(currentCriterion.id, 'PASS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                    criteriaStatus[currentCriterion.id] === 'PASS'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-slate-800 text-slate-300 hover:text-emerald-400 hover:bg-slate-700'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  Pass Item
                </button>
                <button
                  onClick={() => {
                    handleToggleCriterionStatus(currentCriterion.id, 'FAIL');
                    setShowFatalPicker(true);
                    setRightPanelTab('sop');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                    criteriaStatus[currentCriterion.id] === 'FAIL'
                      ? 'bg-red-600 text-white shadow-md'
                      : 'bg-slate-800 text-slate-300 hover:text-red-400 hover:bg-slate-700'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Fail Item
                </button>
              </div>
            </div>
            
            {/* Image Toolbar */}
            <div className="flex items-center justify-between mb-3 text-xs">
              <div className="flex items-center space-x-2">
                <span className="text-slate-400 font-medium">Viewing:</span>
                <span className="font-semibold text-white">{currentCriterion.title}</span>
                {originalUrl ? (
                  <a
                    href={originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[11px] underline"
                    title="Open original Locus link"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Locus Link
                  </a>
                ) : (
                  <span className="text-[11px] text-amber-400">No Image In Log</span>
                )}
              </div>

              {/* Viewer Controls */}
              <div className="flex items-center space-x-1 bg-slate-900 border border-slate-700/80 rounded-lg p-1">
                <button onClick={handleZoomIn} className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer" title="Zoom In (+)">
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleZoomOut} className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer" title="Zoom Out (-)">
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleRotate} className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer" title="Rotate 90 deg">
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleResetView} className="px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-white font-mono cursor-pointer" title="Reset Zoom & Rotation">
                  Reset
                </button>
              </div>
            </div>

            {/* Image Stage */}
            <div className="relative flex-1 min-h-[320px] max-h-[440px] bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center p-2 group">
              {originalUrl ? (
                <div 
                  className="transition-transform duration-200 flex items-center justify-center"
                  style={{ transform: `scale(${zoomLevel}) rotate(${rotation}deg)` }}
                >
                  <img
                    src={originalUrl}
                    alt={currentCriterion.title}
                    className="max-h-[400px] w-auto object-contain rounded shadow-lg select-none"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mb-3">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div className="text-sm font-bold text-white">No Photo In Locus Export</div>
                  <p className="text-xs text-slate-400 max-w-sm mt-1">
                    Field Executive did not upload an image for <strong>{currentCriterion.title}</strong> during this visit.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      handleToggleCriterionStatus(currentCriterion.id, 'FAIL');
                      toggleViolation(`Missing mandatory photo for ${currentCriterion.title}`);
                      setShowFatalPicker(true);
                      setRightPanelTab('sop');
                    }}
                    className="mt-4 px-3.5 py-1.5 rounded-lg bg-red-950/50 hover:bg-red-900/50 text-red-300 border border-red-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Flag Missing Photo Violation</span>
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Right Column: 2 Switchable Tabs - SOP Checklist vs Equipment Replacement Zone */}
          <div className="lg:col-span-5 p-5 flex flex-col justify-between bg-slate-850">
            
            <div>
              {/* Tab Switcher for Right Panel */}
              <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-700/80 mb-4">
                <button
                  onClick={() => setRightPanelTab('sop')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    rightPanelTab === 'sop'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  SOP & Fatals
                </button>
                <button
                  onClick={() => setRightPanelTab('replacements')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    rightPanelTab === 'replacements'
                      ? 'bg-sky-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5 text-sky-400" />
                  City POS Orders ({replacements.length})
                </button>
              </div>

              {/* TAB 1: SOP Checklist & Fatal Violations */}
              {rightPanelTab === 'sop' && (
                <div className="space-y-4">
                  
                  {/* Central SOP Checklist */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-blue-400" />
                      Centrally Mandated SOP Standards
                    </h4>
                    <div className="space-y-1.5">
                      {(currentCriterion.standards || []).map((std, i) => (
                        <div key={i} className="flex items-start space-x-2 text-xs text-slate-300 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                          <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                            {i + 1}
                          </span>
                          <span>{std}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Fatal Violations Selector */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        Fatal Failure Reasons
                      </h4>
                      <span className="text-[10px] text-slate-400">
                        {selectedViolations.length} selected
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {(currentCriterion.commonFailures || []).map((reason, i) => {
                        const isSelected = selectedViolations.includes(reason);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => toggleViolation(reason)}
                            className={`w-full text-left p-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between border cursor-pointer ${
                              isSelected
                                ? 'bg-red-500/20 text-red-300 border-red-500/60 shadow-sm'
                                : 'bg-slate-900/40 text-slate-400 hover:text-slate-200 border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            <span className="truncate pr-2">{reason}</span>
                            {isSelected ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                            ) : (
                              <span className="w-3.5 h-3.5 rounded border border-slate-700 flex-shrink-0"></span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Auditor Remarks */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Auditor Remarks & Feedback to FE:
                    </label>
                    <textarea
                      value={customRemark}
                      onChange={(e) => setCustomRemark(e.target.value)}
                      rows={2}
                      placeholder="Enter specific audit remarks or instructions for Field Executive..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: Equipment Replacement & City POS Order Zone */}
              {rightPanelTab === 'replacements' && (
                <div className="space-y-4">
                  <div className="bg-sky-950/30 border border-sky-500/30 rounded-xl p-3 text-xs">
                    <span className="font-bold text-sky-300 block mb-0.5 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-sky-400" />
                      City Admin POS Ordering Requisition
                    </span>
                    <p className="text-[11px] text-sky-200/80">
                      Items flagged here are assigned to the <strong>City Admin ({task.facilityCode})</strong> to order on their local POS, while Central Ops tracks inventory buffer.
                    </p>
                  </div>

                  {/* Quick Pick: Items visible in current photo */}
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                      Quick Pick ({currentCriterion.title.split(':')[0]} Items):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(currentCriterion.relevantEquipment || []).map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleAddReplacement(item)}
                          className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-sky-600/30 text-slate-300 hover:text-sky-200 border border-slate-700 hover:border-sky-500/50 flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Plus className="w-3 h-3 text-sky-400" />
                          <span>{item.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Manual Item Selector Form */}
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2.5 text-xs">
                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">
                      Add Custom / Other Item:
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Select Item:</label>
                        <select
                          value={selectedItemToAdd}
                          onChange={(e) => setSelectedItemToAdd(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                        >
                          <option value="">-- Choose Equipment --</option>
                          {EQUIPMENT_CATALOGUE.map(cat => (
                            <optgroup key={cat.category} label={cat.category}>
                              {cat.items.map(i => (
                                <option key={i.id} value={i.id}>{i.name} ({i.type})</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Fault Condition:</label>
                        <select
                          value={selectedCondition}
                          onChange={(e) => setSelectedCondition(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                        >
                          {FAULT_CONDITIONS.map(cond => (
                            <option key={cond} value={cond}>{cond}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Order Urgency:</label>
                        <select
                          value={selectedUrgency}
                          onChange={(e) => setSelectedUrgency(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                        >
                          {REPLACEMENT_URGENCY.map(u => (
                            <option key={u.value} value={u.value}>{u.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Auditor Notes / Defect Reason:</label>
                        <input
                          type="text"
                          value={replacementNotes}
                          onChange={(e) => setReplacementNotes(e.target.value)}
                          placeholder="e.g. Broken lens, battery dead"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder-slate-500"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddReplacement(null)}
                      className="w-full py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                    >
                      <PackagePlus className="w-3.5 h-3.5" />
                      Add to City Admin POS Requisition
                    </button>
                  </div>

                  {/* List of Flagged Items */}
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                      Flagged for City Admin POS Ordering ({replacements.length} items):
                    </span>
                    {replacements.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-500 bg-slate-900/40 rounded-lg border border-slate-800">
                        No equipment issues flagged for this visit yet.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {replacements.map(rep => (
                          <div
                            key={rep.id}
                            className="p-2 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-between text-xs"
                          >
                            <div className="overflow-hidden pr-2">
                              <span className="font-bold text-white block truncate">{rep.itemName}</span>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                                <span className="text-amber-400 font-medium">{rep.condition}</span>
                                <span>•</span>
                                <span className={rep.urgency === 'IMMEDIATE' ? 'text-red-400 font-bold' : 'text-sky-300'}>
                                  {rep.urgency}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveReplacement(rep.id)}
                              className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>

            {/* Bottom Decision Actions */}
            <div className="pt-4 border-t border-slate-700/80 flex items-center gap-3">
              <button
                type="button"
                onClick={handlePassClick}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                PASS AUDIT (P)
              </button>

              <button
                type="button"
                onClick={handleConfirmFatal}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white shadow-lg shadow-red-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer fatal-pulse"
              >
                <AlertTriangle className="w-4 h-4" />
                MARK FATAL & WARN (F)
              </button>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
