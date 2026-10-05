import React, { useState, useEffect, useMemo } from "react";
import { 
  ArrowLeft, 
  DollarSign, 
  TrendingUp, 
  Briefcase, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  TrendingDown, 
  PieChart, 
  Activity,
  Layers,
  ArrowUpRight
} from "lucide-react";
import { motion } from "motion/react";

interface Client {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  clientId: string;
}

interface FinancialData {
  revenue: number;
  budgetAllocated: number;
  spentToDate: number;
  remainingBalance: number;
  forecastedCost: number;
  burnRate: number;
  activeResources: number;
  complianceScore: number;
  recentTransactions: Array<{
    id: string;
    description: string;
    amount: number;
    type: "credit" | "debit";
    date: string;
  }>;
  projectHighlights: Array<{
    name: string;
    budget: number;
    spent: number;
    status: "On Track" | "At Risk" | "Critical";
  }>;
}

interface FinancialDashboardProps {
  onClose: () => void;
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ onClose }) => {
  const fiscalYears = ["2024", "2025", "2026", "2027"];
  
  const clients: Client[] = [
    { id: "1001", name: "Acme Corporation" },
    { id: "1002", name: "Globex Incorporated" },
    { id: "1003", name: "Initech LLC" },
    { id: "1004", name: "Umbrella Corp" }
  ];

  const projects: Project[] = [
    { id: "2001", name: "Project Apollo", clientId: "1001" },
    { id: "2002", name: "Project Gemini", clientId: "1001" },
    { id: "2003", name: "Project Artemis", clientId: "1002" },
    { id: "2004", name: "Project Voyager", clientId: "1002" },
    { id: "2005", name: "Project Phoenix", clientId: "1003" },
    { id: "2006", name: "Project Resident", clientId: "1004" }
  ];

  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>("2026");
  const [selectedClientId, setSelectedClientId] = useState<string>("1002");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FinancialData | null>(null);
  const [apiUrlSent, setApiUrlSent] = useState<string>("");
  const [isUsingMock, setIsUsingMock] = useState<boolean>(false);

  // Filter projects based on selected client
  const filteredProjects = useMemo(() => {
    return projects.filter(p => p.clientId === selectedClientId);
  }, [selectedClientId]);

  // If the current project does not belong to the selected client, reset project to "all"
  useEffect(() => {
    if (selectedProjectId !== "all") {
      const belongs = filteredProjects.some(p => p.id === selectedProjectId);
      if (!belongs) {
        setSelectedProjectId("all");
      }
    }
  }, [selectedClientId, filteredProjects, selectedProjectId]);

  // Fetch data
  const fetchFinancials = async () => {
    setLoading(true);
    setError(null);

    // Build API url for the frontend call
    let clientQuery = `fiscalYear=${selectedFiscalYear}&clientId=${selectedClientId}`;
    if (selectedProjectId !== "all") {
      clientQuery += `&projectId=${selectedProjectId}`;
    }
    
    // Exact port 8080 URL specified in the prompt that we show to the user and proxy through our server
    let targetUrl = `http://localhost:8080/api/v1/financial-dashboard?fiscalYear=${selectedFiscalYear}&clientId=${selectedClientId}`;
    if (selectedProjectId !== "all") {
      targetUrl += `&projectId=${selectedProjectId}`;
    }
    
    setApiUrlSent(targetUrl);

    try {
      const response = await fetch(`/api/v1/financial-dashboard?${clientQuery}`);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const json = await response.json();
      setData(json.data);
      setIsUsingMock(json.source === "mock");
    } catch (err) {
      console.log("[FinancialDashboard] Fetching from mock fallback logic as backend is down:", err);
      // Generate beautiful fallback mock data depending on selection
      const multiplier = parseInt(selectedClientId) + parseInt(selectedFiscalYear);
      const isProjectSpecific = selectedProjectId !== "all";
      const prjName = isProjectSpecific ? projects.find(p => p.id === selectedProjectId)?.name || "Project" : "All Projects";
      
      const rev = (isProjectSpecific ? 450000 : 2300000) + (multiplier % 7) * 80000;
      const budget = (isProjectSpecific ? 500000 : 2500000) + (multiplier % 5) * 120000;
      const spent = (isProjectSpecific ? 380000 : 1900000) + (multiplier % 9) * 60000;
      const remaining = budget - spent;
      const forecasted = spent * 1.15;
      const burn = Math.round((spent / budget) * 100);

      const mockData: FinancialData = {
        revenue: rev,
        budgetAllocated: budget,
        spentToDate: spent,
        remainingBalance: remaining,
        forecastedCost: forecasted,
        burnRate: burn,
        activeResources: isProjectSpecific ? 4 + (multiplier % 5) : 18 + (multiplier % 10),
        complianceScore: 85 + (multiplier % 15),
        recentTransactions: [
          {
            id: "TX-9021",
            description: `Infrastructure Deployment - ${prjName}`,
            amount: 14200,
            type: "debit",
            date: "2026-06-15"
          },
          {
            id: "TX-9022",
            description: `Milestone Payment - ${clients.find(c => c.id === selectedClientId)?.name}`,
            amount: 125000,
            type: "credit",
            date: "2026-06-12"
          },
          {
            id: "TX-9023",
            description: `License Procurement - API Access`,
            amount: 8400,
            type: "debit",
            date: "2026-06-10"
          },
          {
            id: "TX-9024",
            description: `Senior Architect Consulting Weeks`,
            amount: 19500,
            type: "debit",
            date: "2026-06-08"
          }
        ],
        projectHighlights: isProjectSpecific ? [
          {
            name: prjName,
            budget: budget,
            spent: spent,
            status: burn > 90 ? "Critical" : burn > 75 ? "At Risk" : "On Track"
          }
        ] : filteredProjects.map((p, idx) => {
          const pMultiplier = parseInt(p.id);
          const pBudget = 400000 + (pMultiplier % 5) * 100000;
          const pSpent = 300000 + (pMultiplier % 3) * 80000;
          const pBurn = (pSpent / pBudget) * 100;
          return {
            name: p.name,
            budget: pBudget,
            spent: pSpent,
            status: pBurn > 90 ? "Critical" : pBurn > 75 ? "At Risk" : "On Track"
          };
        })
      };

      setData(mockData);
      setIsUsingMock(true);
    } finally {
      setLoading(false);
    }
  };

  // Run initial fetch on mount/dependency change
  useEffect(() => {
    fetchFinancials();
  }, [selectedFiscalYear, selectedClientId, selectedProjectId]);

  return (
    <div id="financial-dashboard-view" className="col-span-12 flex flex-col h-full bg-[#050608] text-slate-100 rounded-xl border border-slate-800/80 overflow-hidden shadow-2xl">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-900/60 border-b border-slate-800/50 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-4">
          <button
            id="financial-back-button"
            onClick={onClose}
            className="p-2 hover:bg-slate-800/80 rounded-lg text-slate-400 hover:text-white transition-all border border-slate-800 active:scale-95"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">
              Financial Analysis Dashboard
            </h2>
            <p className="text-[10px] text-slate-500 font-mono tracking-wider uppercase mt-0.5">
              Client & Project Portfolio Valuation Control
            </p>
          </div>
        </div>
        
        {isUsingMock && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Local Fallback Mode
          </div>
        )}
      </div>

      {/* Control Panel: Year, Client, Project */}
      <div className="p-4 bg-slate-950/60 border-b border-slate-800/50 grid grid-cols-1 md:grid-cols-4 gap-4 items-end shrink-0">
        {/* Fiscal Year Dropdown */}
        <div className="flex flex-col">
          <label htmlFor="fiscal-year-select" className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1.5">
            Fiscal Year
          </label>
          <div className="relative">
            <Calendar size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <select
              id="fiscal-year-select"
              value={selectedFiscalYear}
              onChange={(e) => setSelectedFiscalYear(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 pl-10 pr-3 text-xs font-bold text-slate-200 focus:outline-none focus:border-blue-500 transition-all appearance-none"
            >
              {fiscalYears.map(year => (
                <option key={year} value={year}>FY {year}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Client Dropdown - MUST NOT HAVE "ALL CLIENTS" OPTION */}
        <div className="flex flex-col">
          <label htmlFor="client-select" className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1.5">
            Client Profile
          </label>
          <div className="relative">
            <Briefcase size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <select
              id="client-select"
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 pl-10 pr-3 text-xs font-bold text-slate-200 focus:outline-none focus:border-blue-500 transition-all appearance-none"
            >
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name} (ID: {client.id})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Project Dropdown - WITH "ALL PROJECTS" */}
        <div className="flex flex-col">
          <label htmlFor="project-select" className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1.5">
            Project Deliverable
          </label>
          <div className="relative">
            <Layers size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <select
              id="project-select"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 pl-10 pr-3 text-xs font-bold text-slate-200 focus:outline-none focus:border-blue-500 transition-all appearance-none"
            >
              <option value="all">All Projects</option>
              {filteredProjects.map(proj => (
                <option key={proj.id} value={proj.id}>{proj.name} (ID: {proj.id})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Refresh Action */}
        <div className="flex items-center gap-2">
          <button
            id="financial-refresh-btn"
            onClick={fetchFinancials}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider py-2 px-4 rounded-lg transition-all shadow-lg shadow-blue-900/25 active:scale-95"
          >
            {loading ? "Synchronizing..." : "Synchronize Data"}
          </button>
        </div>
      </div>

      {/* Target URL Endpoint Inspector */}
      <div className="px-6 py-2 bg-slate-900/30 border-b border-slate-800/30 flex items-center gap-2.5 flex-wrap shrink-0 font-mono text-[10px]">
        <span className="text-slate-500 uppercase font-black tracking-widest text-[9px]">API TARGET:</span>
        <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-bold uppercase tracking-wider">GET</span>
        <span className="text-slate-400 select-all underline">{apiUrlSent || "Pending selection..."}</span>
      </div>

      {/* Content Canvas */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-t-blue-500 border-r-transparent border-slate-800 animate-spin" />
            <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Retrieving Project Portfolios...</p>
          </div>
        ) : error ? (
          <div className="p-6 bg-red-500/5 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={16} />
            <div>
              <p className="text-xs font-bold text-red-400 uppercase tracking-widest">Synchronization Failure</p>
              <p className="text-xs text-slate-400 mt-1">{error}</p>
            </div>
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card: Budget */}
              <div className="bento-card p-4 flex flex-col justify-between bg-slate-900/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 text-slate-300">
                  <DollarSign size={48} />
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Budget Allocation</span>
                  <h3 className="text-lg font-black text-white mt-1">
                    ${data.budgetAllocated.toLocaleString()}
                  </h3>
                </div>
                <div className="mt-4 flex items-center justify-between text-[10px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 rounded px-2 py-0.5">
                  <span className="flex items-center gap-1"><TrendingUp size={10} /> Fully Funded</span>
                  <span className="font-bold">FY{selectedFiscalYear}</span>
                </div>
              </div>

              {/* Card: Spent to Date */}
              <div className="bento-card p-4 flex flex-col justify-between bg-slate-900/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 text-slate-300">
                  <Activity size={48} />
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Spent To Date</span>
                  <h3 className="text-lg font-black text-white mt-1">
                    ${data.spentToDate.toLocaleString()}
                  </h3>
                </div>
                <div className="mt-4 flex items-center justify-between text-[10px] text-slate-400 bg-slate-800 border border-slate-800 rounded px-2 py-0.5">
                  <span>Burn Rate Index</span>
                  <span className="font-bold text-white">{data.burnRate}%</span>
                </div>
              </div>

              {/* Card: Remaining Balance */}
              <div className="bento-card p-4 flex flex-col justify-between bg-slate-900/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 text-slate-300">
                  <TrendingDown size={48} />
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Remaining Balance</span>
                  <h3 className="text-lg font-black text-emerald-400 mt-1">
                    ${data.remainingBalance.toLocaleString()}
                  </h3>
                </div>
                <div className="mt-4 flex items-center justify-between text-[10px] text-blue-400 bg-blue-500/5 border border-blue-500/10 rounded px-2 py-0.5">
                  <span>Active Headcount</span>
                  <span className="font-bold">{data.activeResources} Resources</span>
                </div>
              </div>

              {/* Card: Forecasted Final Cost */}
              <div className="bento-card p-4 flex flex-col justify-between bg-slate-900/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 text-slate-300">
                  <PieChart size={48} />
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Forecasted Cost</span>
                  <h3 className="text-lg font-black text-amber-400 mt-1">
                    ${Math.round(data.forecastedCost).toLocaleString()}
                  </h3>
                </div>
                <div className="mt-4 flex items-center justify-between text-[10px] text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded px-2 py-0.5">
                  <span>Valuation Compliance</span>
                  <span className="font-bold">{data.complianceScore}% Score</span>
                </div>
              </div>
            </div>

            {/* Split Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Deliverable Status Highlights */}
              <div className="lg:col-span-7 bento-card p-4 bg-slate-900/10 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Project Portfolio Allocation</span>
                  <span className="text-[9px] font-mono text-slate-500 uppercase">Filtered Overview</span>
                </div>
                
                <div className="space-y-4">
                  {data.projectHighlights.map((proj, idx) => {
                    const pct = Math.min(100, Math.round((proj.spent / proj.budget) * 100));
                    return (
                      <div key={idx} className="space-y-1.5 p-3 rounded-xl bg-slate-900/30 border border-slate-800/40">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-black text-slate-200">{proj.name}</span>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                            proj.status === "Critical" ? "bg-red-500/15 text-red-400 border border-red-500/10" :
                            proj.status === "At Risk" ? "bg-amber-500/15 text-amber-400 border border-amber-500/10" :
                            "bg-emerald-500/15 text-emerald-400 border border-emerald-500/10"
                          }`}>
                            {proj.status}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              proj.status === "Critical" ? "bg-red-500" :
                              proj.status === "At Risk" ? "bg-amber-500" :
                              "bg-emerald-500"
                            }`} 
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-500">
                          <span>Budget: <strong className="text-slate-300">${proj.budget.toLocaleString()}</strong></span>
                          <span>Spent: <strong className="text-slate-300">${proj.spent.toLocaleString()} ({pct}%)</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Transactions Ledger */}
              <div className="lg:col-span-5 bento-card p-4 bg-slate-900/10 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Financial Transactions Ledger</span>
                  <span className="text-[9px] font-mono text-slate-500 uppercase">Ledger Stream</span>
                </div>

                <div className="divide-y divide-slate-800/60">
                  {data.recentTransactions.map((tx) => (
                    <div key={tx.id} className="py-2.5 flex items-center justify-between gap-2.5 text-xs">
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-bold text-slate-200 truncate" title={tx.description}>
                          {tx.description}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {tx.id} • {tx.date}
                        </p>
                      </div>
                      <div className={`shrink-0 font-mono font-black text-right ${
                        tx.type === "credit" ? "text-emerald-400" : "text-red-400"
                      }`}>
                        {tx.type === "credit" ? "+" : "-"}${tx.amount.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500">
            <AlertCircle size={32} className="mb-2" />
            <p className="text-sm">No portfolio financial data retrieved.</p>
          </div>
        )}
      </div>
    </div>
  );
};
