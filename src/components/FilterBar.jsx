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
  selectedAuditor = 'ALL',
  setSelectedAuditor,
  auditors = [],
  isAuditorOnly = false,
  onlyWithImages,
  setOnlyWithImages,
  onlyDPlusOneOverdue = false,
  setOnlyDPlusOneOverdue,
  overdueCount = 0,
  viewMode,
  setViewMode,
  zones = [],
  statuses = [],
  onClearFilters,
  hasActiveFilters
}) {
  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 mb-5 shadow-lg backdrop-blur-sm">
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
          
          {/* Auditor Queue Badge or Filter Dropdown */}
          {isAuditorOnly ? (
            <div className="flex items-center bg-blue-500/10 border border-blue-500/30 rounded-lg px-2.5 py-1 text-xs font-bold text-sky-300">
              <UserCheck className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
              <span>My Allocated Queue Only</span>
            </div>
          ) : (
            auditors && auditors.length > 0 && setSelectedAuditor && (
              <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
                <UserCheck className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
                <select
                  value={selectedAuditor}
                  onChange={(e) => setSelectedAuditor(e.target.value)}
                  className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
                >
                  <option value="ALL" className="bg-slate-800 text-white">All Auditors</option>
                  <option value="UNASSIGNED" className="bg-slate-800 text-amber-300">Unassigned Tasks</option>
                  {auditors.map(a => {
                    const name = a.full_name || a.name || a.id;
                    return (
                      <option key={a.id || name} value={name} className="bg-slate-800 text-white">
                        {name}
                      </option>
                    );
                  })}
                </select>
              </div>
            )
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

          {/* Audit Status Filter */}
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
            <span className="text-[11px] text-slate-400 mr-1.5 font-medium">Audit:</span>
            <select
              value={selectedAuditStatus}
              onChange={(e) => setSelectedAuditStatus(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
            >
              <option value="ALL" className="bg-slate-800 text-white">All Audits</option>
              <option value="PENDING" className="bg-slate-800 text-amber-300">Pending</option>
              <option value="PASSED" className="bg-slate-800 text-emerald-400">Passed</option>
              <option value="FATAL" className="bg-slate-800 text-red-400">FATAL (Failed)</option>
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
              className="px-2 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-colors flex items-center gap-1"
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
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
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
