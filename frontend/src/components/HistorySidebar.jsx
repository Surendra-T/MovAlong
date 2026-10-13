import React from 'react';
import { FileText, Loader2, AlertCircle, CheckCircle2, CloudUpload } from 'lucide-react';

export default function HistorySidebar({
  rfcs,
  activeRfcId,
  onSelectRfc,
  queueCount,
  loading
}) {
  return (
    <aside className="w-80 h-full bg-[#0D0D0D] border-r border-[#1F1F1F] flex flex-col flex-shrink-0 select-none">
      {/* Sidebar Header */}
      <div className="h-14 border-b border-[#1F1F1F] px-4 flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-medium">
          Documents ({rfcs.length})
        </span>
        {loading && <Loader2 className="w-3.5 h-3.5 text-neutral-500 animate-spin" />}
      </div>

      {/* Queued clips notification if any */}
      {queueCount > 0 && (
        <div className="mx-3 mt-3 px-3 py-2 bg-amber-950/20 border border-amber-900/40 rounded-lg flex items-center gap-2 text-xs font-mono text-amber-400">
          <CloudUpload className="w-4 h-4 flex-shrink-0 text-amber-500" />
          <span>{queueCount} memo{queueCount > 1 ? 's' : ''} queued offline</span>
        </div>
      )}

      {/* RFC List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {rfcs.length === 0 && !loading ? (
          <div className="text-center py-12 px-4 text-xs font-mono text-neutral-600">
            No RFCs found.
          </div>
        ) : (
          rfcs.map((rfc) => {
            const isSelected = activeRfcId === rfc.id;
            const isProcessing = rfc.status === 'transcribing' || rfc.status === 'structuring';
            const isFailed = rfc.status === 'failed';

            return (
              <button
                key={rfc.id}
                onClick={() => onSelectRfc(rfc.id)}
                className={`w-full text-left p-3 rounded-lg transition border flex flex-col gap-1.5 ${
                  isSelected
                    ? 'bg-[#181818] border-[#2A2A2A] text-white shadow-sm'
                    : 'bg-transparent border-transparent hover:bg-[#141414] text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-sans text-xs font-medium leading-snug line-clamp-2 text-neutral-200">
                    {rfc.title || 'Untitled RFC'}
                  </div>
                  {rfc.sample && (
                    <span className="flex-shrink-0 px-1.5 py-0.2 text-[9px] font-mono tracking-wider uppercase font-semibold bg-blue-950/40 text-blue-400 border border-blue-900/50 rounded">
                      SAMPLE
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500">
                  <span>
                    {rfc.created_at ? new Date(rfc.created_at).toLocaleDateString() : 'Just now'}
                  </span>

                  <span className="flex items-center gap-1">
                    {isProcessing && (
                      <span className="flex items-center gap-1 text-blue-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {rfc.status}
                      </span>
                    )}
                    {isFailed && (
                      <span className="flex items-center gap-1 text-red-400">
                        <AlertCircle className="w-3 h-3" />
                        failed
                      </span>
                    )}
                    {rfc.status === 'ready' && (
                      <span className="flex items-center gap-1 text-neutral-500">
                        <CheckCircle2 className="w-3 h-3 text-neutral-600" />
                        ready
                      </span>
                    )}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
