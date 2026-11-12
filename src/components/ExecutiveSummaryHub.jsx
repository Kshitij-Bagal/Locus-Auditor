import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Calendar,
  Building2,
  Users,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Filter,
  Download,
  Search,
  ChevronRight,
  ExternalLink,
  Camera,
  ImageOff,
  UserCheck,
  TrendingDown,
  TrendingUp,
  Briefcase,
  MapPin,
  RefreshCw,
  Eye,
  Layers,
  ArrowUpDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseRoles } from '../utils/accessHelper.js';
import { normalizeManagerName, matchManagerName, isGenericManagerName } from '../utils/managerHelper.js';

export default function ExecutiveSummaryHub({
  tasks = [],
  users = [],
  currentUser,
  onNavigate,
  onFilterFE
}) {
  const [activeTab, setActiveTab] = useState('dateWise'); // 'dateWise' | 'cityMatrix' | 'hierarchy' | 'feLedger' | 'taskInspector'
  
  // Interactive Filter States
  const [selectedDate, setSelectedDate] = useState('ALL');
  const [selectedCity, setSelectedCity] = useState('ALL');
  const [selectedRmFilter, setSelectedRmFilter] = useState('ALL');
  const [selectedAmFilter, setSelectedAmFilter] = useState('ALL');
  const [selectedAuditStatus, setSelectedAuditStatus] = useState('ALL'); // 'ALL' | 'PASSED' | 'FATAL' | 'PENDING'
  const [selectedImageStatus, setSelectedImageStatus] = useState('ALL'); // 'ALL' | 'WITH_IMAGES' | 'NO_IMAGES' | 'BLANK_IMAGES'
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination for Task Inspector
  const [taskPage, setTaskPage] = useState(1);
  const tasksPerPage = 25;

  // 1. Build Manager Lookup Map from Users Table
  const { allRegionalManagers, allAreaManagers, amUserMap, rmUserMap } = useMemo(() => {
    const rms = [];
    const ams = [];
    const amMap = new Map();
    const rmMap = new Map();

    (users || []).forEach(u => {
      const roles = parseRoles(u.roles || [u.role]);
      const isAmRole = roles.includes('AM');
      const isRmRole = roles.includes('RM') || (u.facility_code && String(u.facility_code).startsWith('RM'));

      if (isAmRole) {
        ams.push(u);
        if (u.id) amMap.set(String(u.id), u);
        if (u.email) amMap.set(u.email.toLowerCase().trim(), u);
        const norm = normalizeManagerName(u.full_name || u.name);
        if (norm) amMap.set(norm, u);
      }

      if (isRmRole) {
        rms.push(u);
        if (u.id) rmMap.set(String(u.id), u);
        if (u.email) rmMap.set(u.email.toLowerCase().trim(), u);
        const norm = normalizeManagerName(u.full_name || u.name);
        if (norm) rmMap.set(norm, u);
      }
    });

    // Discover operational AMs mentioned in FE profiles
    const seenAmNames = new Set(ams.map(a => normalizeManagerName(a.full_name || a.name)));
    (users || []).forEach(u => {
      const amName = u.reporting_manager_name;
      if (amName && !isGenericManagerName(amName)) {
        const norm = normalizeManagerName(amName);
        if (norm && !seenAmNames.has(norm)) {
          seenAmNames.add(norm);
          const dynamicAm = {
            id: u.reporting_manager_id || `am_${norm}`,
            full_name: amName,
            email: u.reporting_manager_email || '',
            facility_code: u.facility_code || '',
            city: u.city || u.facility_code || '',
            regional_manager_name: u.regional_manager_name || '',
            regional_manager_email: u.regional_manager_email || '',
            regional_manager_id: u.regional_manager_id || ''
          };
          ams.push(dynamicAm);
          amMap.set(norm, dynamicAm);
          if (dynamicAm.email) amMap.set(dynamicAm.email.toLowerCase().trim(), dynamicAm);
        }
      }
    });

    // Discover operational RMs mentioned in FE profiles
    const seenRmNames = new Set(rms.map(r => normalizeManagerName(r.full_name || r.name)));
    (users || []).forEach(u => {
      const rmName = u.regional_manager_name;
      if (rmName && !isGenericManagerName(rmName)) {
        const norm = normalizeManagerName(rmName);
        if (norm && !seenRmNames.has(norm)) {
          seenRmNames.add(norm);
          const dynamicRm = {
            id: u.regional_manager_id || `rm_${norm}`,
            full_name: rmName,
            email: u.regional_manager_email || '',
            facility_code: u.facility_code || ''
          };
          rms.push(dynamicRm);
          rmMap.set(norm, dynamicRm);
          if (dynamicRm.email) rmMap.set(dynamicRm.email.toLowerCase().trim(), dynamicRm);
        }
      }
    });

    return {
      allRegionalManagers: rms.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')),
      allAreaManagers: ams.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')),
      amUserMap: amMap,
      rmUserMap: rmMap
    };
  }, [users]);

  // 2. Pre-process and Enrich all Tasks with Canonical Metadata
  const enrichedTasks = useMemo(() => {
    return tasks.map(t => {
      // Date extraction: YYYY-MM-DD or DD/MM/YYYY
      const rawDate = t.date || t.dispatch_date || (t.createdAt ? t.createdAt.slice(0, 10) : 'Unknown Date');
      const cleanDate = String(rawDate).slice(0, 10);

      // City / Facility extraction
      const city = t.facilityCode || t.city || t.teamName || 'Unknown City';
      const zone = t.zone || t.Zone || 'Central Zone';

      // Photo and Blank status
      const hasUploadedImages = Boolean(t.hasImages) && (Number(t.imageCount) > 0 || (t.images && Object.values(t.images).some(Boolean)));
      
      const rem = (t.remarks || t.auditorRemarks || '').toLowerCase();
      const reasons = (Array.isArray(t.failedReasons) ? t.failedReasons.join(' ') : String(t.failedReasons || '')).toLowerCase();
      const isBlankOrFraudulent = rem.includes('blank') || rem.includes('black') || rem.includes('covered') || 
                                 reasons.includes('blank') || reasons.includes('black') || reasons.includes('covered') || 
                                 reasons.includes('wrong/blank image');

      const isNoImagesUploaded = !hasUploadedImages;

      // Reporting hierarchy resolution
      let amName = !isGenericManagerName(t.amName) ? String(t.amName).trim() : '';
      let amEmail = t.amEmail || '';
      let rmName = !isGenericManagerName(t.rmName) ? String(t.rmName).trim() : '';
      let rmEmail = t.rmEmail || '';

      // Multi-attribute FE lookup from users table
      const tId = String(t.feId || '').trim().toLowerCase();
      const tCode = String(t.feCode || '').trim().toLowerCase();
      const tName = String(t.feName || '').trim().toLowerCase();
      const tEmail = String(t.feEmail || '').trim().toLowerCase();

      const feUser = (users || []).find(u => {
        if (!u) return false;
        const uPersonId = String(u.person_id || '').trim().toLowerCase();
        const uCode = String(u.employee_code || '').trim().toLowerCase();
        const uEmail = String(u.email || '').trim().toLowerCase();
        const uName = String(u.full_name || u.name || '').trim().toLowerCase();

        if (tCode && (uCode === tCode || uPersonId === tCode || uEmail.includes(tCode))) return true;
        if (tId && (uCode === tId || uPersonId === tId || uEmail.includes(tId))) return true;
        if (tEmail && uEmail && tEmail === uEmail) return true;
        if (tName && tName.length >= 3 && (uName === tName || uName.includes(tName) || tName.includes(uName))) return true;
        return false;
      });

      if (feUser) {
        if (!amName || isGenericManagerName(amName)) {
          if (!isGenericManagerName(feUser.reporting_manager_name)) {
            amName = feUser.reporting_manager_name.trim();
          }
          if (feUser.reporting_manager_email) {
            amEmail = feUser.reporting_manager_email.trim().toLowerCase();
          }
          if (feUser.reporting_manager_id) {
            const amObj = amUserMap.get(String(feUser.reporting_manager_id)) || (users || []).find(u => String(u.id) === String(feUser.reporting_manager_id));
            if (amObj) {
              amName = amObj.full_name || amObj.name || amName;
              amEmail = amObj.email || amEmail;
            }
          }
        }

        if (!rmName || isGenericManagerName(rmName)) {
          if (!isGenericManagerName(feUser.regional_manager_name)) {
            rmName = feUser.regional_manager_name.trim();
          }
          if (feUser.regional_manager_email) {
            rmEmail = feUser.regional_manager_email.trim().toLowerCase();
          }
          if (feUser.regional_manager_id) {
            const rmObj = rmUserMap.get(String(feUser.regional_manager_id)) || (users || []).find(u => String(u.id) === String(feUser.regional_manager_id));
            if (rmObj) {
              rmName = rmObj.full_name || rmObj.name || rmName;
              rmEmail = rmObj.email || rmEmail;
            }
          }
        }
      }

      // If still missing AM, look up by hub / facility code in allAreaManagers or CITY_ADMIN
      const hubTarget = String(city || feUser?.facility_code || feUser?.city || '').trim().toLowerCase();
      if ((!amName || isGenericManagerName(amName)) && hubTarget) {
        const amMatch = allAreaManagers.find(am => {
          const amHub = String(am.facility_code || am.city || '').toLowerCase();
          return amHub && (amHub === hubTarget || amHub.includes(hubTarget) || hubTarget.includes(amHub));
        });
        if (amMatch) {
          amName = amMatch.full_name || amMatch.name;
          amEmail = amMatch.email || amEmail;
          if (!rmName || isGenericManagerName(rmName)) {
            if (!isGenericManagerName(amMatch.regional_manager_name)) rmName = amMatch.regional_manager_name;
            if (amMatch.regional_manager_email) rmEmail = amMatch.regional_manager_email;
          }
        } else {
          // Check for CITY_ADMIN in users for this hub
          const cityAdmin = (users || []).find(u => {
            const roles = parseRoles(u.roles || [u.role]);
            const uCity = String(u.facility_code || u.city || '').toLowerCase();
            return roles.includes('CITY_ADMIN') && uCity && (uCity === hubTarget || uCity.includes(hubTarget) || hubTarget.includes(uCity));
          });
          if (cityAdmin) {
            amName = cityAdmin.full_name || cityAdmin.name;
            amEmail = cityAdmin.email || amEmail;
          }
        }
      }

      // If still missing RM, check if direct AM is linked to an RM
      if ((!rmName || isGenericManagerName(rmName)) && amName && !isGenericManagerName(amName)) {
        const amObj = (users || []).find(m => matchManagerName(m.full_name || m.name, amName));
        if (amObj) {
          if (!isGenericManagerName(amObj.regional_manager_name)) rmName = amObj.regional_manager_name;
          if (amObj.regional_manager_email) rmEmail = amObj.regional_manager_email;
        }
      }

      // If still missing RM, check zone or city in allRegionalManagers
      if (!rmName || isGenericManagerName(rmName)) {
        const zoneTarget = String(zone || feUser?.zone || '').trim().toLowerCase();
        const rmMatch = allRegionalManagers.find(rm => {
          const rmZone = String(rm.zone || '').toLowerCase();
          const rmHub = String(rm.facility_code || rm.city || '').toLowerCase();
          return (zoneTarget && rmZone && (rmZone === zoneTarget || rmZone.includes(zoneTarget) || zoneTarget.includes(rmZone))) ||
                 (hubTarget && rmHub && (rmHub === hubTarget || rmHub.includes(hubTarget) || hubTarget.includes(rmHub)));
        });
        if (rmMatch) {
          rmName = rmMatch.full_name || rmMatch.name;
          rmEmail = rmMatch.email || rmEmail;
        }
      }

      // Canonicalize RM name
      if (rmName && !isGenericManagerName(rmName)) {
        const canonical = allRegionalManagers.find(r => matchManagerName(r.full_name, rmName));
        if (canonical) {
          rmName = canonical.full_name;
          if (!rmEmail) rmEmail = canonical.email || '';
        }
      }

      // Canonicalize AM name
      if (amName && !isGenericManagerName(amName)) {
        const canonicalAm = allAreaManagers.find(a => matchManagerName(a.full_name || a.name, amName));
        if (canonicalAm) {
          amName = canonicalAm.full_name;
          if (!amEmail) amEmail = canonicalAm.email || '';
        }
      }

      // Final fallbacks: NEVER output generic "Area Managers" or "Regional Managers"
      const finalAm = (!isGenericManagerName(amName) && amName) ? amName : `${city} AM (Unassigned)`;
      const finalRm = (!isGenericManagerName(rmName) && rmName) ? rmName : `${zone} RM (Unassigned)`;

      return {
        ...t,
        cleanDate,
        city,
        zone,
        hasUploadedImages,
        isBlankOrFraudulent,
        isNoImagesUploaded,
        amName: finalAm,
        amEmail: amEmail || '',
        rmName: finalRm,
        rmEmail: rmEmail || ''
      };
    });
  }, [tasks, users, allRegionalManagers, allAreaManagers, amUserMap, rmUserMap]);

  // 3. Unique Filter Options Lists
  const availableDates = useMemo(() => {
    const set = new Set();
    enrichedTasks.forEach(t => {
      if (t.cleanDate && t.cleanDate !== 'Unknown Date') set.add(t.cleanDate);
    });
    return Array.from(set).sort();
  }, [enrichedTasks]);

  const availableCities = useMemo(() => {
    const set = new Set();
    enrichedTasks.forEach(t => {
      if (t.city) set.add(t.city);
    });
    return Array.from(set).sort();
  }, [enrichedTasks]);

  // Scoped Area Managers based on RM or City
  const scopedAreaManagers = useMemo(() => {
    let pool = allAreaManagers;
    if (selectedRmFilter !== 'ALL') {
      pool = pool.filter(am => matchManagerName(am.regional_manager_name, selectedRmFilter));
    }
    if (selectedCity !== 'ALL') {
      pool = pool.filter(am => String(am.facility_code || am.city || '').toLowerCase().includes(selectedCity.toLowerCase()));
    }
    return pool;
  }, [allAreaManagers, selectedRmFilter, selectedCity]);

  // 4. Apply Global Interactive Filters
  const filteredTasks = useMemo(() => {
    return enrichedTasks.filter(t => {
      // Date Filter
      if (selectedDate !== 'ALL' && t.cleanDate !== selectedDate) return false;

      // City Filter
      if (selectedCity !== 'ALL' && t.city.toLowerCase() !== selectedCity.toLowerCase()) return false;

      // RM Filter
      if (selectedRmFilter !== 'ALL' && !matchManagerName(t.rmName, selectedRmFilter)) return false;

      // AM Filter
      if (selectedAmFilter !== 'ALL' && !matchManagerName(t.amName, selectedAmFilter)) return false;

      // Audit Status Filter
      if (selectedAuditStatus === 'PASSED' && t.auditStatus !== 'PASSED') return false;
      if (selectedAuditStatus === 'FATAL' && t.auditStatus !== 'FATAL') return false;
      if (selectedAuditStatus === 'PENDING' && (t.auditStatus === 'PASSED' || t.auditStatus === 'FATAL')) return false;

      // Image Status Filter
      if (selectedImageStatus === 'WITH_IMAGES' && (!t.hasUploadedImages || t.isBlankOrFraudulent)) return false;
      if (selectedImageStatus === 'NO_IMAGES' && !t.isNoImagesUploaded) return false;
      if (selectedImageStatus === 'BLANK_IMAGES' && !t.isBlankOrFraudulent) return false;

      // Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const mId = String(t.taskId || t.id || '').toLowerCase().includes(q);
        const mFe = String(t.feName || '').toLowerCase().includes(q);
        const mCode = String(t.feCode || '').toLowerCase().includes(q);
        const mCity = String(t.city || '').toLowerCase().includes(q);
        const mCust = String(t.customerName || '').toLowerCase().includes(q);
        if (!mId && !mFe && !mCode && !mCity && !mCust) return false;
      }

      return true;
    });
  }, [enrichedTasks, selectedDate, selectedCity, selectedRmFilter, selectedAmFilter, selectedAuditStatus, selectedImageStatus, searchQuery]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedDate !== 'ALL') count++;
    if (selectedCity !== 'ALL') count++;
    if (selectedRmFilter !== 'ALL') count++;
    if (selectedAmFilter !== 'ALL') count++;
    if (selectedAuditStatus !== 'ALL') count++;
    if (selectedImageStatus !== 'ALL') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [selectedDate, selectedCity, selectedRmFilter, selectedAmFilter, selectedAuditStatus, selectedImageStatus, searchQuery]);

  const resetAllFilters = () => {
    setSelectedDate('ALL');
    setSelectedCity('ALL');
    setSelectedRmFilter('ALL');
    setSelectedAmFilter('ALL');
    setSelectedAuditStatus('ALL');
    setSelectedImageStatus('ALL');
    setSearchQuery('');
    setTaskPage(1);
  };

  // 5. Aggregate KPI Summary Metrics
  const summaryKPIs = useMemo(() => {
    const totalVisits = filteredTasks.length;
    let auditedVisits = 0;
    let passedVisits = 0;
    let fatalVisits = 0;
    let withPhotosCount = 0;
    let noPhotosCount = 0;
    let blankPhotosCount = 0;
    const uniqueFEs = new Set();
    const uniqueCities = new Set();
    const uniqueAMs = new Set();
    const uniqueRMs = new Set();

    filteredTasks.forEach(t => {
      if (t.feName || t.feCode) uniqueFEs.add(t.feName || t.feCode);
      if (t.city) uniqueCities.add(t.city);
      if (t.amName && t.amName !== 'Area Operations') uniqueAMs.add(t.amName);
      if (t.rmName && t.rmName !== 'Regional Operations') uniqueRMs.add(t.rmName);

      if (t.hasUploadedImages) withPhotosCount++;
      if (t.isNoImagesUploaded) noPhotosCount++;
      if (t.isBlankOrFraudulent) blankPhotosCount++;

      if (t.auditStatus === 'PASSED') {
        auditedVisits++;
        passedVisits++;
      } else if (t.auditStatus === 'FATAL') {
        auditedVisits++;
        fatalVisits++;
      }
    });

    const photoUploadRate = totalVisits > 0 ? ((withPhotosCount / totalVisits) * 100).toFixed(1) : '0.0';
    const auditCoverageRate = totalVisits > 0 ? ((auditedVisits / totalVisits) * 100).toFixed(1) : '0.0';
    const passRate = auditedVisits > 0 ? ((passedVisits / auditedVisits) * 100).toFixed(1) : '0.0';
    const fatalRate = auditedVisits > 0 ? ((fatalVisits / auditedVisits) * 100).toFixed(1) : '0.0';
    const strikesPerVisit = totalVisits > 0 ? (fatalVisits / totalVisits).toFixed(2) : '0.00';

    return {
      totalVisits,
      auditedVisits,
      passedVisits,
      fatalVisits,
      withPhotosCount,
      noPhotosCount,
      blankPhotosCount,
      photoUploadRate,
      auditCoverageRate,
      passRate,
      fatalRate,
      strikesPerVisit,
      feCount: uniqueFEs.size,
      cityCount: uniqueCities.size,
      amCount: uniqueAMs.size,
      rmCount: uniqueRMs.size
    };
  }, [filteredTasks]);

  // 6. Tab 1: Date-Wise Aggregation
  const dateWiseData = useMemo(() => {
    const map = new Map();

    filteredTasks.forEach(t => {
      const d = t.cleanDate || 'Unknown Date';
      if (!map.has(d)) {
        map.set(d, {
          date: d,
          total: 0,
          withImages: 0,
          noImages: 0,
          blankImages: 0,
          audited: 0,
          passed: 0,
          fatal: 0,
          feSet: new Set()
        });
      }
      const entry = map.get(d);
      entry.total++;
      if (t.hasUploadedImages) entry.withImages++;
      if (t.isNoImagesUploaded) entry.noImages++;
      if (t.isBlankOrFraudulent) entry.blankImages++;
      if (t.feName || t.feCode) entry.feSet.add(t.feName || t.feCode);

      if (t.auditStatus === 'PASSED') {
        entry.audited++;
        entry.passed++;
      } else if (t.auditStatus === 'FATAL') {
        entry.audited++;
        entry.fatal++;
      }
    });

    return Array.from(map.values())
      .map(item => ({
        ...item,
        uploadRate: item.total > 0 ? ((item.withImages / item.total) * 100).toFixed(1) : '0.0',
        coverageRate: item.total > 0 ? ((item.audited / item.total) * 100).toFixed(1) : '0.0',
        passRate: item.audited > 0 ? ((item.passed / item.audited) * 100).toFixed(1) : '0.0',
        fatalRate: item.audited > 0 ? ((item.fatal / item.audited) * 100).toFixed(1) : '0.0',
        strikesPerVisit: item.total > 0 ? (item.fatal / item.total).toFixed(2) : '0.00',
        feCount: item.feSet.size
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredTasks]);

  // 7. Tab 2: City / Facility Matrix Aggregation
  const cityMatrixData = useMemo(() => {
    const map = new Map();

    filteredTasks.forEach(t => {
      const c = t.city || 'Unknown City';
      if (!map.has(c)) {
        map.set(c, {
          city: c,
          zoneSet: new Set(),
          total: 0,
          withImages: 0,
          noImages: 0,
          blankImages: 0,
          audited: 0,
          passed: 0,
          fatal: 0,
          replacements: 0,
          feSet: new Set(),
          amSet: new Set(),
          rmSet: new Set()
        });
      }
      const entry = map.get(c);
      entry.total++;
      if (t.zone) entry.zoneSet.add(t.zone);
      if (t.hasUploadedImages) entry.withImages++;
      if (t.isNoImagesUploaded) entry.noImages++;
      if (t.isBlankOrFraudulent) entry.blankImages++;
      if (t.feName || t.feCode) entry.feSet.add(t.feName || t.feCode);
      if (t.amName && !isGenericManagerName(t.amName)) entry.amSet.add(t.amName);
      if (t.rmName && !isGenericManagerName(t.rmName)) entry.rmSet.add(t.rmName);
      if (Array.isArray(t.replacements)) entry.replacements += t.replacements.length;

      if (t.auditStatus === 'PASSED') {
        entry.audited++;
        entry.passed++;
      } else if (t.auditStatus === 'FATAL') {
        entry.audited++;
        entry.fatal++;
      }
    });

    return Array.from(map.values())
      .map(item => ({
        ...item,
        zone: Array.from(item.zoneSet).join(', ') || 'Central Zone',
        amList: Array.from(item.amSet).join(', ') || 'Unassigned AM',
        rmList: Array.from(item.rmSet).join(', ') || 'Central RM',
        uploadRate: item.total > 0 ? ((item.withImages / item.total) * 100).toFixed(1) : '0.0',
        passRate: item.audited > 0 ? ((item.passed / item.audited) * 100).toFixed(1) : '0.0',
        fatalRate: item.audited > 0 ? ((item.fatal / item.audited) * 100).toFixed(1) : '0.0',
        strikesPerVisit: item.total > 0 ? (item.fatal / item.total).toFixed(2) : '0.00',
        feCount: item.feSet.size,
        amCount: item.amSet.size,
        rmCount: item.rmSet.size
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredTasks]);

  // Dedicated AM Level Performance Rollup
  const amLevelData = useMemo(() => {
    const map = new Map();

    filteredTasks.forEach(t => {
      const amKey = (t.amName || 'Unassigned AM').trim();
      if (!map.has(amKey)) {
        map.set(amKey, {
          amName: amKey,
          amEmail: t.amEmail || '',
          citySet: new Set(),
          zoneSet: new Set(),
          rmSet: new Set(),
          feSet: new Set(),
          total: 0,
          withImages: 0,
          noImages: 0,
          blankImages: 0,
          audited: 0,
          passed: 0,
          fatal: 0,
          replacements: 0
        });
      }
      const entry = map.get(amKey);
      entry.total++;
      if (t.city) entry.citySet.add(t.city);
      if (t.zone) entry.zoneSet.add(t.zone);
      if (t.rmName && !isGenericManagerName(t.rmName)) entry.rmSet.add(t.rmName);
      if (t.feName || t.feCode) entry.feSet.add(t.feName || t.feCode);
      if (t.hasUploadedImages) entry.withImages++;
      if (t.isNoImagesUploaded) entry.noImages++;
      if (t.isBlankOrFraudulent) entry.blankImages++;
      if (Array.isArray(t.replacements)) entry.replacements += t.replacements.length;

      if (t.auditStatus === 'PASSED') {
        entry.audited++;
        entry.passed++;
      } else if (t.auditStatus === 'FATAL') {
        entry.audited++;
        entry.fatal++;
      }
    });

    return Array.from(map.values())
      .map(item => {
        const uploadRate = item.total > 0 ? ((item.withImages / item.total) * 100).toFixed(1) : '0.0';
        const passRate = item.audited > 0 ? ((item.passed / item.audited) * 100).toFixed(1) : '0.0';
        const fatalRate = item.audited > 0 ? ((item.fatal / item.audited) * 100).toFixed(1) : '0.0';
        const strikesPerVisit = item.total > 0 ? (item.fatal / item.total).toFixed(2) : '0.00';
        const fatalNum = Number(fatalRate);

        return {
          ...item,
          cityList: Array.from(item.citySet).join(', ') || 'N/A',
          zoneList: Array.from(item.zoneSet).join(', ') || 'Central Zone',
          rmName: Array.from(item.rmSet).join(', ') || 'Central Operations RM',
          feCount: item.feSet.size,
          uploadRate,
          passRate,
          fatalRate,
          strikesPerVisit,
          status: fatalNum <= 10 ? 'EXCELLENT (Pass Rate ≥ 90%)' : fatalNum <= 25 ? 'STABLE (Pass Rate 75-89%)' : 'HIGH FATAL ESCALATION (>25% Fatal)'
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [filteredTasks]);

  // Dedicated RM Level Governance Rollup
  const rmLevelData = useMemo(() => {
    const map = new Map();

    filteredTasks.forEach(t => {
      const rmKey = (t.rmName || 'Unassigned RM').trim();
      if (!map.has(rmKey)) {
        map.set(rmKey, {
          rmName: rmKey,
          rmEmail: t.rmEmail || '',
          zoneSet: new Set(),
          citySet: new Set(),
          amSet: new Set(),
          feSet: new Set(),
          total: 0,
          withImages: 0,
          noImages: 0,
          blankImages: 0,
          audited: 0,
          passed: 0,
          fatal: 0,
          replacements: 0
        });
      }
      const entry = map.get(rmKey);
      entry.total++;
      if (t.zone) entry.zoneSet.add(t.zone);
      if (t.city) entry.citySet.add(t.city);
      if (t.amName && !isGenericManagerName(t.amName)) entry.amSet.add(t.amName);
      if (t.feName || t.feCode) entry.feSet.add(t.feName || t.feCode);
      if (t.hasUploadedImages) entry.withImages++;
      if (t.isNoImagesUploaded) entry.noImages++;
      if (t.isBlankOrFraudulent) entry.blankImages++;
      if (Array.isArray(t.replacements)) entry.replacements += t.replacements.length;

      if (t.auditStatus === 'PASSED') {
        entry.audited++;
        entry.passed++;
      } else if (t.auditStatus === 'FATAL') {
        entry.audited++;
        entry.fatal++;
      }
    });

    return Array.from(map.values())
      .map(item => {
        const uploadRate = item.total > 0 ? ((item.withImages / item.total) * 100).toFixed(1) : '0.0';
        const passRate = item.audited > 0 ? ((item.passed / item.audited) * 100).toFixed(1) : '0.0';
        const fatalRate = item.audited > 0 ? ((item.fatal / item.audited) * 100).toFixed(1) : '0.0';
        const strikesPerVisit = item.total > 0 ? (item.fatal / item.total).toFixed(2) : '0.00';
        const fatalNum = Number(fatalRate);

        return {
          ...item,
          zoneList: Array.from(item.zoneSet).join(', ') || 'Central Zone',
          cityList: Array.from(item.citySet).join(', ') || 'N/A',
          amList: Array.from(item.amSet).join(', ') || 'N/A',
          amCount: item.amSet.size,
          feCount: item.feSet.size,
          uploadRate,
          passRate,
          fatalRate,
          strikesPerVisit,
          governanceStatus: fatalNum <= 15 ? 'STRONG COMPLIANCE (≥85% Pass)' : fatalNum <= 30 ? 'MODERATE GOVERNANCE (70-84% Pass)' : 'CRITICAL REGIONAL REVIEW'
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [filteredTasks]);

  // 8. Tab 3: Hierarchy Rollup (RM & AM)
  const hierarchyData = useMemo(() => {
    const rmMap = new Map();

    filteredTasks.forEach(t => {
      const rmKey = t.rmName || 'Unassigned RM';
      if (!rmMap.has(rmKey)) {
        map.set(rmKey, {
          rmName: rmKey,
          total: 0,
          withImages: 0,
          noImages: 0,
          blankImages: 0,
          audited: 0,
          passed: 0,
          fatal: 0,
          amMap: new Map(),
          feSet: new Set(),
          citySet: new Set()
        });
      }
      const rmEntry = rmMap.get(rmKey);
      rmEntry.total++;
      if (t.hasUploadedImages) rmEntry.withImages++;
      if (t.isNoImagesUploaded) rmEntry.noImages++;
      if (t.isBlankOrFraudulent) rmEntry.blankImages++;
      if (t.feName || t.feCode) rmEntry.feSet.add(t.feName || t.feCode);
      if (t.city) rmEntry.citySet.add(t.city);

      if (t.auditStatus === 'PASSED') {
        rmEntry.audited++;
        rmEntry.passed++;
      } else if (t.auditStatus === 'FATAL') {
        rmEntry.audited++;
        rmEntry.fatal++;
      }

      // Nested AM grouping
      const amKey = t.amName || 'Unassigned AM';
      if (!rmEntry.amMap.has(amKey)) {
        rmEntry.amMap.set(amKey, {
          amName: amKey,
          city: t.city,
          total: 0,
          withImages: 0,
          noImages: 0,
          blankImages: 0,
          audited: 0,
          passed: 0,
          fatal: 0,
          feSet: new Set()
        });
      }
      const amEntry = rmEntry.amMap.get(amKey);
      amEntry.total++;
      if (t.hasUploadedImages) amEntry.withImages++;
      if (t.isNoImagesUploaded) amEntry.noImages++;
      if (t.isBlankOrFraudulent) amEntry.blankImages++;
      if (t.feName || t.feCode) amEntry.feSet.add(t.feName || t.feCode);

      if (t.auditStatus === 'PASSED') {
        amEntry.audited++;
        amEntry.passed++;
      } else if (t.auditStatus === 'FATAL') {
        amEntry.audited++;
        amEntry.fatal++;
      }
    });

    return Array.from(rmMap.values())
      .map(rm => ({
        ...rm,
        uploadRate: rm.total > 0 ? ((rm.withImages / rm.total) * 100).toFixed(1) : '0.0',
        fatalRate: rm.audited > 0 ? ((rm.fatal / rm.audited) * 100).toFixed(1) : '0.0',
        strikesPerVisit: rm.total > 0 ? (rm.fatal / rm.total).toFixed(2) : '0.00',
        feCount: rm.feSet.size,
        cityList: Array.from(rm.citySet).join(', '),
        areaManagers: Array.from(rm.amMap.values()).map(am => ({
          ...am,
          uploadRate: am.total > 0 ? ((am.withImages / am.total) * 100).toFixed(1) : '0.0',
          fatalRate: am.audited > 0 ? ((am.fatal / am.audited) * 100).toFixed(1) : '0.0',
          strikesPerVisit: am.total > 0 ? (am.fatal / am.total).toFixed(2) : '0.00',
          feCount: am.feSet.size
        })).sort((a, b) => b.fatal - a.fatal || b.total - a.total)
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredTasks]);

  // 9. Tab 4: FE Compliance Ledger Aggregation
  const feLedgerData = useMemo(() => {
    const map = new Map();

    filteredTasks.forEach(t => {
      const feKey = (t.feCode || t.feName || 'Unknown FE') + '___' + t.city;
      if (!map.has(feKey)) {
        map.set(feKey, {
          key: feKey,
          name: t.feName || 'Field Executive',
          code: t.feCode || t.feId || 'N/A',
          city: t.city,
          zone: t.zone || 'Central Zone',
          amName: t.amName,
          amEmail: t.amEmail || '',
          rmName: t.rmName,
          rmEmail: t.rmEmail || '',
          total: 0,
          withImages: 0,
          noImages: 0,
          blankImages: 0,
          audited: 0,
          passed: 0,
          fatal: 0,
          replacements: 0,
          dates: new Set()
        });
      }
      const entry = map.get(feKey);
      entry.total++;
      if (t.cleanDate) entry.dates.add(t.cleanDate);
      if (t.hasUploadedImages) entry.withImages++;
      if (t.isNoImagesUploaded) entry.noImages++;
      if (t.isBlankOrFraudulent) entry.blankImages++;
      if (Array.isArray(t.replacements)) entry.replacements += t.replacements.length;

      if (t.auditStatus === 'PASSED') {
        entry.audited++;
        entry.passed++;
      } else if (t.auditStatus === 'FATAL') {
        entry.audited++;
        entry.fatal++;
      }
    });

    return Array.from(map.values())
      .map(item => ({
        ...item,
        uploadRate: item.total > 0 ? ((item.withImages / item.total) * 100).toFixed(1) : '0.0',
        passRate: item.audited > 0 ? Math.round((item.passed / item.audited) * 100) : 100,
        fatalRate: item.audited > 0 ? Math.round((item.fatal / item.audited) * 100) : 0,
        strikesPerVisit: item.total > 0 ? (item.fatal / item.total).toFixed(2) : '0.00',
        dateCount: item.dates.size
      }))
      .sort((a, b) => b.fatal - a.fatal || b.blankImages - a.blankImages || b.total - a.total);
  }, [filteredTasks]);

  // 10. Multi-Sheet Executive Excel Export
  const handleExportExecutiveWorkbook = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Executive KPI Overview & Date Breakdown
    const sheetDateData = dateWiseData.map(d => ({
      'DISPATCH DATE': d.date,
      'TOTAL CUSTOMER VISITS': d.total,
      'VISITS WITH PHOTOS': d.withImages,
      'PHOTO UPLOAD COMPLIANCE %': `${d.uploadRate}%`,
      'ZERO PHOTOS UPLOADED': d.noImages,
      'BLANK / BLACK PHOTOS': d.blankImages,
      'QA AUDITED VISITS': d.audited,
      'PASSED AUDITS': d.passed,
      'FATAL STRIKES': d.fatal,
      'QA PASS RATE %': `${(100 - Number(d.fatalRate)).toFixed(1)}%`,
      'QA FATAL STRIKE RATE %': `${d.fatalRate}%`,
      'STRIKES PER VISIT AVG': d.strikesPerVisit,
      'ACTIVE FES': d.feCount
    }));
    const wsDates = XLSX.utils.json_to_sheet(sheetDateData);
    XLSX.utils.book_append_sheet(wb, wsDates, 'Date_Wise_Summary');

    // Sheet 2: City / Facility Hub Level Scorecard
    const sheetCityData = cityMatrixData.map(c => ({
      'CITY / FACILITY HUB': c.city,
      'ZONE': c.zone,
      'REPORTING AREA MANAGERS': c.amList,
      'SUPERVISING REGIONAL MANAGERS': c.rmList,
      'TOTAL CUSTOMER VISITS': c.total,
      'PHOTOS UPLOADED': c.withImages,
      'PHOTO COMPLIANCE %': `${c.uploadRate}%`,
      'ZERO PHOTOS UPLOADED': c.noImages,
      'BLANK / BLACK PHOTOS': c.blankImages,
      'QA AUDITED VISITS': c.audited,
      'PASSED AUDITS': c.passed,
      'FATAL STRIKES': c.fatal,
      'QA PASS RATE %': `${c.passRate}%`,
      'QA FATAL RATE %': `${c.fatalRate}%`,
      'STRIKES PER VISIT AVG': c.strikesPerVisit,
      'ACTIVE FIELD EXECUTIVES': c.feCount,
      'EQUIPMENT REPLACEMENTS ORDERED': c.replacements || 0,
      'CITY COMPLIANCE STATUS': Number(c.fatalRate) <= 15 ? 'HEALTHY' : Number(c.fatalRate) <= 30 ? 'ELEVATED RISK' : 'CRITICAL ACTION REQUIRED'
    }));
    const wsCity = XLSX.utils.json_to_sheet(sheetCityData);
    XLSX.utils.book_append_sheet(wb, wsCity, 'City_Level_Summary');

    // Sheet 3: Area Manager (AM) Level Scorecard
    const sheetAMData = amLevelData.map(a => ({
      'AREA MANAGER (AM)': a.amName,
      'AM CORPORATE EMAIL': a.amEmail,
      'HUBS & CITIES MANAGED': a.cityList,
      'PRIMARY ZONE': a.zoneList,
      'SUPERVISING REGIONAL MANAGER': a.rmName,
      'SUPERVISED FES COUNT': a.feCount,
      'TOTAL CUSTOMER VISITS': a.total,
      'VISITS WITH PHOTOS': a.withImages,
      'PHOTO UPLOAD COMPLIANCE %': `${a.uploadRate}%`,
      'ZERO PHOTO VISITS': a.noImages,
      'BLANK / FRAUDULENT PHOTOS': a.blankImages,
      'QA AUDITED VISITS': a.audited,
      'PASSED AUDITS': a.passed,
      'FATAL STRIKES': a.fatal,
      'QA PASS RATE %': `${a.passRate}%`,
      'FATAL STRIKE RATE %': `${a.fatalRate}%`,
      'STRIKES PER VISIT AVG': a.strikesPerVisit,
      'EQUIPMENT REPLACEMENTS ORDERED': a.replacements || 0,
      'AM PERFORMANCE TIER': a.status
    }));
    const wsAM = XLSX.utils.json_to_sheet(sheetAMData);
    XLSX.utils.book_append_sheet(wb, wsAM, 'AM_Level_Summary');

    // Sheet 4: Regional Manager (RM) Level Scorecard
    const sheetRMData = rmLevelData.map(r => ({
      'REGIONAL MANAGER (RM)': r.rmName,
      'RM CORPORATE EMAIL': r.rmEmail,
      'OPERATIONAL REGION / ZONE': r.zoneList,
      'COVERED HUBS & CITIES': r.cityList,
      'SUBORDINATE AREA MANAGERS': r.amList,
      'AREA MANAGERS COUNT': r.amCount,
      'TOTAL FIELD EXECUTIVES': r.feCount,
      'TOTAL REGIONAL VISITS': r.total,
      'VISITS WITH PHOTOS': r.withImages,
      'REGIONAL PHOTO UPLOAD %': `${r.uploadRate}%`,
      'ZERO PHOTO VISITS': r.noImages,
      'BLANK / BLACK PHOTO VISITS': r.blankImages,
      'QA AUDITED VISITS': r.audited,
      'PASSED AUDITS': r.passed,
      'FATAL STRIKES': r.fatal,
      'REGIONAL QA PASS RATE %': `${r.passRate}%`,
      'REGIONAL FATAL RATE %': `${r.fatalRate}%`,
      'STRIKES PER VISIT AVG': r.strikesPerVisit,
      'REGIONAL REPLACEMENTS ORDERED': r.replacements || 0,
      'REGIONAL GOVERNANCE STATUS': r.governanceStatus
    }));
    const wsRM = XLSX.utils.json_to_sheet(sheetRMData);
    XLSX.utils.book_append_sheet(wb, wsRM, 'RM_Level_Summary');

    // Sheet 5: FE Compliance Ledger
    const sheetFEData = feLedgerData.map(f => ({
      'FE NAME': f.name,
      'RIDER CODE': f.code,
      'CITY / HUB': f.city,
      'ZONE': f.zone,
      'REPORTING AM': f.amName,
      'AM EMAIL': f.amEmail,
      'REGIONAL RM': f.rmName,
      'RM EMAIL': f.rmEmail,
      'TOTAL VISITS': f.total,
      'PHOTOS UPLOADED': f.withImages,
      'PHOTO UPLOAD %': `${f.uploadRate}%`,
      'ZERO PHOTOS UPLOADED': f.noImages,
      'BLANK / BLACK PHOTOS': f.blankImages,
      'AUDITED BY QA': f.audited,
      'PASSED AUDITS': f.passed,
      'FATAL STRIKES': f.fatal,
      'QA PASS RATE %': `${f.passRate}%`,
      'QA FATAL RATE %': `${f.fatalRate}%`,
      'STRIKES PER VISIT AVG': f.strikesPerVisit,
      'TOOL REPLACEMENTS ORDERED': f.replacements || 0,
      'COMPLIANCE STATUS': f.fatal === 0 ? 'CLEAN (0 Strikes)' : f.fatal === 1 ? 'WARNING (1 Strike)' : 'ACTION REQUIRED (2+ Strikes)'
    }));
    const wsFE = XLSX.utils.json_to_sheet(sheetFEData);
    XLSX.utils.book_append_sheet(wb, wsFE, 'FE_Compliance_Ledger');

    // Sheet 6: Filtered Raw Tasks
    const sheetTaskData = filteredTasks.slice(0, 10000).map(t => ({
      'TASK ID': t.taskId || t.id,
      'DISPATCH DATE': t.cleanDate,
      'CITY / HUB': t.city,
      'ZONE': t.zone,
      'FE NAME': t.feName,
      'FE CODE': t.feCode,
      'REPORTING AM': t.amName,
      'AM EMAIL': t.amEmail,
      'REGIONAL RM': t.rmName,
      'RM EMAIL': t.rmEmail,
      'DISPATCH STATUS': t.status,
      'AUDIT STATUS': t.auditStatus || 'PENDING',
      'PHOTOS ATTACHED': t.hasUploadedImages ? 'YES' : 'NO',
      'BLANK / BLACK PHOTO': t.isBlankOrFraudulent ? 'YES' : 'NO',
      'IMAGE COUNT': t.imageCount || 0,
      'FAILED REASONS': Array.isArray(t.failedReasons) ? t.failedReasons.join('; ') : (t.failedReasons || ''),
      'AUDITOR REMARKS': t.remarks || t.auditorRemarks || '',
      'AUDITED BY': t.auditedBy || '',
      'REPLACEMENTS ORDERED': (t.replacements || []).map(r => r.name || r.itemName).filter(Boolean).join('; ')
    }));
    const wsTasks = XLSX.utils.json_to_sheet(sheetTaskData);
    XLSX.utils.book_append_sheet(wb, wsTasks, 'Task_Inspector');

    const fileName = `Executive_Leadership_Audit_Summary_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Pagination for Task Inspector
  const paginatedTasks = useMemo(() => {
    const start = (taskPage - 1) * tasksPerPage;
    return filteredTasks.slice(start, start + tasksPerPage);
  }, [filteredTasks, taskPage]);

  const totalTaskPages = Math.ceil(filteredTasks.length / tasksPerPage) || 1;

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      
      {/* Executive Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-800/40 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-sky-400 border border-indigo-400/40 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
              <LayoutDashboard className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  GM & BH Executive Command
                </span>
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-sky-400" />
                  National Quality Compliance, Image Integrity & Strike Analytics
                </span>
              </div>
              <h1 className="text-xl font-black text-white mt-1">
                Executive Leadership Overview & Visual Analytics
              </h1>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleExportExecutiveWorkbook}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 border border-indigo-400/30 flex items-center gap-2 transition-all cursor-pointer"
              title="Download 6-sheet Executive Excel breakdown (Date, City, AM, RM, FE Ledger & Tasks)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Executive Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Multi-Dimensional Filter Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Multi-Dimensional Control Filters</span>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500 text-white shadow-sm">
                {activeFilterCount} active
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={resetAllFilters}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          
          {/* Date Filter */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">Dispatch Date</span>
            <select
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setTaskPage(1); }}
              className="w-full bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Dates (1 Nov - Now)</option>
              {availableDates.map(d => (
                <option key={d} value={d} className="bg-slate-900">{d}</option>
              ))}
            </select>
          </div>

          {/* City / Hub Filter */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">City / Facility Hub</span>
            <select
              value={selectedCity}
              onChange={(e) => { setSelectedCity(e.target.value); setTaskPage(1); }}
              className="w-full bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Cities ({availableCities.length})</option>
              {availableCities.map(c => (
                <option key={c} value={c} className="bg-slate-900">{c}</option>
              ))}
            </select>
          </div>

          {/* RM Filter */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">Regional RM</span>
            <select
              value={selectedRmFilter}
              onChange={(e) => { setSelectedRmFilter(e.target.value); setSelectedAmFilter('ALL'); setTaskPage(1); }}
              className="w-full bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Regions</option>
              {allRegionalManagers.map(rm => (
                <option key={rm.id || rm.email || rm.full_name} value={rm.full_name || rm.email} className="bg-slate-900">
                  {rm.full_name || rm.email}
                </option>
              ))}
            </select>
          </div>

          {/* AM Filter */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">Area AM</span>
            <select
              value={selectedAmFilter}
              onChange={(e) => { setSelectedAmFilter(e.target.value); setTaskPage(1); }}
              className="w-full bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Area Managers</option>
              {scopedAreaManagers.map(am => (
                <option key={am.id || am.email || am.full_name} value={am.full_name || am.email} className="bg-slate-900">
                  {am.full_name || am.email} ({am.facility_code || am.city || 'Hub'})
                </option>
              ))}
            </select>
          </div>

          {/* Audit Status Filter */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">QA Audit Status</span>
            <select
              value={selectedAuditStatus}
              onChange={(e) => { setSelectedAuditStatus(e.target.value); setTaskPage(1); }}
              className="w-full bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Audit Statuses</option>
              <option value="PASSED" className="bg-slate-900">Passed by QA</option>
              <option value="FATAL" className="bg-slate-900">Fatal Strike Incurred</option>
              <option value="PENDING" className="bg-slate-900">Pending QA Inspection</option>
            </select>
          </div>

          {/* Image Upload Status Filter */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
            <span className="text-[10px] font-bold text-slate-400 block mb-1">Image Integrity</span>
            <select
              value={selectedImageStatus}
              onChange={(e) => { setSelectedImageStatus(e.target.value); setTaskPage(1); }}
              className="w-full bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">All Image Statuses</option>
              <option value="WITH_IMAGES" className="bg-slate-900">Valid Photos Uploaded</option>
              <option value="NO_IMAGES" className="bg-slate-900">Zero Photos Uploaded</option>
              <option value="BLANK_IMAGES" className="bg-slate-900">Blank / Black Photos Flagged</option>
            </select>
          </div>

        </div>

        {/* Search Input Bar */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setTaskPage(1); }}
            placeholder="Search by Task ID, FE Name, Rider Code, City, or Customer..."
            className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-white text-xs ml-2 cursor-pointer">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* High-Impact Executive KPI Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        
        {/* Total Dispatches */}
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Customer Visits</div>
          <div className="text-2xl font-black text-white mt-1">{summaryKPIs.totalVisits}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Across {summaryKPIs.cityCount} cities & {summaryKPIs.feCount} FEs
          </div>
        </div>

        {/* Photo Upload Compliance */}
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-lg">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Photo Upload %</div>
          <div className={`text-2xl font-black mt-1 ${
            Number(summaryKPIs.photoUploadRate) >= 80 ? 'text-emerald-400' :
            Number(summaryKPIs.photoUploadRate) >= 50 ? 'text-amber-400' : 'text-red-400'
          }`}>
            {summaryKPIs.photoUploadRate}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {summaryKPIs.withPhotosCount} of {summaryKPIs.totalVisits} with photos
          </div>
        </div>

        {/* Missing & Blank Photos */}
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-lg">
          <div className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">Missing / Blank Photos</div>
          <div className="text-2xl font-black text-rose-400 mt-1">
            {summaryKPIs.noPhotosCount + summaryKPIs.blankPhotosCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {summaryKPIs.noPhotosCount} zero uploads &bull; {summaryKPIs.blankPhotosCount} blank
          </div>
        </div>

        {/* QA Audited Coverage */}
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-lg">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">QA Audited Visits</div>
          <div className="text-2xl font-black text-sky-400 mt-1">{summaryKPIs.auditedVisits}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {summaryKPIs.auditCoverageRate}% QA inspection coverage
          </div>
        </div>

        {/* Fatal Strikes & QA Strike Rate */}
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-lg">
          <div className="text-[10px] uppercase font-bold text-red-400 tracking-wider">Fatal Rate (QA)</div>
          <div className={`text-2xl font-black mt-1 ${
            Number(summaryKPIs.fatalRate) > 10 ? 'text-red-400' :
            Number(summaryKPIs.fatalRate) > 5 ? 'text-amber-400' : 'text-emerald-400'
          }`}>
            {summaryKPIs.fatalRate}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {summaryKPIs.fatalVisits} strikes logged by auditors
          </div>
        </div>

        {/* Overall Strikes Per Visit Avg */}
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-lg">
          <div className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">Avg Strikes / Visit</div>
          <div className="text-2xl font-black text-amber-300 font-mono mt-1">
            {summaryKPIs.strikesPerVisit}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Overall dispatch strike average
          </div>
        </div>

      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        
        <button
          onClick={() => setActiveTab('dateWise')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'dateWise'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Date-Wise Trend ({dateWiseData.length} Days)</span>
        </button>

        <button
          onClick={() => setActiveTab('cityMatrix')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'cityMatrix'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>City / Hub Matrix ({cityMatrixData.length} Cities)</span>
        </button>

        <button
          onClick={() => setActiveTab('hierarchy')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'hierarchy'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Leadership Hierarchy (RM & AM)</span>
        </button>

        <button
          onClick={() => setActiveTab('feLedger')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'feLedger'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/25'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>FE Compliance Ledger ({feLedgerData.length} FEs)</span>
        </button>

        <button
          onClick={() => setActiveTab('taskInspector')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'taskInspector'
              ? 'bg-slate-700 text-white shadow-lg shadow-slate-700/25'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>Task-Level Inspector ({filteredTasks.length} Visits)</span>
        </button>

      </div>

      {/* TAB 1: DATE-WISE COMPLIANCE & STRIKE TRENDS */}
      {activeTab === 'dateWise' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                  <span>Daily Dispatch Volumes, Photo Compliance & Fatal Strike Rates</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Track day-over-day SOP adherence, QA coverage, and blank photo uploads. Click any date to lock filters.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-850 text-slate-400 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <th className="py-3 px-4">Dispatch Date</th>
                    <th className="py-3 px-3 text-center">Customer Visits</th>
                    <th className="py-3 px-3 text-center">Photos Uploaded %</th>
                    <th className="py-3 px-3 text-center">QA Audited Visits</th>
                    <th className="py-3 px-3 text-center">Passed Audits</th>
                    <th className="py-3 px-3 text-center">Fatal Strikes</th>
                    <th className="py-3 px-3 text-center">QA Fatal Rate %</th>
                    <th className="py-3 px-3 text-center">Strikes / Visit</th>
                    <th className="py-3 px-3 text-center">Zero / Blank Photos</th>
                    <th className="py-3 px-3 text-center">Active FEs</th>
                    <th className="py-3 px-4 text-right">Quick Filter</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {dateWiseData.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        No task records match current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    dateWiseData.map(d => (
                      <tr key={d.date} className="hover:bg-slate-850/60 transition-colors">
                        
                        {/* Date */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 font-mono font-bold text-white text-xs">
                            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{d.date}</span>
                          </div>
                        </td>

                        {/* Total Visits */}
                        <td className="py-3.5 px-3 text-center font-bold text-white">
                          {d.total}
                        </td>

                        {/* Photo Upload % */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <div className={`font-bold ${
                            Number(d.uploadRate) >= 80 ? 'text-emerald-400' :
                            Number(d.uploadRate) >= 50 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {d.uploadRate}%
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {d.withImages}/{d.total} visits
                          </div>
                        </td>

                        {/* QA Audited Visits */}
                        <td className="py-3.5 px-3 text-center font-bold text-sky-400">
                          <div>{d.audited}</div>
                          <div className="text-[10px] text-slate-500 font-normal">
                            ({d.coverageRate}% cov.)
                          </div>
                        </td>

                        {/* Passed */}
                        <td className="py-3.5 px-3 text-center font-bold text-emerald-400">
                          {d.passed}
                        </td>

                        {/* Fatal Strikes */}
                        <td className="py-3.5 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-black ${
                            d.fatal > 0 ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'text-emerald-400'
                          }`}>
                            {d.fatal}
                          </span>
                        </td>

                        {/* QA Fatal Strike Rate % */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <div className={`font-bold text-xs ${
                            Number(d.fatalRate) > 10 ? 'text-red-400' :
                            Number(d.fatalRate) > 5 ? 'text-amber-400' : 'text-emerald-400'
                          }`}>
                            {d.fatalRate}%
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono">
                            {d.fatal}/{d.audited} audited
                          </div>
                        </td>

                        {/* Strikes / Visit Avg */}
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-amber-300">
                          {d.strikesPerVisit}
                        </td>

                        {/* Missing / Blank Photos */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            (d.noImages + d.blankImages) > 0 ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20' : 'text-slate-500'
                          }`}>
                            {d.noImages + d.blankImages} ({d.noImages} none / {d.blankImages} blank)
                          </span>
                        </td>

                        {/* Active FEs */}
                        <td className="py-3.5 px-3 text-center font-bold text-slate-300">
                          {d.feCount}
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => {
                              setSelectedDate(d.date);
                              setActiveTab('cityMatrix');
                            }}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          >
                            Filter Date
                          </button>
                        </td>

                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CITY / HUB MATRIX */}
      {activeTab === 'cityMatrix' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <span>City / Facility Quality & Image Compliance Matrix</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Complete comparative scorecard across all operational hubs. Click any city to isolate its field staff.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-850 text-slate-400 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <th className="py-3 px-4">City / Facility Hub</th>
                    <th className="py-3 px-3 text-center">Customer Visits</th>
                    <th className="py-3 px-3 text-center">Photo Upload %</th>
                    <th className="py-3 px-3 text-center">QA Audited</th>
                    <th className="py-3 px-3 text-center">Passed</th>
                    <th className="py-3 px-3 text-center">Fatal Strikes</th>
                    <th className="py-3 px-3 text-center">QA Fatal Rate %</th>
                    <th className="py-3 px-3 text-center">Strikes / Visit</th>
                    <th className="py-3 px-3 text-center">Missing / Blank Photos</th>
                    <th className="py-3 px-3 text-center">FEs / AMs</th>
                    <th className="py-3 px-4 text-right">Quick Filter</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {cityMatrixData.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        No cities found matching current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    cityMatrixData.map(c => (
                      <tr key={c.city} className="hover:bg-slate-850/60 transition-colors">
                        
                        {/* City Name */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span className="font-bold text-white text-xs">{c.city}</span>
                          </div>
                        </td>

                        {/* Customer Visits */}
                        <td className="py-3.5 px-3 text-center font-bold text-white">
                          {c.total}
                        </td>

                        {/* Photo Upload % */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <div className={`font-bold ${
                            Number(c.uploadRate) >= 80 ? 'text-emerald-400' :
                            Number(c.uploadRate) >= 50 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {c.uploadRate}%
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {c.withImages}/{c.total} visits
                          </div>
                        </td>

                        {/* Audited */}
                        <td className="py-3.5 px-3 text-center font-bold text-sky-400">
                          {c.audited}
                        </td>

                        {/* Passed */}
                        <td className="py-3.5 px-3 text-center font-bold text-emerald-400">
                          {c.passed}
                        </td>

                        {/* Fatal Strikes */}
                        <td className="py-3.5 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-black ${
                            c.fatal > 0 ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'text-emerald-400'
                          }`}>
                            {c.fatal}
                          </span>
                        </td>

                        {/* QA Fatal Rate % */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <div className={`font-bold text-xs ${
                            Number(c.fatalRate) > 10 ? 'text-red-400' :
                            Number(c.fatalRate) > 5 ? 'text-amber-400' : 'text-emerald-400'
                          }`}>
                            {c.fatalRate}%
                          </div>
                        </td>

                        {/* Strikes / Visit */}
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-amber-300">
                          {c.strikesPerVisit}
                        </td>

                        {/* Missing / Blank */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/20">
                            {c.noImages + c.blankImages} ({c.noImages} none / {c.blankImages} blank)
                          </span>
                        </td>

                        {/* Team Sizes */}
                        <td className="py-3.5 px-3 text-center text-slate-300">
                          {c.feCount} FEs &bull; {c.amCount} AMs
                        </td>

                        {/* Filter Action */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => {
                              setSelectedCity(c.city);
                              setActiveTab('feLedger');
                            }}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          >
                            Filter City
                          </button>
                        </td>

                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LEADERSHIP HIERARCHY (RM & AM BREAKDOWN) */}
      {activeTab === 'hierarchy' && (
        <div className="space-y-4">
          {hierarchyData.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl">
              No regional or area managers found matching current filter scope.
            </div>
          ) : (
            hierarchyData.map(rm => (
              <div key={rm.rmName} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                
                {/* RM Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-600/20 text-violet-300 border border-violet-500/30 flex items-center justify-center font-black text-sm">
                      RM
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-extrabold text-white">{rm.rmName}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 font-bold border border-violet-500/20">
                          Regional Manager
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Covers {rm.feCount} FEs across: <strong className="text-slate-300">{rm.cityList || 'Hubs'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* RM High-Level Metrics */}
                  <div className="flex items-center gap-3 text-xs">
                    <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Total Visits</span>
                      <span className="font-extrabold text-white text-sm">{rm.total}</span>
                    </div>

                    <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Photo Upload %</span>
                      <span className="font-extrabold text-sky-400 text-sm">{rm.uploadRate}%</span>
                    </div>

                    <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Fatal Strikes</span>
                      <span className="font-extrabold text-red-400 text-sm">{rm.fatal}</span>
                    </div>

                    <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Fatal Rate</span>
                      <span className="font-extrabold text-amber-300 text-sm">{rm.fatalRate}%</span>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedRmFilter(rm.rmName);
                        setActiveTab('feLedger');
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white transition-colors cursor-pointer"
                    >
                      Filter RM
                    </button>
                  </div>
                </div>

                {/* Subordinate Area Managers Table */}
                <div>
                  <div className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>Area Managers (AM) reporting under {rm.rmName}</span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-800/80">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-950 text-slate-400 font-semibold uppercase text-[10px]">
                          <th className="py-2.5 px-3">Area Manager (AM)</th>
                          <th className="py-2.5 px-3">Hub / Location</th>
                          <th className="py-2.5 px-3 text-center">Team FEs</th>
                          <th className="py-2.5 px-3 text-center">Total Visits</th>
                          <th className="py-2.5 px-3 text-center">Photo Upload %</th>
                          <th className="py-2.5 px-3 text-center">Fatal Strikes</th>
                          <th className="py-2.5 px-3 text-center">QA Fatal Rate %</th>
                          <th className="py-2.5 px-3 text-center">Strikes / Visit</th>
                          <th className="py-2.5 px-3 text-center">Missing/Blank Photos</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-900/60 text-slate-200">
                        {rm.areaManagers.map(am => (
                          <tr key={am.amName} className="hover:bg-slate-850/40">
                            <td className="py-2.5 px-3 font-bold text-white">{am.amName}</td>
                            <td className="py-2.5 px-3 text-slate-300">{am.city}</td>
                            <td className="py-2.5 px-3 text-center font-semibold">{am.feCount}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-white">{am.total}</td>
                            <td className="py-2.5 px-3 text-center font-semibold text-sky-400">{am.uploadRate}%</td>
                            <td className="py-2.5 px-3 text-center font-black text-red-400">{am.fatal}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-amber-300">{am.fatalRate}%</td>
                            <td className="py-2.5 px-3 text-center font-mono">{am.strikesPerVisit}</td>
                            <td className="py-2.5 px-3 text-center text-rose-300 font-semibold">
                              {am.noImages + am.blankImages}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => {
                                  setSelectedAmFilter(am.amName);
                                  setActiveTab('feLedger');
                                }}
                                className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 cursor-pointer"
                              >
                                View FEs
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 4: FE COMPLIANCE LEDGER */}
      {activeTab === 'feLedger' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>Field Executive (FE) Complete Quality & Non-Compliance Ledger</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Individual compliance scorecard: Total visits, photo upload adherence, QA fatal strike rate, and average strikes per visit.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-850 text-slate-400 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <th className="py-3 px-4">Field Executive</th>
                    <th className="py-3 px-3">City / Hub</th>
                    <th className="py-3 px-3">Reporting AM</th>
                    <th className="py-3 px-3 text-center">Customer Visits</th>
                    <th className="py-3 px-3 text-center">Photo Upload %</th>
                    <th className="py-3 px-3 text-center">QA Audited</th>
                    <th className="py-3 px-3 text-center">Passed</th>
                    <th className="py-3 px-3 text-center">Fatal Strikes</th>
                    <th className="py-3 px-3 text-center">QA Fatal Rate %</th>
                    <th className="py-3 px-3 text-center">Strikes / Visit</th>
                    <th className="py-3 px-3 text-center">Zero / Blank Photos</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {feLedgerData.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-slate-400">
                        No Field Executives match current filter selection.
                      </td>
                    </tr>
                  ) : (
                    feLedgerData.map(fe => (
                      <tr key={fe.key} className="hover:bg-slate-850/60 transition-colors">
                        
                        {/* FE Identity */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-white text-xs">{fe.name}</div>
                          <div className="text-[10px] text-sky-400 font-mono">[{fe.code}]</div>
                        </td>

                        {/* City */}
                        <td className="py-3 px-3 font-medium text-slate-300 whitespace-nowrap">
                          {fe.city}
                        </td>

                        {/* AM */}
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                          <div className="font-semibold text-slate-200">{fe.amName}</div>
                          <div className="text-[9px] text-slate-500">RM: {fe.rmName}</div>
                        </td>

                        {/* Total Visits */}
                        <td className="py-3 px-3 text-center font-bold text-white">
                          {fe.total}
                        </td>

                        {/* Photo Upload % */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className={`font-bold ${
                            Number(fe.uploadRate) >= 80 ? 'text-emerald-400' :
                            Number(fe.uploadRate) >= 50 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {fe.uploadRate}%
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono">
                            {fe.withImages}/{fe.total}
                          </div>
                        </td>

                        {/* QA Audited */}
                        <td className="py-3 px-3 text-center font-bold text-sky-400">
                          {fe.audited}
                        </td>

                        {/* Passed */}
                        <td className="py-3 px-3 text-center font-bold text-emerald-400">
                          {fe.passed}
                        </td>

                        {/* Fatal Strikes */}
                        <td className="py-3 px-3 text-center">
                          {fe.fatal === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              0 Clean
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500/20 text-red-300 border border-red-500/40">
                              {fe.fatal} Strikes
                            </span>
                          )}
                        </td>

                        {/* QA Fatal Rate % */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className={`font-bold ${
                            fe.fatalRate > 10 ? 'text-red-400' :
                            fe.fatalRate > 5 ? 'text-amber-400' : 'text-emerald-400'
                          }`}>
                            {fe.fatalRate}%
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono">
                            {fe.fatal}/{fe.audited} aud.
                          </div>
                        </td>

                        {/* Strikes / Visit */}
                        <td className="py-3 px-3 text-center font-mono font-bold text-amber-300">
                          {fe.strikesPerVisit}
                        </td>

                        {/* Zero / Blank Photos */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {(fe.noImages + fe.blankImages) > 0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              {fe.noImages + fe.blankImages} ({fe.noImages} none / {fe.blankImages} blank)
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[10px]">None</span>
                          )}
                        </td>

                        {/* Action */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => {
                              if (onFilterFE) onFilterFE(fe.code || fe.name);
                              else if (onNavigate) onNavigate('audits');
                            }}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                          >
                            View Audits
                          </button>
                        </td>

                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: TASK-LEVEL INSPECTOR */}
      {activeTab === 'taskInspector' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-slate-400" />
                  <span>Granular Task Inspection Ledger</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Showing {filteredTasks.length} customer visits matching active filters.
                </p>
              </div>

              {/* Pagination controls */}
              <div className="flex items-center gap-2 text-xs">
                <button
                  disabled={taskPage === 1}
                  onClick={() => setTaskPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Prev
                </button>
                <span className="text-slate-400 text-xs">
                  Page <strong className="text-white">{taskPage}</strong> of {totalTaskPages}
                </span>
                <button
                  disabled={taskPage >= totalTaskPages}
                  onClick={() => setTaskPage(p => p + 1)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-850 text-slate-400 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <th className="py-3 px-4">Task ID</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">City / Hub</th>
                    <th className="py-3 px-3">Field Executive</th>
                    <th className="py-3 px-3">Reporting AM / RM</th>
                    <th className="py-3 px-3 text-center">Audit Status</th>
                    <th className="py-3 px-3 text-center">Photo Status</th>
                    <th className="py-3 px-4">Failure Reasons / Remarks</th>
                    <th className="py-3 px-3">Auditor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {paginatedTasks.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        No tasks found matching current filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedTasks.map(t => (
                      <tr key={t.id || t.taskId} className="hover:bg-slate-850/60 transition-colors">
                        
                        {/* Task ID */}
                        <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-sky-400 text-xs">
                          #{t.taskId || t.id}
                        </td>

                        {/* Date */}
                        <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-300">
                          {t.cleanDate}
                        </td>

                        {/* City */}
                        <td className="py-3 px-3 whitespace-nowrap font-semibold text-white">
                          {t.city}
                        </td>

                        {/* FE */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-bold text-white">{t.feName || 'Unknown'}</div>
                          <div className="text-[10px] text-slate-400 font-mono">[{t.feCode || 'FE'}]</div>
                        </td>

                        {/* Managers */}
                        <td className="py-3 px-3 whitespace-nowrap text-[11px] text-slate-400">
                          <div>AM: <strong className="text-slate-300">{t.amName}</strong></div>
                          <div>RM: <strong className="text-slate-300">{t.rmName}</strong></div>
                        </td>

                        {/* Audit Status */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {t.auditStatus === 'PASSED' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              PASSED
                            </span>
                          ) : t.auditStatus === 'FATAL' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500/20 text-red-300 border border-red-500/40">
                              FATAL STRIKE
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                              PENDING
                            </span>
                          )}
                        </td>

                        {/* Photo Status */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {t.isNoImagesUploaded ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950/60 text-red-400 border border-red-800/60">
                              Zero Uploaded
                            </span>
                          ) : t.isBlankOrFraudulent ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/60 text-rose-300 border border-rose-800/60">
                              Blank / Black Photo
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/50 text-emerald-400 border border-emerald-800/50">
                              {t.imageCount || 'Valid'} Photos
                            </span>
                          )}
                        </td>

                        {/* Reasons / Remarks */}
                        <td className="py-3 px-4 max-w-xs truncate text-[11px] text-slate-300" title={t.remarks || (Array.isArray(t.failedReasons) ? t.failedReasons.join('; ') : '')}>
                          {t.remarks || (Array.isArray(t.failedReasons) ? t.failedReasons.join('; ') : (t.failedReasons || '—'))}
                        </td>

                        {/* Auditor */}
                        <td className="py-3 px-3 whitespace-nowrap text-[11px] text-slate-400">
                          {t.auditedBy || '—'}
                        </td>

                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
