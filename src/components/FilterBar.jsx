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
  AlertTriangle
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
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Queue:</span>
          
          <button
            onClick={() => setSelectedAuditStatus('PENDING')}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              selectedAuditStatus === 'PENDING' || selectedAuditStatus === 'AWAITING_VERIFICATION'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm ring-1 ring-amber-500/30'
                : 'bg-slate-900/80 text-slate-400 border border-slate-700/80 hover:text-amber-300 hover:border-slate-600'
            }`}
            title="Focus strictly on AI-audited tasks awaiting Human Verification"
          >
            <span>⚡ Awaiting Review</span>
            {pendingCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                selectedAuditStatus === 'PENDING' || selectedAuditStatus === 'AWAITING_VERIFICATION' ? 'bg-amber-400/20 text-amber-200' : 'bg-slate-800 text-slate-300'
              }`}>
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setSelectedAuditStatus('VERIFIED')}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              selectedAuditStatus === 'VERIFIED' || selectedAuditStatus === 'HUMAN_VERIFIED'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm ring-1 ring-emerald-500/30'
                : 'bg-slate-900/80 text-slate-400 border border-slate-700/80 hover:text-emerald-300 hover:border-slate-600'
            }`}
            title="View tasks confirmed by human verification"
          >
            <span>✓ Human Verified</span>
            {verifiedCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                selectedAuditStatus === 'VERIFIED' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-slate-800 text-slate-300'
              }`}>
                {verifiedCount}
              </span>
            )}
          </button>

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

          <button
            onClick={() => setSelectedAuditStatus('FATAL')}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              selectedAuditStatus === 'FATAL'
                ? 'bg-red-500/20 text-red-300 border border-red-500/50 shadow-sm ring-1 ring-red-500/30'
                : 'bg-slate-900/80 text-slate-400 border border-slate-700/80 hover:text-red-300 hover:border-slate-600'
            }`}
            title="View only FATAL strikes"
          >
            <span>❌ Fatal Strikes</span>
            {fatalCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                selectedAuditStatus === 'FATAL' ? 'bg-red-400/20 text-red-200' : 'bg-slate-800 text-slate-300'
              }`}>
                {fatalCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setSelectedAuditStatus('PASSED')}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              selectedAuditStatus === 'PASSED'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm ring-1 ring-emerald-500/30'
                : 'bg-slate-900/80 text-slate-400 border border-slate-700/80 hover:text-emerald-300 hover:border-slate-600'
            }`}
            title="View passed audits"
          >
            <span>✅ Passed</span>
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
        {isAuditorOnly && (
          <div 
            className="flex items-center bg-blue-500/10 border border-blue-500/30 rounded-lg px-2.5 py-1 text-xs font-bold text-sky-300"
            title="City Admins strictly see tasks allocated to their personal queue"
          >
            <UserCheck className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
            <span>My Allocated Queue Only{currentUserName ? ` (${currentUserName})` : ''}</span>
          </div>
        )}
      </div>

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
