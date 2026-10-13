import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthScreen from './components/AuthScreen';
import HistorySidebar from './components/HistorySidebar';
import RfcViewer from './components/RfcViewer';
import Recorder from './components/Recorder';
import { listRfcsApi, getRfcApi, deleteRfcApi } from './api/client';
import { get, set } from 'idb-keyval';
import { Mic, LogOut, Wifi, WifiOff, CloudUpload, Sparkles } from 'lucide-react';

const CACHE_RFCS_KEY = 'movalong_cached_rfcs';

function Workspace() {
  const { user, logout } = useAuth();
  const [rfcs, setRfcs] = useState([]);
  const [activeRfcId, setActiveRfcId] = useState(null);
  const [activeRfc, setActiveRfc] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);

  // Online / offline event listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch RFCs list
  const fetchList = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingList(true);
    try {
      const data = await listRfcsApi();
      setRfcs(data);
      await set(CACHE_RFCS_KEY, data);

      // Auto-select first RFC if none selected
      setActiveRfcId((current) => {
        if (!current && data.length > 0) {
          return data[0].id;
        }
        return current;
      });
    } catch (err) {
      // Fallback to cached list
      const cached = await get(CACHE_RFCS_KEY);
      if (cached && cached.length > 0) {
        setRfcs(cached);
        setActiveRfcId((current) => current || cached[0].id);
      }
    } finally {
      if (!isSilent) setLoadingList(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Polling while any RFC is transcribing or structuring
  useEffect(() => {
    const hasPending = rfcs.some(
      (r) => r.status === 'transcribing' || r.status === 'structuring'
    );
    if (!hasPending) return;

    const interval = setInterval(() => {
      fetchList(true);
    }, 2000);

    return () => clearInterval(interval);
  }, [rfcs, fetchList]);

  // Fetch full details of the active RFC
  useEffect(() => {
    if (!activeRfcId) {
      setActiveRfc(null);
      return;
    }

    let isMounted = true;
    getRfcApi(activeRfcId)
      .then((data) => {
        if (isMounted) setActiveRfc(data);
      })
      .catch((err) => {
        console.error('Error fetching RFC detail:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [activeRfcId]);

  // Delete an RFC
  const handleDeleteRfc = async (id) => {
    if (!window.confirm('Delete this RFC?')) return;
    try {
      await deleteRfcApi(id);
      const remaining = rfcs.filter((r) => r.id !== id);
      setRfcs(remaining);
      await set(CACHE_RFCS_KEY, remaining);
      if (activeRfcId === id) {
        setActiveRfcId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      alert('Failed to delete RFC.');
    }
  };

  // Called when a new RFC is created from the recorder
  const handleRfcCreated = (newRfc) => {
    fetchList(true);
    if (newRfc && newRfc.id) {
      setActiveRfcId(newRfc.id);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#0A0A0A] text-[#EDEDED] flex flex-col overflow-hidden font-sans">
      {/* Top Status Bar */}
      <header className="h-12 border-b border-[#1F1F1F] px-4 flex items-center justify-between flex-shrink-0 bg-[#0A0A0A]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-white" />
            <span className="font-mono text-xs font-semibold tracking-wider text-white">
              MOVALONG
            </span>
          </div>

          <span className="text-neutral-700">·</span>

          <span className="text-xs font-mono text-neutral-400">
            {user?.email}
          </span>
        </div>

        {/* Right Status indicators */}
        <div className="flex items-center gap-4 text-xs font-mono">
          {/* Offline / Online Network Indicator */}
          <div className="flex items-center gap-1.5">
            {isOnline ? (
              <span className="flex items-center gap-1 text-neutral-400">
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                ONLINE
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-400 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-900/50">
                <WifiOff className="w-3.5 h-3.5" />
                OFFLINE
              </span>
            )}
          </div>

          {/* Queue Status */}
          {queueCount > 0 && (
            <div className="flex items-center gap-1 text-neutral-300 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
              <CloudUpload className="w-3.5 h-3.5 text-blue-400" />
              <span>QUEUE {queueCount}</span>
            </div>
          )}

          <span className="text-neutral-800">|</span>

          {/* Sign Out Button */}
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-neutral-400 hover:text-white transition"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* Main Workspace: Sidebar + Viewer */}
      <div className="flex-1 flex overflow-hidden">
        <HistorySidebar
          rfcs={rfcs}
          activeRfcId={activeRfcId}
          onSelectRfc={setActiveRfcId}
          queueCount={queueCount}
          loading={loadingList}
        />

        <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#0A0A0A]">
          <div className="flex-1 overflow-hidden">
            <RfcViewer rfc={activeRfc} onDelete={handleDeleteRfc} />
          </div>

          {/* Docked Audio Recorder at bottom */}
          <Recorder
            onRfcCreated={handleRfcCreated}
            onQueueChange={setQueueCount}
          />
        </main>
      </div>
    </div>
  );
}

function MainApp() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#0A0A0A] flex items-center justify-center font-mono text-xs text-neutral-500">
        Loading MovAlong workspace...
      </div>
    );
  }

  if (!token) {
    return <AuthScreen />;
  }

  return <Workspace />;
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
