import React, { useState, useMemo, useEffect } from "react";
import { 
  ArrowLeft, 
  ExternalLink, 
  Database, 
  Search, 
  User, 
  Tag, 
  Info,
  Layers,
  FileText,
  BookmarkCheck,
  Hash,
  RefreshCw,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";
import { motion } from "motion/react";

interface AssignmentGroup {
  display_value: string;
  link?: string;
}

interface CatItem {
  display_value: string;
  link?: string;
}

interface RequestItem {
  number: string;
  state?: string;
  cat_item?: CatItem;
}

interface Variables {
  type: string;
  application?: string;
  billing_model?: string;
}

interface SnowRecord {
  short_description: string;
  assignment_group: AssignmentGroup;
  request_item?: RequestItem;
  number: string;
  state: string;
  assigned_to: string;
  variables: Variables;
}

// Robust normalization function to map both flat dot-notated keys and nested schemas safely
const normalizeSnowRecord = (raw: any): SnowRecord => {
  if (!raw) {
    return {
      number: "",
      short_description: "",
      state: "",
      assigned_to: "",
      assignment_group: { display_value: "N/A" },
      variables: { type: "Unknown Type" }
    };
  }

  const getStr = (v: any): string => {
    if (v === undefined || v === null) return "";
    if (typeof v === "object") {
      if (v.display_value !== undefined && v.display_value !== null) {
        return String(v.display_value);
      }
      return "";
    }
    return String(v).trim();
  };

  const getSubLink = (v: any): string | undefined => {
    if (v && typeof v === "object") {
      return v.link || undefined;
    }
    return undefined;
  };

  // Extract base level fields
  const number = getStr(raw.number);
  const short_description = getStr(raw.short_description);
  const state = getStr(raw.state);
  
  // Assigned to can be string like "" or object like { display_value: "..." }
  let assigned_to = "";
  if (raw.assigned_to) {
    assigned_to = getStr(raw.assigned_to);
  }

  // Assignment Group parsing
  let assignment_group: AssignmentGroup = { display_value: "GLOBAL - NIS - CRS Intake" };
  if (raw.assignment_group) {
    if (typeof raw.assignment_group === "object") {
      assignment_group = {
        display_value: getStr(raw.assignment_group) || "GLOBAL - NIS - CRS Intake",
        link: getSubLink(raw.assignment_group)
      };
    } else {
      assignment_group = {
        display_value: String(raw.assignment_group)
      };
    }
  }

  // Request Item & Nested Cat Item parsing
  let request_item: RequestItem | undefined = undefined;
  const ritmNumber = getStr(raw["request_item.number"] || (raw.request_item && raw.request_item.number));
  const ritmState = getStr(raw["request_item.state"] || (raw.request_item && raw.request_item.state));
  const rawCatItem = raw["request_item.cat_item"] || (raw.request_item && raw.request_item.cat_item);

  let cat_item: CatItem | undefined = undefined;
  if (rawCatItem) {
    if (typeof rawCatItem === "object") {
      cat_item = {
        display_value: getStr(rawCatItem) || "Code Review Services",
        link: getSubLink(rawCatItem)
      };
    } else {
      cat_item = {
        display_value: String(rawCatItem)
      };
    }
  }

  if (ritmNumber || ritmState || cat_item) {
    request_item = {
      number: ritmNumber || "N/A",
      state: ritmState || undefined,
      cat_item
    };
  }

  // Search through potential variable keys in raw (handling dot-notated dynamic properties)
  const type = getStr(
    raw["variables.82113e60db2b08d0dbf414a05b961990"] || 
    (raw.variables && (raw.variables.type || raw.variables["82113e60db2b08d0dbf414a05b961990"]))
  ) || "Unknown Type";

  const application = getStr(
    raw["variables.e1147a86dbdb8854dbf414a05b96198f"] || 
    (raw.variables && (raw.variables.application || raw.variables["e1147a86dbdb8854dbf414a05b96198f"]))
  ) || undefined;

  const billing_model = getStr(
    raw["variables.69cda5ee1bd638104704eacee54bcbea"] || 
    (raw.variables && (raw.variables.billing_model || raw.variables["69cda5ee1bd638104704eacee54bcbea"]))
  ) || undefined;

  return {
    number,
    short_description,
    state,
    assigned_to,
    assignment_group,
    request_item,
    variables: {
      type,
      application,
      billing_model
    }
  };
};

interface SnowIntakeScreenProps {
  onClose: () => void;
}

const snowData: SnowRecord[] = [
  {
    short_description: "Static Scan Access Request: Advanced Network Monitoring - Enterprise (ThousandEyes) (AMER) (Production) legacy",
    assignment_group: {
      display_value: "GLOBAL - NIS - CRS Intake",
      link: "https://pwcnetworktest.service-now.com/api/now/table/sys_user_group/d7c49a221b8b0c509b6165b9bd4bcb92"
    },
    request_item: {
      number: "RITM26124235",
      state: "Work in Progress",
      cat_item: {
        display_value: "Code Review Services",
        link: "https://pwcnetworktest.service-now.com/api/now/table/sc_cat_item/6382512ddb59bf40dbf414a05b96194e"
      }
    },
    number: "SCTASK29032898",
    state: "Work in Progress",
    assigned_to: "",
    variables: {
      type: "Static Scan Access Request",
      application: "CRS-DEMO-APP",
      billing_model: "Consumption-based"
    }
  },
  {
    short_description: "Static Scan Access Request: Aura Checker",
    assignment_group: {
      display_value: "GLOBAL - NIS - CRS Intake",
      link: "https://pwcnetworktest.service-now.com/api/now/table/sys_user_group/d7c49a221b8b0c509b6165b9bd4bcb92"
    },
    request_item: {
      number: "RITM26187889",
      state: "Work in Progress",
      cat_item: {
        display_value: "Code Review Services",
        link: "https://pwcnetworktest.service-now.com/api/now/table/sc_cat_item/6382512ddb59bf40dbf414a05b96194e"
      }
    },
    number: "SCTASK29097185",
    state: "Work in Progress",
    assigned_to: "Suraj Shinde",
    variables: {
      type: "Static Scan Access Request",
      application: "Test Application",
      billing_model: "Mandatory BSS"
    }
  },
  {
    short_description: "CI/CD Integration Support: Cursor AI",
    assignment_group: {
      display_value: "GLOBAL - NIS - CRS Intake"
    },
    request_item: {
      number: "RITM26124236",
      state: "Work in Progress"
    },
    number: "SCTASK29032899",
    state: "Work in Progress",
    assigned_to: "",
    variables: {
      type: "CI/CD Integration Support",
      application: "CRS-DEMO-APP"
    }
  },
  {
    short_description: "Create Application: Advanced Network Monitoring - Enterprise (ThousandEyes)",
    assignment_group: {
      display_value: "GLOBAL - NIS - CRS Intake"
    },
    request_item: {
      number: "RITM26056126",
      state: "Work in Progress"
    },
    number: "SCTASK28971656",
    state: "Open",
    assigned_to: "",
    variables: {
      type: "Create Scanning Tool Profile",
      billing_model: "Mandatory BSS"
    }
  }
];

export const SnowIntakeScreen: React.FC<SnowIntakeScreenProps> = ({ onClose }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const [records, setRecords] = useState<SnowRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiSource, setApiSource] = useState<"live" | "mock" | null>(null);
  const [endpointUsed, setEndpointUsed] = useState<string>("");
  const [credentialsPath, setCredentialsPath] = useState<string>("");

  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      let response;
      let usedEndpointUrl = "/api/intake/requests";
      
      try {
        response = await fetch(usedEndpointUrl);
        if (!response.ok) {
          throw new Error(`Relative endpoint failed with status ${response.status}`);
        }
      } catch (e) {
        // Fallback or override: Try the absolute http://localhost:8081 endpoint directly
        console.log("Relative API intake request failed/absent, targeting direct port 8081 URL:", e);
        usedEndpointUrl = "http://localhost:8081/api/intake/requests";
        response = await fetch(usedEndpointUrl);
      }

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}: ${response.statusText}`);
      }

      const resData = await response.json();
      
      let parsedRawRecords: any[] | null = null;
      let isLive = false;
      let errMsg = "";

      // 1. Array wrapper from proxy: { success: true, data: { result: [...] } }
      if (resData && resData.success === true && resData.data && Array.isArray(resData.data.result)) {
        parsedRawRecords = resData.data.result;
        isLive = true;
      }
      // 2. Proxy wrapped with direct failure or error (but contains data as fallback):
      else if (resData && resData.success === false && resData.data && Array.isArray(resData.data.result)) {
        parsedRawRecords = resData.data.result;
        isLive = false;
        errMsg = resData.error || "Fallback backend mock loaded.";
      }
      // 3. Direct ServiceNow raw payload: { result: [...] }
      else if (resData && Array.isArray(resData.result)) {
        parsedRawRecords = resData.result;
        isLive = true;
      }
      // 4. Direct JSON Array: [ {...}, {...} ]
      else if (Array.isArray(resData)) {
        parsedRawRecords = resData;
        isLive = true;
      }
      // 5. Raw wrapped success array: { success: true, data: [...] }
      else if (resData && resData.success === true && Array.isArray(resData.data)) {
        parsedRawRecords = resData.data;
        isLive = true;
      }
      // 6. Generic array nested inside data: { data: [...] }
      else if (resData && Array.isArray(resData.data)) {
        parsedRawRecords = resData.data;
        isLive = true;
      }
      // 7. Generic array nested inside data.result: { data: { result: [...] } }
      else if (resData && resData.data && Array.isArray(resData.data.result)) {
        parsedRawRecords = resData.data.result;
        isLive = true;
      }

      if (isLive && parsedRawRecords) {
        setRecords(parsedRawRecords.map(normalizeSnowRecord));
        setApiSource("live");
      } else {
        console.warn("ServiceNow live fetch didn't yield expected record format or returned error:", resData);
        setApiSource(null);
        setError(errMsg || "Live ServiceNow intake interface could not parse expected ticket response. Please contact system admin.");
        setRecords([]);
      }

      setEndpointUsed(resData ? (resData.endpointUsed || usedEndpointUrl) : usedEndpointUrl);
      if (resData && resData.credentialsPath) {
        setCredentialsPath(resData.credentialsPath);
      } else {
        setCredentialsPath("Integrated Spring Boot static context");
      }
    } catch (err) {
      console.error("Failed to load ServiceNow intake records:", err);
      setError("Failed to fetch live tickets from ServiceNow: " + (err as Error).message);
      setApiSource(null);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const numberStr = record.number;
      const shortDescStr = record.short_description;
      const assignedToStr = record.assigned_to;
      const ritmStr = record.request_item ? record.request_item.number : "";

      const matchSearch = 
        numberStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
        shortDescStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ritmStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
        assignedToStr.toLowerCase().includes(searchTerm.toLowerCase());
      
      const stateStr = record.state;
      const matchState = stateFilter === "ALL" || stateStr === stateFilter;
      
      const varTypeStr = record.variables.type;
      const matchType = typeFilter === "ALL" || varTypeStr === typeFilter;

      return matchSearch && matchState && matchType;
    });
  }, [records, searchTerm, stateFilter, typeFilter]);

  // Total statistics for the right side panel
  const stats = useMemo(() => {
    const total = records.length;
    const workInProgress = records.filter(r => r.state === "Work in Progress").length;
    const open = records.filter(r => r.state === "Open").length;

    // Type counts
    const types: Record<string, number> = {};
    const applications: Record<string, number> = {};
    const billingModels: Record<string, number> = {};
    const assignedUsers: Record<string, number> = {};

    records.forEach((r) => {
      const type = r.variables.type || "Unknown Type";
      types[type] = (types[type] || 0) + 1;
      
      const app = r.variables.application;
      if (app) {
        applications[app] = (applications[app] || 0) + 1;
      } else {
        applications["N/A"] = (applications["N/A"] || 0) + 1;
      }
      
      const billing = r.variables.billing_model;
      if (billing) {
        billingModels[billing] = (billingModels[billing] || 0) + 1;
      } else {
        billingModels["Unspecified"] = (billingModels["Unspecified"] || 0) + 1;
      }
      
      const user = r.assigned_to || "Unassigned";
      assignedUsers[user] = (assignedUsers[user] || 0) + 1;
    });

    return {
      total,
      workInProgress,
      open,
      types,
      applications,
      billingModels,
      assignedUsers
    };
  }, [records]);

  // Helper to render values that have links, else falling back to normal text
  const renderCellWithLink = (value?: string, link?: string) => {
    if (!value) return <span className="text-slate-500">---</span>;
    if (link) {
      return (
        <a 
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-all shadow-inner"
        >
          <span>{value}</span>
          <ExternalLink size={11} className="text-blue-400/70" />
        </a>
      );
    }
    return <span className="text-slate-300 font-bold text-xs">{value}</span>;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="col-span-12 grid grid-cols-12 gap-5 h-full min-h-0"
    >
      {/* LEFT SIDEBAR PANEL: Stats & Total Records (col-span-3) */}
      <div className="col-span-3 flex flex-col gap-4 overflow-y-auto min-h-0 min-w-0 pr-1 pb-4">
        
        {/* Widget 1: Total Records Stats Hero */}
        <div className="bento-card p-4 bg-slate-900 border-slate-800 flex flex-col justify-between shrink-0 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-black">
              Total Intake Tasks
            </h3>
            <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
              <Database size={14} className="animate-pulse" />
            </span>
          </div>

          <div className="mt-2">
            <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 font-mono tracking-tight leading-none">
              {stats.total.toString().padStart(2, "0")}
            </span>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black mt-2">
              ACTIVE SERVICE-NOW TICKETS
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between text-[10px] font-mono">
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>WIP: {stats.workInProgress}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>OPEN: {stats.open}</span>
            </div>
          </div>
        </div>

        {/* Widget 3: Ticket types distributions */}
        <div className="bento-card p-4 bg-slate-900 border-slate-800 shrink-0">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-3 flex items-center gap-1.5">
            <Tag size={10} className="text-orange-500" /> Ticket Types
          </h3>

          <div className="space-y-2">
            {Object.entries(stats.types).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between p-2 bg-slate-950/40 rounded border border-slate-850">
                <span className="text-[10px] text-slate-300 font-black truncate max-w-[140px]" title={type}>{type}</span>
                <span className="text-[9px] font-mono text-blue-400 font-black px-1.5 py-0.5 rounded bg-blue-500/5 border border-blue-500/10">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Widget 5: Assignments info */}
        <div className="bento-card p-4 bg-slate-900 border-slate-800 shrink-0 shadow-lg">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-3 flex items-center gap-1.5">
            <User size={10} className="text-purple-500" /> Assignments
          </h3>

          <div className="space-y-2">
            {Object.entries(stats.assignedUsers).map(([user, count]) => (
              <div key={user} className="flex items-center justify-between p-2 bg-slate-950/40 rounded border border-slate-850">
                <span className="text-[10px] text-slate-400 truncate max-w-[140px] font-bold" title={user}>{user}</span>
                <span className={`text-[9px] font-mono font-black px-1.5 py-0.5 rounded ${
                  user !== "Unassigned" 
                    ? "text-purple-400 bg-purple-500/5 border border-purple-500/10"
                    : "text-slate-600 bg-slate-805 border border-slate-800"
                }`}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* RIGHT AREA: SNOW Table (col-span-9) */}
      <div className="col-span-9 bento-card flex flex-col bg-slate-900 border-slate-800 overflow-hidden min-h-0 min-w-0">
        
        {/* Header toolbar */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row items-center gap-4 justify-between">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="p-2 bg-slate-800/80 border border-slate-700/60 rounded-xl text-slate-400 hover:text-white hover:border-slate-500 transition-all active:scale-95 shadow-md flex items-center justify-center shrink-0"
              title="Return to Security Findings"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-blue-500 shrink-0" />
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-200 truncate">
                  ServiceNow Intake Dashboard
                </h2>
              </div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mt-0.5">
                ServiceNow task mapping & ticket review index
              </p>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
            
            {/* Live / Mock status indicator */}
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-950 border border-slate-850 rounded-lg shrink-0">
              <span className={`h-1.5 w-1.5 rounded-full ${
                loading 
                  ? 'bg-blue-400 shadow-[0_0_8px_#60a5fa]' 
                  : apiSource === 'live' 
                    ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' 
                    : error 
                      ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' 
                      : 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
              } ${loading ? 'animate-ping' : ''}`} />
              <span className="text-[8px] font-black tracking-widest uppercase text-slate-500">
                {loading 
                  ? "FETCHING..." 
                  : apiSource === 'live' 
                    ? "CONNECT: ESCAPE_LIVE" 
                    : error 
                      ? "CONNECT: OFFLINE_ERROR" 
                      : "CONNECT: OFFLINE"
                }
              </span>
            </div>

            {/* Manual Reload trigger */}
            <button
              onClick={fetchRecords}
              disabled={loading}
              className={`p-1.5 rounded-lg border text-slate-400 transition-all hover:bg-slate-800 hover:text-white ${
                loading ? "opacity-55 cursor-not-allowed" : "active:scale-95 cursor-pointer"
              } bg-slate-950 border-slate-805 shrink-0`}
              title="Reload from credentials and live endpoint"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>

            <div className="relative w-44 sm:w-52 max-w-full">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
                <Search size={12} />
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search SCTASK, description, user..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800/80 rounded-lg text-xs outline-none text-slate-300 placeholder-slate-600 focus:border-blue-500/50 transition-all font-medium"
              />
            </div>

            <div className="flex gap-1.5 bg-slate-950/60 p-1 border border-slate-800/80 rounded-lg">
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="bg-transparent text-[10px] font-black text-slate-400 uppercase py-1 px-2 outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-slate-950 text-slate-400">[ ALL STATES ]</option>
                <option value="Work in Progress" className="bg-slate-950 text-slate-400">[ WIP ]</option>
                <option value="Open" className="bg-slate-950 text-slate-400">[ OPEN ]</option>
              </select>
            </div>
          </div>
        </div>

        {/* Connection health & local API status bar */}
        {(error || apiSource === 'live') && (
          <div className="px-5 py-2 border-b border-slate-800 bg-slate-950/20 text-[10px] flex flex-col md:flex-row md:items-center justify-between gap-3 text-slate-500 font-mono">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="p-0.5 px-1 rounded bg-slate-950 border border-slate-850 text-[8px] uppercase tracking-wider text-slate-500 font-bold shrink-0">
                Connection Status:
              </span>
              {apiSource === 'live' && (
                <span className="text-emerald-500 text-[8px] uppercase font-black flex items-center gap-1 shrink-0">
                  <CheckCircle2 size={11} className="text-emerald-500" />
                  Connected to Local Intake Service
                </span>
              )}
              {error && (
                <span className="text-red-400 text-[8px] uppercase font-black flex items-center gap-1 shrink-0">
                  <AlertTriangle size={11} className="text-red-400" />
                  Service Connection Offline ({error.length > 80 ? `${error.slice(0, 80)}...` : error})
                </span>
              )}
            </div>
          </div>
        )}

        {/* The Intake Table */}
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-950/40 text-[10px] text-slate-500 font-black uppercase tracking-wider sticky top-0 z-20 backdrop-blur-sm">
              <tr className="border-b border-slate-800/50">
                <th className="p-4 w-32 font-black">TASK / RITM</th>
                <th className="p-4 w-44 font-black">Assignment Group</th>
                <th className="p-4 font-black">Short Description</th>
                <th className="p-4 w-60 font-black">Variables Info</th>
                <th className="p-4 w-32 font-black">Assigned / State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`} className="animate-pulse border-b border-slate-800/10">
                    {/* TASK / RITM skeleton */}
                    <td className="p-4 align-top">
                      <div className="flex flex-col gap-1.5">
                        <div className="h-5 bg-slate-800 rounded-md w-24"></div>
                        <div className="h-3 bg-slate-800/60 rounded-md w-16"></div>
                      </div>
                    </td>
                    {/* Assignment Group skeleton */}
                    <td className="p-4 align-top">
                      <div className="h-5 bg-slate-800 rounded-md w-36"></div>
                    </td>
                    {/* Short Description skeleton */}
                    <td className="p-4 align-top">
                      <div className="space-y-1.5 max-w-md">
                        <div className="h-4 bg-slate-800 rounded-md w-full"></div>
                        <div className="h-3.5 bg-slate-850 rounded-md w-3/4"></div>
                      </div>
                    </td>
                    {/* Variables Info skeleton */}
                    <td className="p-4 align-top">
                      <div className="flex flex-col gap-2">
                        <div className="h-4 bg-slate-800 rounded-md w-24"></div>
                        <div className="h-3 bg-slate-850 rounded-md w-16"></div>
                      </div>
                    </td>
                    {/* Assigned / State skeleton */}
                    <td className="p-4 align-top">
                      <div className="flex flex-col gap-2">
                        <div className="h-5 bg-slate-800 rounded-md w-20"></div>
                        <div className="h-3.5 bg-slate-850 rounded-md w-24"></div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                filteredRecords.map((record) => {
                  const recNum = record.number;
                  const recState = record.state;
                  const recAssigned = record.assigned_to;
                  const recShortDesc = record.short_description;
                  const hasReqItem = !!record.request_item;
                  
                  let reqItemNum = "";
                  let reqItemCatDis = "";
                  let reqItemCatLink: string | undefined = undefined;
                  if (record.request_item) {
                    reqItemNum = record.request_item.number;
                    if (record.request_item.cat_item) {
                      reqItemCatDis = record.request_item.cat_item.display_value;
                      reqItemCatLink = record.request_item.cat_item.link;
                    }
                  }

                  return (
                    <tr 
                      key={recNum || Math.random().toString()} 
                      className="hover:bg-slate-800/20 transition-all border-b border-slate-800/10"
                    >
                      {/* TASK / RITM numbers & values */}
                      <td className="p-4 align-top">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-black font-mono text-slate-300 bg-slate-950/80 border border-slate-850 px-2 py-0.5 rounded shadow-sm w-fit">
                            {recNum}
                          </span>
                          {hasReqItem && (
                            <div className="flex flex-col gap-0.5 pl-0.5">
                              <span className="text-[9px] font-extrabold font-mono text-slate-500">
                                {reqItemNum}
                              </span>
                              {reqItemCatDis && (
                                <div className="text-[8px] mt-0.5">
                                  {renderCellWithLink(
                                    reqItemCatDis,
                                    reqItemCatLink
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Assignment Group */}
                      <td className="p-4 align-top">
                        <div className="flex flex-col gap-1 max-w-[160px]">
                          {renderCellWithLink(
                            record.assignment_group.display_value,
                            record.assignment_group.link
                          )}
                          <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest block font-mono">
                            Intake Node
                          </span>
                        </div>
                      </td>

                      {/* Short Description */}
                      <td className="p-4 align-top">
                        <div className="text-xs text-slate-300 font-medium leading-relaxed max-w-md break-words whitespace-pre-wrap">
                          {recShortDesc}
                        </div>
                      </td>

                      {/* Variables */}
                      <td className="p-4 align-top">
                        <div className="flex flex-col gap-1.5 max-w-[220px]">
                          {/* Variable Type Badge */}
                          <div className="flex items-start gap-1">
                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-wider shrink-0 mt-0.5">Type:</span>
                            <span className="inline-flex px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border-blue-500/20 leading-none">
                              {record.variables.type}
                            </span>
                          </div>
                          
                          {/* Application Badge */}
                          {record.variables.application && (
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-black text-slate-600 uppercase tracking-wider shrink-0">App:</span>
                              <span className="font-mono text-[9px] font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Layers size={8} />
                                {record.variables.application}
                              </span>
                            </div>
                          )}

                          {/* Billing model Badge */}
                          {record.variables.billing_model && (
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-black text-slate-600 uppercase tracking-wider shrink-0">Billing:</span>
                              <span className="text-[8px] font-black text-amber-400 bg-amber-500/5 border border-amber-500/10 px-1.5 py-0.5 rounded uppercase tracking-widest">
                                {record.variables.billing_model}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Assigned User / Task State */}
                      <td className="p-4 align-top">
                        <div className="flex flex-col gap-2">
                          {/* State badge */}
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest border leading-none shadow-sm w-fit ${
                            recState === "Work in Progress" 
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${recState === "Work in Progress" ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
                            {recState}
                          </span>

                          {/* Assigned to */}
                          <div className="flex items-center gap-1 text-[10px]">
                            <User size={10} className="text-slate-600 shrink-0" />
                            <span className={recAssigned ? "text-slate-300 font-bold" : "text-slate-600 italic font-semibold"}>
                              {recAssigned || "Unassigned"}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={5} className="py-20 text-center px-4">
                    <AlertTriangle size={42} className="mx-auto text-red-500 mb-4 animate-bounce" />
                    <p className="text-red-400 font-black uppercase tracking-widest text-xs">
                      ServiceNow Integration Error
                    </p>
                    <p className="text-slate-400 text-xs mt-2.5 max-w-lg mx-auto font-mono bg-slate-950/60 p-4 border border-red-500/10 rounded-lg shadow-sm whitespace-pre-wrap break-all leading-relaxed">
                      {error}
                    </p>
                    <button 
                      onClick={fetchRecords}
                      className="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-750 font-bold uppercase tracking-wider text-xs text-slate-200 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg shadow-md hover:shadow-lg transition-all active:scale-95"
                    >
                      Retry Connection
                    </button>
                  </td>
                </tr>
              )}

              {!loading && !error && filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-24 text-center">
                    <FileText size={36} className="mx-auto text-slate-800 mb-3" />
                    <p className="text-slate-500 font-black uppercase tracking-widest text-xs">
                      No tickets match the active search/filters
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer info */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-between items-center text-[10px] font-mono text-slate-500 uppercase tracking-widest">
          <div>
            Showing <span className="text-slate-300 font-bold">{filteredRecords.length}</span> of <span className="text-slate-300 font-bold">{records.length}</span> Intake Records
          </div>
          <div className="text-[9px] text-slate-600 font-bold uppercase tracking-[0.2em] font-mono">
            ServiceNow API Client Layer v1.0.0
          </div>
        </div>
      </div>

    </motion.div>
  );
};
