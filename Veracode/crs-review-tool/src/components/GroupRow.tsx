import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  XCircle, 
  Sparkles,
  RefreshCcw,
  ExternalLink,
  Code,
  Database
} from 'lucide-react';
import { AggregatedGroup } from '../types';
import { CWE_BASE_URL } from '../constants';

interface GroupRowProps {
  group: AggregatedGroup;
  isSelected: boolean;
  onSelect: () => void;
  onPullAI: () => Promise<void> | void;
  onUpdateAIComment: (val: string) => void;
  onViewFull: () => void;
}

export const GroupRow: React.FC<GroupRowProps> = ({ 
  group, 
  isSelected, 
  onSelect, 
  onPullAI, 
  onUpdateAIComment,
  onViewFull
}) => {
  const [isPulling, setIsPulling] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const handlePullAI = async () => {
    setIsPulling(true);
    await onPullAI();
    setIsPulling(false);
    setIsEditing(true);
  };

  return (
    <tr className={`border-b border-slate-800/30 transition-all ${isSelected ? 'bg-blue-500/5' : 'hover:bg-slate-800/40'}`}>
      <td className="p-4 align-top text-center">
        <input 
          type="checkbox" 
          className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-0 cursor-pointer"
          checked={isSelected}
          onChange={onSelect}
        />
      </td>
      <td className="p-4 align-top">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-lg font-black text-blue-400 font-mono leading-none">
              {group.records.length.toString().padStart(2, '0')}
            </span>
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter mt-1">Findings</span>
          </div>
        </div>
      </td>
      <td className="p-4 align-top">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <a 
              href={`${CWE_BASE_URL}${group.cweId}.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-black text-blue-400 hover:text-blue-300 transition-colors"
            >
              CWE-{group.cweId}
            </a>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest leading-none ${
              group.severity === 'Very High' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
              group.severity === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
              group.severity === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
              group.severity === 'Low' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
              'bg-slate-800 text-slate-500 border-slate-700'
            }`}>
              {group.severity}
            </span>
          </div>
        </div>
      </td>
      <td className="p-4 align-top">
        <div className="space-y-3">
          <div className="relative">
            <div 
              onDoubleClick={onViewFull}
              title="Double click to view full screen"
              className="text-[12px] text-slate-400 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800 italic shadow-inner cursor-pointer hover:border-slate-600 transition-colors line-clamp-2"
            >
              {group.comments ? `"${group.comments}"` : <em className="text-slate-600">-- NO CUSTOMER MITIGATION PROVIDED --</em>}
            </div>
            {group.comments && group.comments.length > 80 && (
              <div className="flex items-center justify-end mt-2">
                <button 
                  onClick={onViewFull}
                  className="text-[9px] font-black text-blue-500 uppercase hover:text-blue-400 transition-colors tracking-widest flex items-center gap-1"
                >
                  Full Mode <ExternalLink size={10} />
                </button>
              </div>
            )}
          </div>

          {group.aiComment || isEditing ? (
            <div className="relative group/ai">
              <textarea
                value={group.aiComment}
                onChange={(e) => onUpdateAIComment(e.target.value)}
                onDoubleClick={onViewFull}
                title="Double click to view full screen"
                className="w-full p-3 text-[11px] bg-blue-500/5 border border-blue-500/20 rounded-xl text-blue-100 focus:border-blue-500/50 outline-none transition-all min-h-[80px] resize-none leading-relaxed cursor-pointer"
                placeholder="Enter your mitigation proposal or pull AI analysis..."
              />
              <div className="absolute right-3 top-3 opacity-30 group-hover/ai:opacity-100 transition-opacity">
                 <Sparkles className="text-blue-400" size={14} />
              </div>
              <div className="absolute right-2 bottom-2 flex gap-1">
                <button 
                  onClick={onViewFull}
                  className="p-1.5 bg-slate-900 border border-slate-700 rounded-lg hover:border-blue-500 text-slate-500 hover:text-white transition-all shadow-xl"
                  title="Full screen view"
                >
                  <ExternalLink size={12} />
                </button>
                <button 
                  onClick={handlePullAI} 
                  className="p-1.5 bg-slate-900 border border-slate-700 rounded-lg hover:border-blue-500 text-blue-400 transition-all shadow-xl"
                  title="Regenerate"
                >
                  <RefreshCcw size={12} className={isPulling ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handlePullAI}
                disabled={isPulling}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50"
              >
                {isPulling ? <RefreshCcw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Pull AI Recommendation
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-slate-700 hover:text-white transition-all"
              >
                Mitigation Proposal
              </button>
            </div>
          )}
        </div>
      </td>
      <td className="p-4 align-top">
        {group.status ? (
          <div className={`flex items-center gap-1.5 font-black text-[10px] uppercase px-3 py-1.5 rounded-lg border shadow-lg ${
            group.status === 'approved' 
              ? 'bg-emerald-600/10 text-emerald-400 border-emerald-500/20 shadow-emerald-900/10' 
              : 'bg-red-600/10 text-red-400 border-red-500/20 shadow-red-900/10'
          }`}>
            {group.status === 'approved' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {group.status}
          </div>
        ) : (
            <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest px-3 py-1.5 border border-slate-800 rounded-lg">
              Proposed
            </div>
        )}
      </td>
    </tr>
  );
};
