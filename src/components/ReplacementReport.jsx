import React, { useState, useMemo } from 'react';
import { 
  Package, 
  Wrench, 
  Download, 
  Calendar, 
  MapPin, 
  AlertTriangle, 
  CheckCircle2, 
  Filter, 
  Search,
  Clock,
  Sparkles,
  ShoppingBag
} from 'lucide-react';
import { exportReplacementReport } from '../utils/excelParser.js';

export default function ReplacementReport({ tasks, onUpdateTaskReplacements }) {
  const [timeFilter, setTimeFilter] = useState('ALL'); // 'ALL' | 'WEEK' | 'MONTH'
  const [selectedHub, setSelectedHub] = useState('ALL');
  const [selectedUrgency, setSelectedUrgency] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Collect all replacement records across tasks
  const allRequisitions = useMemo(() => {
    const list = [];
    tasks.forEach(task => {
      (task.replacements || []).forEach(rep => {
        list.push({
          ...rep,
          taskId: task.taskId,
          feName: task.feName,
          feCode: task.feCode,
          feId: task.feId,
          facilityCode: task.facilityCode,
          zone: task.zone,
          date: task.date,
          originalTaskId: task.id
        });
      });
    });
    return list;
  }, [tasks]);

  // Extract distinct hubs
  const hubs = useMemo(() => {
    const set = new Set();
    allRequisitions.forEach(r => { if (r.facilityCode) set.add(r.facilityCode); });
    return Array.from(set).sort();
  }, [allRequisitions]);

  // Filter requisitions
  const filteredRequisitions = useMemo(() => {
    return allRequisitions.filter(item => {
      if (selectedHub !== 'ALL' && item.facilityCode !== selectedHub) return false;
      if (selectedUrgency !== 'ALL' && item.urgency !== selectedUrgency) return false;

      // Timeframe filter
      if (timeFilter !== 'ALL') {
        const itemDate = new Date(item.reportedAt || item.date);
        const now = new Date();
        if (timeFilter === 'WEEK') {
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(now.getDate() - 7);
          if (itemDate < oneWeekAgo) return false;
        } else if (timeFilter === 'MONTH') {
          const oneMonthAgo = new Date();
          oneMonthAgo.setDate(now.getDate() - 30);
          if (itemDate < oneMonthAgo) return false;
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches = 
          item.itemName.toLowerCase().includes(q) ||
          item.feName.toLowerCase().includes(q) ||
          item.feCode.toLowerCase().includes(q) ||
          item.taskId.toLowerCase().includes(q) ||
          (item.condition && item.condition.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [allRequisitions, selectedHub, selectedUrgency, timeFilter, searchQuery]);

  // Aggregate by Item for Central Supply ordering
  const itemAggregate = useMemo(() => {
    const map = {};
    filteredRequisitions.forEach(r => {
      if (!map[r.itemName]) {
        map[r.itemName] = {
          name: r.itemName,
          category: r.category,
          type: r.type,
          count: 0,
          immediate: 0,
          high: 0,
          normal: 0,
          feNames: new Set()
        };
      }
      map[r.itemName].count++;
      if (r.urgency === 'IMMEDIATE') map[r.itemName].immediate++;
      if (r.urgency === 'HIGH') map[r.itemName].high++;
      if (r.urgency === 'NORMAL') map[r.itemName].normal++;
      map[r.itemName].feNames.add(r.feName);
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [filteredRequisitions]);

  const handleExportExcel = () => {
    const filename = `Lenskart_FE_Asset_Orders_${timeFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    exportReplacementReport(tasks, filename);
  };

  const criticalCount = filteredRequisitions.filter(r => r.urgency === 'IMMEDIATE').length;
  const distinctFEs = new Set(filteredRequisitions.map(r => r.feCode || r.feName)).size;

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950/40 to-slate-900 border border-slate-700/80 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-sky-600/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  Central Supply & Logistics
                </span>
                <span className="text-xs text-slate-400 font-mono">Consumables & Assets</span>
              </div>
              <h2 className="text-lg font-extrabold text-white mt-0.5">
                FE Asset Replacement & Consumables Requisition Portal
              </h2>
              <p className="text-xs text-slate-400">
                Weekly & monthly consolidated orders generated from quality audits to replace faulty, damaged, or depleted tools for Field Executives.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white shadow-lg shadow-sky-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Procurement Order (.xlsx)
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Requisition Units
          </span>
          <div className="text-2xl font-black text-white mt-1">{filteredRequisitions.length}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Items requiring dispatch</span>
        </div>

        <div className="bg-slate-800/80 border border-red-500/40 bg-red-950/10 rounded-xl p-3.5">
          <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider block">
            Critical (Immediate 24h)
          </span>
          <div className="text-2xl font-black text-red-400 mt-1">{criticalCount}</div>
          <span className="text-[11px] text-red-300 mt-0.5 block">Urgent kits blocking visits</span>
        </div>

        <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5">
          <span className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider block">
            FEs Requiring Kit Restock
          </span>
          <div className="text-2xl font-black text-sky-300 mt-1">{distinctFEs}</div>
          <span className="text-[11px] text-sky-400/80 mt-0.5 block">Unique field refractionists</span>
        </div>

        <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5">
          <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider block">
            Catalogue Items in Demand
          </span>
          <div className="text-2xl font-black text-indigo-300 mt-1">{itemAggregate.length}</div>
          <span className="text-[11px] text-indigo-400/80 mt-0.5 block">Distinct SKUs flagged</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Item name, FE name, Task ID..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe */}
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-800 text-white">All Requisitions</option>
              <option value="WEEK" className="bg-slate-800 text-white">Weekly Report (Last 7 Days)</option>
              <option value="MONTH" className="bg-slate-800 text-white">Monthly Report (Last 30 Days)</option>
            </select>
          </div>

          {/* Hub */}
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
            <select
              value={selectedHub}
              onChange={(e) => setSelectedHub(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-800 text-white">All Facilities / Hubs</option>
              {hubs.map(h => (
                <option key={h} value={h} className="bg-slate-800 text-white">{h}</option>
              ))}
            </select>
          </div>

          {/* Urgency */}
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1">
            <span className="text-[11px] text-slate-400 mr-1.5">Urgency:</span>
            <select
              value={selectedUrgency}
              onChange={(e) => setSelectedUrgency(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-800 text-white">All Priorities</option>
              <option value="IMMEDIATE" className="bg-slate-800 text-red-400">Immediate 24h</option>
              <option value="HIGH" className="bg-slate-800 text-amber-400">High Priority</option>
              <option value="NORMAL" className="bg-slate-800 text-sky-400">Routine Restock</option>
            </select>
          </div>
        </div>

      </div>

      {/* Aggregate Requisition Demand Breakdown Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-sky-400" />
            Central Procurement SKU Requisition Summary
          </h3>
          <span className="text-xs text-slate-400">
            {itemAggregate.length} items to order
          </span>
        </div>

        {itemAggregate.length === 0 ? (
          <div className="p-8 text-center bg-slate-800/40 border border-slate-700/60 rounded-xl text-xs text-slate-500">
            No equipment or consumable replacement requests recorded yet.
            <br />
            Auditors can flag faulty tools during image inspection in the "Asset Faults & Orders" tab.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {itemAggregate.map(item => (
              <div 
                key={item.name}
                className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 font-mono">
                      {item.category}
                    </span>
                    <span className="text-xs font-black px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      Qty: {item.count}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-white mb-1.5 line-clamp-1" title={item.name}>
                    {item.name}
                  </h4>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-2">
                    <span>Type: <strong className="text-slate-300">{item.type}</strong></span>
                    <span>•</span>
                    <span>For <strong className="text-slate-300">{item.feNames.size}</strong> FE(s)</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px]">
                  {item.immediate > 0 && (
                    <span className="text-red-400 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {item.immediate} Critical
                    </span>
                  )}
                  {item.high > 0 && (
                    <span className="text-amber-400 font-semibold">
                      {item.high} High
                    </span>
                  )}
                  {item.normal > 0 && (
                    <span className="text-sky-400 font-semibold">
                      {item.normal} Routine
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detailed FE Distribution Table */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-850 border-b border-slate-700/80 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Wrench className="w-4 h-4 text-sky-400" />
            Field Executive Dispatch & Replacement Allocation Table ({filteredRequisitions.length} rows)
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {timeFilter === 'WEEK' ? 'Weekly View' : timeFilter === 'MONTH' ? 'Monthly View' : 'All Time'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900/80 text-slate-400 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-700">
                <th className="py-3 px-4">Task ID</th>
                <th className="py-3 px-4">Field Executive</th>
                <th className="py-3 px-4">Facility / Hub</th>
                <th className="py-3 px-4">Equipment Item</th>
                <th className="py-3 px-4">Fault Condition</th>
                <th className="py-3 px-4">Priority / Urgency</th>
                <th className="py-3 px-4">Auditor Notes</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50 text-slate-200">
              {filteredRequisitions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-slate-500">
                    No replacement items match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredRequisitions.map((req, idx) => (
                  <tr key={req.id || idx} className="hover:bg-slate-750/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-blue-400">
                      {req.taskId}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">{req.feName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {req.feCode} (ID: {req.feId})
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 font-mono text-[10px]">
                        {req.facilityCode}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-200">
                      {req.itemName}
                      <span className="block text-[10px] text-slate-500 font-normal">
                        {req.type} • {req.category}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-amber-300 font-medium">
                        {req.condition}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {req.urgency === 'IMMEDIATE' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500/20 text-red-400 border border-red-500/40">
                          <AlertTriangle className="w-3 h-3" />
                          Critical (24h)
                        </span>
                      ) : req.urgency === 'HIGH' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          High Priority
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-500/20 text-sky-300 border border-sky-500/40">
                          Routine Restock
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-400" title={req.notes}>
                      {req.notes || 'Requisition requested during audit'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        PENDING ORDER
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
