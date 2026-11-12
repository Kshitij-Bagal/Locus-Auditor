import React from 'react';
import { 
  Search, 
  Filter, 
  Camera, 
  LayoutGrid, 
  List, 
  X,
  MapPin,
  Calendar,
  UserCheck,
  AlertTriangle,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  SlidersHorizontal
} from 'lucide-react';

export default function FilterBar({
  searchQuery,
  setSearchQuery,
  selectedZone,
  setSelectedZone,
  selectedStatus,
  setSelectedStatus,
  selectedAuditStatus,
  setSelectedAuditStatus,
  selectedAiFilter = 'ALL',
  setSelectedAiFilter,
  selectedHumanFilter = 'ALL',
  setSelectedHumanFilter,
  selectedCrossFilter = 'ALL',
  setSelectedCrossFilter,
  crossStats,
  canViewAiDetails = false,
  selectedBatchDate = 'ALL',
  setSelectedBatchDate,
  availableBatchDates = [],
  selectedAuditor = 'ALL',
  setSelectedAuditor,
  auditors = [],
  isAuditorOnly = false,
  currentUserName,
  onlyWithImages,
  setOnlyWithImages,
  onlyDPlusOneOverdue = false,
  setOnlyDPlusOneOverdue,
  overdueCount = 0,
  viewMode,
  setViewMode,
  zones = [],
  statuses = [],
  totalCount = 0,
  filteredCount = 0,
  pendingCount = 0,
  fatalCount = 0,
  passedCount = 0,
  verifiedCount = 0,
  awaitingCount = 0,
  onClearFilters,
  hasActiveFilters
}) {
  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 mb-5 shadow-lg backdrop-blur-sm space-y-3">
      
      {/* Top Row: Quick Queue Switcher (Auditor Focus: Pending Review vs Completed History) */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-700/60">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
            {canViewAiDetails ? 'Auditor Queue:' : 'Queue:'}
          </span>
          
          {/* Pending Manual Audit */}
          <button
            onClick={() => {
              setSelectedAuditStatus('PENDING');
              if (setSelectedHumanFilter) setSelectedHumanFilter('ALL');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              selectedAuditStatus === 'PENDING'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm ring-1 ring-amber-500/30'
                : 'bg-slate-900/80 text-slate-400 border border-slate-700/80 hover:text-amber-300 hover:border-slate-600'
            }`}
            title="Focus on tasks awaiting manual audit by City Auditor"
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>⚡ Pending Audit</span>
            {pendingCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                selectedAuditStatus === 'PENDING' ? 'bg-amber-400/20 text-amber-200' : 'bg-slate-800 text-slate-300'
              }`}>
                {pendingCount}
              </span>
            )}
          </button>

          {/* All Tasks */}
          <button
            onClick={() => setSelectedAuditStatus('ALL')}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              selectedAuditStatus === 'ALL'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50 shadow-sm ring-1 ring-sky-500/30'
                : 'bg-slate-900/80 text-slate-400 border border-slate-700/80 hover:text-sky-300 hover:border-slate-600'
            }`}
            title="View all tasks including completed audit history"
          >
            <span>📋 All Tasks</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
              selectedAuditStatus === 'ALL' ? 'bg-sky-400/20 text-sky-200' : 'bg-slate-800 text-slate-300'
            }`}>
              {totalCount}
            </span>
          </button>

          {/* Auditor Fatal Strikes */}
          <button
            onClick={() => {
              setSelectedAuditStatus('FATAL');
              if (setSelectedHumanFilter) setSelectedHumanFilter('ALL');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              selectedAuditStatus === 'FATAL'
                ? 'bg-red-500/20 text-red-300 border border-red-500/50 shadow-sm ring-1 ring-red-500/30'
                : 'bg-slate-900/80 text-slate-400 border border-slate-700/80 hover:text-red-300 hover:border-slate-600'
            }`}
            title="View tasks failed by Auditor (FATAL strikes)"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span>❌ Auditor Fatal</span>
            {fatalCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                selectedAuditStatus === 'FATAL' ? 'bg-red-400/20 text-red-200' : 'bg-slate-800 text-slate-300'
              }`}>
                {fatalCount}
              </span>
            )}
          </button>

          {/* Auditor Passed */}
          <button
            onClick={() => {
              setSelectedAuditStatus('PASSED');
              if (setSelectedHumanFilter) setSelectedHumanFilter('ALL');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              selectedAuditStatus === 'PASSED'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm ring-1 ring-emerald-500/30'
                : 'bg-slate-900/80 text-slate-400 border border-slate-700/80 hover:text-emerald-300 hover:border-slate-600'
            }`}
            title="View tasks passed by Auditor"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>✅ Auditor Passed</span>
            {passedCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                selectedAuditStatus === 'PASSED' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-slate-800 text-slate-300'
              }`}>
                {passedCount}
              </span>
            )}
          </button>
        </div>

        {/* Auditor Queue Tag */}
        {isAuditorOnly ? (
          <div 
            className="flex items-center bg-blue-500/10 border border-blue-500/30 rounded-lg px-2.5 py-1 text-xs font-bold text-sky-300"
            title="City Admins strictly see tasks allocated to their personal queue"
          >
            <UserCheck className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
            <span>My Allocated Queue Only{currentUserName ? ` (${currentUserName})` : ''}</span>
          </div>
        ) : canViewAiDetails && crossStats ? (
          /* SuperAdmin Dual-Audit KPI Indicator */
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-purple-950/40 border border-purple-500/30 rounded-lg px-2.5 py-1 text-xs text-purple-200" title="AI vs Auditor Cross-Verification Calibration">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-semibold">AI Audited:</span>
              <span className="font-mono font-bold text-purple-300">{crossStats.aiAuditedCount}</span>
              <span className="text-slate-400 text-[10px]">({crossStats.aiPassedCount} P • {crossStats.aiFatalCount} F)</span>
            </div>

            <div className="flex items-center gap-1.5 bg-sky-950/40 border border-sky-500/30 rounded-lg px-2.5 py-1 text-xs text-sky-200" title="Cross-Verification Agreement on Dual-Audited Tasks">
              <ArrowRightLeft className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-semibold">Dual Audited:</span>
              <span className="font-mono font-bold text-sky-300">{crossStats.dualAuditedCount}</span>
              {crossStats.dualAuditedCount > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${
                  crossStats.agreementRate >= 90 ? 'bg-emerald-500/20 text-emerald-300' :
                  crossStats.agreementRate >= 75 ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'
                }`}>
                  {crossStats.agreementRate}% Agreement ({crossStats.dualAgreedCount} Match)
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* SuperAdmin AI & Cross-Verification Command Strip (Hidden from City Admins) */}
      {canViewAiDetails && (
        <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-900/90 border border-purple-500/30 rounded-lg text-xs shadow-inner">
          <div className="flex items-center gap-1 text-[11px] font-bold text-purple-300 uppercase tracking-wider mr-1">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>SuperAdmin Audit Controls:</span>
          </div>

          {/* 1. AI Audit Filter */}
          <div className="flex items-center bg-slate-800 border border-purple-500/40 hover:border-purple-400 rounded-lg px-2 py-1 shadow-sm">
            <span className="text-[11px] text-purple-300 font-semibold mr-1.5 shrink-0 flex items-center gap-1">
              🤖 AI Audit:
            </span>
            <select
              value={selectedAiFilter}
              onChange={(e) => setSelectedAiFilter && setSelectedAiFilter(e.target.value)}
              className="bg-transparent text-xs text-purple-100 font-medium focus:outline-none cursor-pointer pr-1"
              title="Filter tasks by AI audit status & verdict"
            >
              <option value="ALL" className="bg-slate-900 text-white font-bold">All AI Status ({crossStats?.total || 0})</option>
              <option value="AI_AUDITED" className="bg-slate-900 text-purple-300 font-semibold">
                Audited by AI ({crossStats?.aiAuditedCount || 0})
              </option>
              <option value="AI_PENDING" className="bg-slate-900 text-amber-300">
                Pending AI ({crossStats?.aiPendingCount || 0})
              </option>
              <option value="AI_PASSED" className="bg-slate-900 text-emerald-300">
                AI PASSED ({crossStats?.aiPassedCount || 0})
              </option>
              <option value="AI_FATAL" className="bg-slate-900 text-red-300">
                AI FATAL ({crossStats?.aiFatalCount || 0})
              </option>
            </select>
          </div>

          {/* 2. Human Auditor Audit Filter */}
          <div className="flex items-center bg-slate-800 border border-sky-500/40 hover:border-sky-400 rounded-lg px-2 py-1 shadow-sm">
            <span className="text-[11px] text-sky-300 font-semibold mr-1.5 shrink-0 flex items-center gap-1">
              👤 Auditor Status:
            </span>
            <select
              value={selectedHumanFilter}
              onChange={(e) => setSelectedHumanFilter && setSelectedHumanFilter(e.target.value)}
              className="bg-transparent text-xs text-sky-100 font-medium focus:outline-none cursor-pointer pr-1"
              title="Filter by City Auditor verdict (Distinguished from AI verdict)"
            >
              <option value="ALL" className="bg-slate-900 text-white font-bold">All Auditor Status</option>
              <option value="HUMAN_AUDITED" className="bg-slate-900 text-sky-300 font-semibold">
                Audited by Auditor ({crossStats?.humanAuditedCount || 0})
              </option>
              <option value="HUMAN_PENDING" className="bg-slate-900 text-amber-300">
                Pending Auditor ({crossStats?.humanPendingCount || 0})
              </option>
              <option value="HUMAN_PASSED" className="bg-slate-900 text-emerald-300">
                Auditor PASSED ({crossStats?.humanPassedCount || 0})
              </option>
              <option value="HUMAN_FATAL" className="bg-slate-900 text-red-300">
                Auditor FATAL ({crossStats?.humanFatalCount || 0})
              </option>
            </select>
          </div>

          {/* 3. Cross-Verification Compliance Filter */}
          <div className="flex items-center bg-slate-800 border border-emerald-500/40 hover:border-emerald-400 rounded-lg px-2 py-1 shadow-sm">
            <span className="text-[11px] text-emerald-300 font-semibold mr-1.5 shrink-0 flex items-center gap-1">
              🎯 Cross-Verification:
            </span>
            <select
              value={selectedCrossFilter}
              onChange={(e) => setSelectedCrossFilter && setSelectedCrossFilter(e.target.value)}
              className="bg-transparent text-xs text-emerald-100 font-medium focus:outline-none cursor-pointer pr-1"
              title="Filter tasks by compliance agreement between Auditor and AI verdicts"
            >
              <option value="ALL" className="bg-slate-900 text-white font-bold">All Cross-Check Status</option>
              <option value="DUAL_AUDITED" className="bg-slate-900 text-sky-300 font-semibold">
                Both Audited ({crossStats?.dualAuditedCount || 0})
              </option>
              <option value="AGREEMENT" className="bg-slate-900 text-emerald-300 font-bold">
                🎯 100% Agreement / Match ({crossStats?.dualAgreedCount || 0})
              </option>
              <option value="DISCREPANCY" className="bg-slate-900 text-rose-300 font-bold">
                ⚠️ Discrepancy Mismatch ({crossStats?.dualDiscrepancyCount || 0})
              </option>
              <option value="AI_FP" className="bg-slate-900 text-amber-300">
                ⚠️ AI False Positive: Missed Fatal ({crossStats?.aiFpCount || 0})
              </option>
              <option value="AI_FN" className="bg-slate-900 text-red-300">
                ⚠️ AI False Negative: Over-flagged ({crossStats?.aiFnCount || 0})
              </option>
              <option value="HIGH_COMPLIANCE" className="bg-slate-900 text-emerald-300">
                High Station Compliance (≥80%)
              </option>
              <option value="LOW_COMPLIANCE" className="bg-slate-900 text-rose-300">
                Low Station Compliance (&lt;80%)
              </option>
              <option value="PENDING_DUAL" className="bg-slate-900 text-slate-400">
                Pending Dual Audit (1/2 or 0/2)
              </option>
            </select>
          </div>

          {/* Quick Discrepancy Alert Badges */}
          {crossStats?.dualDiscrepancyCount > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              {crossStats.aiFpCount > 0 && (
                <button
                  onClick={() => setSelectedCrossFilter && setSelectedCrossFilter('AI_FP')}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                    selectedCrossFilter === 'AI_FP'
                      ? 'bg-amber-500/30 text-amber-200 border-amber-400'
                      : 'bg-amber-950/40 text-amber-300 border-amber-500/30 hover:bg-amber-900/40'
                  }`}
                  title="Filter to AI False Positives (City Auditor found Fatal, but AI Passed)"
                >
                  FP (Missed): {crossStats.aiFpCount}
                </button>
              )}
              {crossStats.aiFnCount > 0 && (
                <button
                  onClick={() => setSelectedCrossFilter && setSelectedCrossFilter('AI_FN')}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                    selectedCrossFilter === 'AI_FN'
                      ? 'bg-rose-500/30 text-rose-200 border-rose-400'
                      : 'bg-rose-950/40 text-rose-300 border-rose-500/30 hover:bg-rose-900/40'
                  }`}
                  title="Filter to AI False Negatives (City Auditor Passed, but AI flagged Fatal)"
                >
                  FN (Over-flagged): {crossStats.aiFnCount}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Filter Controls Row */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Task ID, FE Name, Customer, Address, PIN..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2">

          {/* Upload Batch Date Filter */}
          {availableBatchDates && availableBatchDates.length > 0 && setSelectedBatchDate && (
            <div className="flex items-center bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-lg px-2 py-1 shadow-sm">
              <Calendar className="w-3.5 h-3.5 text-sky-400 mr-1.5 shrink-0" />
              <select
                value={selectedBatchDate}
                onChange={(e) => setSelectedBatchDate(e.target.value)}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
                title="Filter by Upload Batch Date to avoid seeing old historical tasks"
              >
                <option value="ALL" className="bg-slate-800 text-white font-bold">All Batch Dates</option>
                {availableBatchDates.map((b, idx) => (
                  <option key={b.date} value={b.date} className="bg-slate-800 text-white">
                    {b.date} {idx === 0 ? '(Latest)' : ''} ({b.total} tasks{b.pending > 0 ? ` • ${b.pending} to do` : ''})
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* SuperAdmin Auditor Filter */}
          {!isAuditorOnly && auditors && auditors.length > 0 && setSelectedAuditor && (
            <div className="flex items-center bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-lg px-2 py-1 shadow-sm">
              <UserCheck className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
              <select
                value={selectedAuditor}
                onChange={(e) => setSelectedAuditor(e.target.value)}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
                title="SuperAdmin: Filter audits by specific auditor queue"
              >
                <option value="ALL" className="bg-slate-800 text-white font-bold">All Auditors</option>
                <option value="UNASSIGNED" className="bg-slate-800 text-amber-300 font-bold">Unassigned Tasks</option>
                {auditors.map(a => {
                  const name = a.full_name || a.name || a.id;
                  const roleSuffix = a.role ? ` (${a.role})` : '';
                  return (
                    <option key={a.id || name} value={name} className="bg-slate-800 text-white">
                      {name}{roleSuffix}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Zone Filter */}
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
            >
              <option value="ALL" className="bg-slate-800 text-white">All Zones</option>
              {zones.map(z => (
                <option key={z} value={z} className="bg-slate-800 text-white">{z}</option>
              ))}
            </select>
          </div>

          {/* Task Status Filter */}
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
            <span className="text-[11px] text-slate-400 mr-1.5 font-medium">Task:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
            >
              <option value="ALL" className="bg-slate-800 text-white">All Statuses</option>
              {statuses.map(s => (
                <option key={s} value={s} className="bg-slate-800 text-white">{s}</option>
              ))}
            </select>
          </div>

          {/* Only with Images Toggle */}
          <button
            onClick={() => setOnlyWithImages(!onlyWithImages)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              onlyWithImages
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'bg-slate-900 text-slate-400 border border-slate-700 hover:text-slate-200'
            }`}
            title="Show only tasks that have audit images uploaded"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Has Images</span>
            {onlyWithImages && <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>}
          </button>

          {/* D+1 Overdue SLA Filter Button */}
          {overdueCount > 0 && setOnlyDPlusOneOverdue && (
            <button
              onClick={() => setOnlyDPlusOneOverdue(!onlyDPlusOneOverdue)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                onlyDPlusOneOverdue
                  ? 'bg-red-500/25 text-red-300 border border-red-500 shadow-sm animate-pulse'
                : 'bg-red-950/30 text-red-400 border border-red-500/30 hover:bg-red-900/40'
              }`}
              title="Show only tasks that have breached their 24h SLA into D+1 (Escalated to BH & GM)"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span>D+1 Overdue ({overdueCount})</span>
            </button>
          )}

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="px-2 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
              title="Reset all filters"
            >
              <X className="w-3 h-3" />
              Reset
            </button>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-0.5 ml-auto">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Card / Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
