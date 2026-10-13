import React, { useState, useEffect, useRef, useCallback } from 'react';
import { get, set } from 'idb-keyval';
import { uploadAudioApi } from '../api/client';
import { Mic, Square, Loader2, AlertCircle } from 'lucide-react';

const QUEUE_KEY = 'movalong_audio_queue';

export default function Recorder({ onRfcCreated, onQueueChange }) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Load and update queue count
  const updateQueueCount = useCallback(async () => {
    try {
      const queue = (await get(QUEUE_KEY)) || [];
      if (onQueueChange) onQueueChange(queue.length);
      return queue;
    } catch {
      return [];
    }
  }, [onQueueChange]);

  // Flush queue to backend
  const flushQueue = useCallback(async () => {
    if (isSyncing) return;
    try {
      const queue = (await get(QUEUE_KEY)) || [];
      if (queue.length === 0) {
        if (onQueueChange) onQueueChange(0);
        return;
      }

      setIsSyncing(true);
      const remaining = [];

      for (const item of queue) {
        try {
          const formData = new FormData();
          formData.append('file', item.blob, `${item.id}.webm`);
          formData.append('client_id', item.id);
          formData.append('recorded_at', item.recorded_at);

          const rfc = await uploadAudioApi(formData);
          if (onRfcCreated) onRfcCreated(rfc);
        } catch (err) {
          // If offline or 503, preserve in queue
          if (!navigator.onLine || err.response?.status === 503) {
            remaining.push(item);
          } else {
            console.error('Upload failed:', err);
            remaining.push(item);
          }
        }
      }

      await set(QUEUE_KEY, remaining);
      if (onQueueChange) onQueueChange(remaining.length);
    } catch (e) {
      console.error('Queue flush error:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, onQueueChange, onRfcCreated]);

  // Flush on mount and when coming online
  useEffect(() => {
    updateQueueCount();
    flushQueue();

    const handleOnline = () => {
      flushQueue();
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [flushQueue, updateQueueCount]);

  // Canvas visualizer loop
  const drawWaveform = useCallback(() => {
    if (!analyserRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animFrameRef.current = requestAnimationFrame(render);
      analyserRef.current.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const numBars = 36;
      const barWidth = 3;
      const gap = 3;
      const totalWidth = numBars * (barWidth + gap);
      const startX = (canvas.width - totalWidth) / 2;

      for (let i = 0; i < numBars; i++) {
        const index = Math.floor((i / numBars) * (bufferLength / 2));
        const val = dataArray[index] || 0;
        const percent = val / 255;
        const barHeight = Math.max(3, percent * canvas.height * 0.85);
        const x = startX + i * (barWidth + gap);
        const y = (canvas.height - barHeight) / 2;

        ctx.fillStyle = '#EF4444'; // Signal accent
        ctx.fillRect(x, y, barWidth, barHeight);
      }
    };
    render();
  }, []);

  const startRecording = async () => {
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Audio context for waveform
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const queueItem = {
          id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          blob: audioBlob,
          recorded_at: new Date().toISOString(),
        };

        try {
          const queue = (await get(QUEUE_KEY)) || [];
          queue.push(queueItem);
          await set(QUEUE_KEY, queue);
          await updateQueueCount();
          // Flush immediately
          flushQueue();
        } catch (err) {
          console.error('IDB error:', err);
        }

        // Clean up tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

      drawWaveform();
    } catch (err) {
      console.error('Microphone access denied:', err);
      setErrorMsg('Microphone permission required for voice recording.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const formatTimer = (sec) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full bg-[#111111] border-t border-[#1F1F1F] px-6 py-3 flex items-center justify-between">
      {/* Left: Waveform / Status */}
      <div className="flex items-center gap-4">
        {isRecording ? (
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <canvas ref={canvasRef} width={220} height={32} className="block" />
            <span className="text-xs font-mono font-medium text-white tabular-nums">
              {formatTimer(duration)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
            <span className="w-2 h-2 rounded-full bg-neutral-700" />
            <span>Ready to capture spoken RFC memo</span>
          </div>
        )}

        {errorMsg && (
          <span className="text-xs font-mono text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            {errorMsg}
          </span>
        )}
      </div>

      {/* Right: Record Control Button */}
      <div className="flex items-center gap-3">
        {isSyncing && (
          <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1.5 mr-2">
            <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
            Syncing queue...
          </span>
        )}

        {isRecording ? (
          <button
            onClick={stopRecording}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-mono text-xs rounded-lg transition shadow-lg shadow-red-950/40"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop & Generate RFC</span>
          </button>
        ) : (
          <button
            onClick={startRecording}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-neutral-200 text-black font-mono text-xs font-medium rounded-lg transition"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Record Memo</span>
          </button>
        )}
      </div>
    </div>
  );
}
