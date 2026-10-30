import React, { useState, useMemo } from 'react';
import { 
  ShoppingBag, 
  Wrench, 
  Download, 
  MapPin, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Building2, 
  UserCheck, 
  ShieldAlert, 
  TrendingUp, 
  Search, 
  Plus, 
  ExternalLink,
  Layers,
  ArrowRight
} from 'lucide-react';
import { EQUIPMENT_CATALOGUE } from '../data/equipmentItems.js';
import { exportReplacementReport } from '../utils/excelParser.js';

export default function AssetRequisitionDashboard({
  tasks,
  onUpdateReplacementPosStatus,
  currentUserRole,
  currentUserName,
  currentFacilityCode
}) {
  const [subTab, setSubTab] = useState('city_admin'); // 'city_admin' | 'central_ops' | 'gm_oversight' | 'watchlist_editor'
  const [timeframe, setTimeframe] = useState('WEEK'); // 'WEEK' | 'MONTH' | 'ALL'
  const [selectedHub, setSelectedHub] = useState(currentUserRole === 'Admin' ? currentFacilityCode : 'ALL');
  const [posInputNumber, setPosInputNumber] = useState('');
  const [orderingItemId, setOrderingItemId] = useState(null);

  // Extract all replacements across tasks
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
          facilityCode: task.facilityCode || task.teamName || 'Ahmedabad',
          zone: task.zone,
          date: task.date,
          originalTaskId: task.id
        });
      });
    });
    return list;
  }, [tasks]);

  // Distinct hubs
  const hubs = useMemo(() => {
    const set = new Set();
    allRequisitions.forEach(r => { if (r.facilityCode) set.add(r.facilityCode); });
    return Array.from(set).sort();
  }, [allRequisitions]);

  // Filtered by Hub & Timeframe
  const filteredList = useMemo(() => {
    return allRequisitions.filter(item => {
      if (selectedHub !== 'ALL' && item.facilityCode !== selectedHub) return false;
      return true;
    });
  }, [allRequisitions, selectedHub]);

  // Central SKU demand aggregation
  const skuDemand = useMemo(() => {
    const map = {};
    filteredList.forEach(r => {
      if (!map[r.itemName]) {
        map[r.itemName] = {
          name: r.itemName,
          category: r.category,
          type: r.type,
          totalNeeded: 0,
          pendingPosOrder: 0,
          orderedOnPos: 0,
          criticalCount: 0,
          hubs: new Set()
        };
      }
      map[r.itemName].totalNeeded++;
      if (!r.posStatus || r.posStatus === 'FLAGGED_BY_AUDITOR') map[r.itemName].pendingPosOrder++;
      if (r.posStatus === 'ORDERED_ON_POS') map[r.itemName].orderedOnPos++;
      if (r.urgency === 'IMMEDIATE') map[r.itemName].criticalCount++;
      map[r.itemName].hubs.add(r.facilityCode);
    });
    return Object.values(map).sort((a, b) => b.totalNeeded - a.totalNeeded);
  }, [filteredList]);

  // GM & BH Hub Negligence Analytics
  const hubNegligenceStats = useMemo(() => {
    const map = {};
    allRequisitions.forEach(r => {
      const hub = r.facilityCode;
      if (!map[hub]) {
        map[hub] = {
          hub,
          totalFlagged: 0,
          pendingPos: 0,
          orderedPos: 0,
          criticalPending: 0,
          oldestPendingDays: 0
        };
      }
      map[hub].totalFlagged++;
      const isPending = !r.posStatus || r.posStatus === 'FLAGGED_BY_AUDITOR';
      if (isPending) {
        map[hub].pendingPos++;
        if (r.urgency === 'IMMEDIATE') map[hub].criticalPending++;
        const reportedDate = new Date(r.reportedAt || r.date);
        const daysLag = Math.floor((new Date() - reportedDate) / (1000 * 60 * 60 * 24));
        if (daysLag > map[hub].oldestPendingDays) map[hub].oldestPendingDays = daysLag;
      } else if (r.posStatus === 'ORDERED_ON_POS') {
        map[hub].orderedPos++;
      }
    });
    return Object.values(map).sort((a, b) => b.criticalPending - a.criticalPending || b.pendingPos - a.pendingPos);
  }, [allRequisitions]);

  // City Admin marks order on POS
  const handleConfirmPosOrder = (taskId, repId) => {
    if (!posInputNumber.trim()) {
      alert('Please enter the POS Invoice or Order ID.');
      return;
    }
    onUpdateReplacementPosStatus(taskId, repId, {
      posStatus: 'ORDERED_ON_POS',
      posOrderNumber: posInputNumber.trim(),
      orderedBy: currentUserName,
      orderedAt: new Date().toISOString()
    });
    setOrderingItemId(null);
    setPosInputNumber('');
  };

  const handleMarkDisbursed = (taskId, repId) => {
    onUpdateReplacementPosStatus(taskId, repId, {
      posStatus: 'DISBURSED_TO_FE',
      disbursedAt: new Date().toISOString()
    });
  };

  const handleExport = () => {
    exportReplacementReport(tasks, `Lenskart_Asset_Requisitions_${selectedHub}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const isCityAdmin = currentUserRole === 'Admin' || currentUserRole === 'AM';
  const isGMorBH = currentUserRole === 'GM' || currentUserRole === 'BH' || currentUserRole === 'SuperAdmin';
  const isCentralOps = currentUserRole === 'Central Ops' || isGMorBH;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950/50 to-slate-900 border border-slate-700/80 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Equipment
                </span>
                <span className="text-xs text-slate-400 font-mono">City Orders & Stock</span>
              </div>
              <h2 className="text-lg font-extrabold text-white mt-0.5">
                Tool & Equipment Orders
              </h2>
              <p className="text-xs text-slate-400">
                Order replacement tools on local POS for flagged FEs, monitor warehouse stock, and check tool usage.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              Export Orders (.xlsx)
            </button>
          </div>
        </div>
      </div>

      {/* Perspective Tabs */}
      <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 overflow-x-auto">
        <button
          onClick={() => setSubTab('city_admin')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            subTab === 'city_admin'
              ? 'bg-sky-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          City POS Orders ({filteredList.filter(r => !r.posStatus || r.posStatus === 'FLAGGED_BY_AUDITOR').length} Pending)
        </button>

        <button
          onClick={() => setSubTab('central_ops')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            subTab === 'central_ops'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          Central Stock Readiness ({skuDemand.length} Items)
        </button>

        <button
          onClick={() => setSubTab('gm_oversight')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            subTab === 'gm_oversight'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          Hub Usage & Duty Review
        </button>
      </div>

      {/* VIEW 1: City Admin POS Action Center */}
      {subTab === 'city_admin' && (
        <div className="space-y-4">
          <div className="p-4 bg-sky-950/20 border border-sky-500/30 rounded-xl text-xs text-sky-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-400" />
              <span>
                City Admin Procedure: When an auditor flags an FE's broken/missing equipment, order the replacement on your <strong>Local POS</strong>, enter the Order ID, and hand over the item to the FE.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Hub:</span>
              <select
                value={selectedHub}
                onChange={(e) => setSelectedHub(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
              >
                <option value="ALL">All Hubs</option>
                {hubs.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900/80 text-slate-400 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-700">
                    <th className="py-3 px-4">FE Details</th>
                    <th className="py-3 px-4">Item to Order</th>
                    <th className="py-3 px-4">Condition & Urgency</th>
                    <th className="py-3 px-4">Auditor Notes</th>
                    <th className="py-3 px-4">POS Order Status</th>
                    <th className="py-3 px-4 text-right">City Admin Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 text-slate-200">
                  {filteredList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                        No equipment replacement requests recorded for this hub.
                      </td>
                    </tr>
                  ) : (
                    filteredList.map((req, idx) => {
                      const isPending = !req.posStatus || req.posStatus === 'FLAGGED_BY_AUDITOR';
                      const isOrdered = req.posStatus === 'ORDERED_ON_POS';
                      const isDisbursed = req.posStatus === 'DISBURSED_TO_FE';

                      return (
                        <tr key={req.id || idx} className="hover:bg-slate-750/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-white">{req.feName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              ID: {req.feId} • {req.facilityCode}
                            </div>
                          </td>

                          <td className="py-3 px-4 font-semibold text-slate-200">
                            {req.itemName}
                            <span className="block text-[10px] text-slate-400 font-normal">
                              {req.type} • {req.category}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <span className="text-amber-300 font-medium block">{req.condition}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                              req.urgency === 'IMMEDIATE' ? 'bg-red-500/20 text-red-300' : 'bg-sky-500/20 text-sky-300'
                            }`}>
                              {req.urgency}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-slate-400 max-w-xs truncate" title={req.notes}>
                            {req.notes}
                          </td>

                          <td className="py-3 px-4">
                            {isPending && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                <Clock className="w-3 h-3" />
                                Action Required: Order on POS
                              </span>
                            )}
                            {isOrdered && (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                                  Ordered on POS #{req.posOrderNumber || 'Logged'}
                                </span>
                                <span className="block text-[9px] text-slate-400 mt-0.5">
                                  By: {req.orderedBy || 'City Admin'}
                                </span>
                              </div>
                            )}
                            {isDisbursed && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                <CheckCircle2 className="w-3 h-3" />
                                Disbursed to FE
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {isPending && (
                              orderingItemId === req.id ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <input
                                    type="text"
                                    placeholder="Enter POS Order #"
                                    value={posInputNumber}
                                    onChange={(e) => setPosInputNumber(e.target.value)}
                                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white w-28"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleConfirmPosOrder(req.originalTaskId, req.id)}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setOrderingItemId(null)}
                                    className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setOrderingItemId(req.id)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition-colors cursor-pointer"
                                >
                                  + Order on POS
                                </button>
                              )
                            )}

                            {isOrdered && (
                              <button
                                onClick={() => handleMarkDisbursed(req.originalTaskId, req.id)}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors cursor-pointer"
                              >
                                ✓ Hand Over to FE
                              </button>
                            )}

                            {isDisbursed && (
                              <span className="text-slate-500 text-xs">Fulfilled</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: Central Ops Stock Readiness */}
      {subTab === 'central_ops' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-950/20 border border-blue-500/30 rounded-xl text-xs text-blue-300 flex items-center justify-between">
            <span>
              Central Ops Warehouse View: Aggregated SKU demands across India. Use this forecast to keep buffer stock available in central warehouses so city POS orders can be fulfilled without delays.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {skuDemand.map(sku => (
              <div key={sku.name} className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 font-mono">
                      {sku.category}
                    </span>
                    <span className="text-xs font-black px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      Total: {sku.totalNeeded} Units
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-white mb-1">{sku.name}</h4>
                  <div className="text-xs text-slate-400 mb-2">
                    Affected Hubs: <strong className="text-slate-200">{Array.from(sku.hubs).join(', ')}</strong>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-700 flex items-center justify-between text-[11px]">
                  <span className="text-amber-400 font-semibold">{sku.pendingPosOrder} Awaiting City POS</span>
                  <span className="text-emerald-400 font-semibold">{sku.orderedOnPos} Ordered on POS</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 3: GM & BH Negligence & Longevity Audit */}
      {subTab === 'gm_oversight' && (
        <div className="space-y-4">
          <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-xl text-xs text-indigo-300">
            <span className="font-bold block mb-1">Executive Governance & Negligence Auditing:</span>
            Monitors whether City Admins/AMs are promptly ordering required tools on POS, or neglecting their duties leaving FEs with defective kits.
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-850 border-b border-slate-700/80">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Hub-by-Hub Admin Fulfillment & Duty Negligence Scorecard
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900/80 text-slate-400 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-700">
                    <th className="py-3 px-4">Operating Hub</th>
                    <th className="py-3 px-4">Total Flagged Items</th>
                    <th className="py-3 px-4">Pending on POS</th>
                    <th className="py-3 px-4">Critical 24h Neglected</th>
                    <th className="py-3 px-4">Oldest Unordered Lag</th>
                    <th className="py-3 px-4 text-right">City Admin Compliance Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 text-slate-200">
                  {hubNegligenceStats.map(stat => {
                    const isNeglect = stat.criticalPending > 0 || stat.oldestPendingDays > 2;

                    return (
                      <tr key={stat.hub} className="hover:bg-slate-750/50 transition-colors">
                        <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{stat.hub}</span>
                        </td>

                        <td className="py-3 px-4 font-mono font-semibold text-slate-200">
                          {stat.totalFlagged} items
                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-amber-400">
                          {stat.pendingPos} items
                        </td>

                        <td className="py-3 px-4">
                          {stat.criticalPending > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/40">
                              <AlertTriangle className="w-3 h-3" />
                              {stat.criticalPending} Critical Ignored
                            </span>
                          ) : (
                            <span className="text-emerald-400 font-medium">0 Critical</span>
                          )}
                        </td>

                        <td className="py-3 px-4 font-mono text-slate-400">
                          {stat.oldestPendingDays > 0 ? `${stat.oldestPendingDays} days overdue` : 'Up to date'}
                        </td>

                        <td className="py-3 px-4 text-right">
                          {isNeglect ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-black bg-red-500 text-white animate-pulse">
                              Attention / Duty Neglect
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                              Prompt & Compliant
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
