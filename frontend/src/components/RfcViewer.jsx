import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { 
  Copy, 
  Download, 
  Check, 
  FileText, 
  Mic, 
  Layers, 
  Clock, 
  Cpu, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Trash2
} from 'lucide-react';

function MermaidBlock({ chart }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(null);
  const containerId = useRef(`mermaid-${Math.random().toString(36).substring(2, 9)}`);

  useEffect(() => {
    let isMounted = true;
    const renderChart = async () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            darkMode: true,
            background: '#111111',
            primaryColor: '#1F1F1F',
            primaryTextColor: '#EDEDED',
            primaryBorderColor: '#333333',
            lineColor: '#777777',
            secondaryColor: '#181818',
            tertiaryColor: '#141414',
          },
          securityLevel: 'loose',
        });
        // Render unique diagram
        const { svg: renderedSvg } = await mermaid.render(containerId.current, chart.trim());
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          console.error("Mermaid error:", err);
          setError(err.message || 'Error rendering Mermaid chart');
        }
      }
    };

    if (chart) {
      renderChart();
    }
    return () => {
      isMounted = false;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="my-4 p-4 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-400">
        <div className="text-amber-500 font-semibold mb-1">Diagram Syntax</div>
        <pre className="overflow-x-auto text-[11px] text-neutral-300">{chart}</pre>
      </div>
    );
  }

  return (
    <div
      className="my-6 p-6 bg-[#0E0E0E] border border-[#1F1F1F] rounded-xl overflow-x-auto flex justify-center shadow-inner"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default function RfcViewer({ rfc, onDelete }) {
  const [activeTab, setActiveTab] = useState('rfc'); // 'rfc' | 'transcript'
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActiveTab('rfc');
  }, [rfc?.id]);

  if (!rfc) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-neutral-500 font-mono text-xs">
        <div className="w-12 h-12 rounded-full border border-neutral-800 flex items-center justify-center mb-4 text-neutral-600">
          <FileText className="w-5 h-5" />
        </div>
        <p className="text-neutral-400 font-medium mb-1">No RFC selected</p>
        <p className="text-neutral-600 max-w-xs">
          Select an RFC from the sidebar, or record a voice memo to generate an architecture proposal.
        </p>
      </div>
    );
  }

  const isProcessing = rfc.status === 'transcribing' || rfc.status === 'structuring';
  const isFailed = rfc.status === 'failed';

  const handleCopy = () => {
    const textToCopy = activeTab === 'rfc' ? rfc.rfc_markdown : (rfc.raw_transcript || '');
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename = `${rfc.title || 'RFC'}.md`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const blob = new Blob([rfc.rfc_markdown || ''], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-[#0A0A0A] overflow-hidden">
      {/* Top action header */}
      <div className="h-14 border-b border-[#1F1F1F] px-6 flex items-center justify-between flex-shrink-0 bg-[#0A0A0A]">
        <div className="flex items-center gap-3">
          <div className="flex bg-[#141414] border border-[#222222] p-0.5 rounded-lg">
            <button
              onClick={() => setActiveTab('rfc')}
              className={`px-3 py-1 text-xs font-mono rounded-md transition-all ${
                activeTab === 'rfc'
                  ? 'bg-neutral-800 text-white font-medium shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              RFC Document
            </button>
            <button
              onClick={() => setActiveTab('transcript')}
              className={`px-3 py-1 text-xs font-mono rounded-md transition-all ${
                activeTab === 'transcript'
                  ? 'bg-neutral-800 text-white font-medium shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Voice Transcript
            </button>
          </div>

          {/* Sample Badge */}
          {rfc.sample && (
            <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider uppercase font-semibold bg-blue-950/40 text-blue-400 border border-blue-900/60 rounded">
              SAMPLE
            </span>
          )}

          {/* Status Indicator */}
          {rfc.status === 'ready' && (
            <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              ready
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="px-2.5 py-1.5 text-xs font-mono text-neutral-300 hover:text-white bg-[#141414] hover:bg-[#1E1E1E] border border-[#242424] rounded-lg transition flex items-center gap-1.5"
            title="Copy Markdown"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={handleDownload}
            disabled={!rfc.rfc_markdown}
            className="px-2.5 py-1.5 text-xs font-mono text-neutral-300 hover:text-white bg-[#141414] hover:bg-[#1E1E1E] border border-[#242424] rounded-lg transition flex items-center gap-1.5 disabled:opacity-40"
            title="Download .md"
          >
            <Download className="w-3.5 h-3.5" />
            <span>.md</span>
          </button>

          {onDelete && (
            <button
              onClick={() => onDelete(rfc.id)}
              className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-950/20 border border-transparent hover:border-red-900/40 rounded-lg transition ml-2"
              title="Delete RFC"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-8 max-w-4xl w-full mx-auto">
        {/* Processing State */}
        {isProcessing && (
          <div className="mb-8 p-6 bg-[#121212] border border-[#1F1F1F] rounded-xl flex items-center gap-4">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin flex-shrink-0" />
            <div>
              <div className="text-sm font-mono font-medium text-white capitalize">
                Stage: {rfc.status === 'transcribing' ? 'Transcribing Spoken Audio (Whisper Base)' : 'Structuring RFC Architecture (Gemma 2)'}
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                Synthesizing architectural specifications and rendering Mermaid systems diagrams...
              </p>
            </div>
          </div>
        )}

        {/* Failed State */}
        {isFailed && (
          <div className="mb-8 p-6 bg-red-950/20 border border-red-900/50 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-mono font-medium text-red-300">Processing Failed</div>
              <p className="text-xs text-red-400/80 mt-1">{rfc.error || 'Failed to generate RFC from audio.'}</p>
            </div>
          </div>
        )}

        {/* Mock Audio / Audio Metadata Card */}
        {rfc.mock_audio && (
          <div className="mb-8 p-3.5 bg-[#111111] border border-[#1E1E1E] rounded-lg flex flex-wrap items-center gap-y-2 gap-x-6 text-[11px] font-mono text-neutral-400">
            <span className="flex items-center gap-1.5 text-neutral-300">
              <Clock className="w-3.5 h-3.5 text-neutral-500" />
              {rfc.mock_audio.duration_s}s recorded
            </span>
            <span className="flex items-center gap-1.5 text-neutral-300">
              <Layers className="w-3.5 h-3.5 text-neutral-500" />
              {(rfc.mock_audio.size_bytes / 1024).toFixed(1)} KB ({rfc.mock_audio.mime})
            </span>
            <span className="flex items-center gap-1.5 text-neutral-300">
              <Cpu className="w-3.5 h-3.5 text-neutral-500" />
              {rfc.mock_audio.whisper_model} + {rfc.mock_audio.llm_model}
            </span>
          </div>
        )}

        {/* Tab View: RFC or Transcript */}
        {activeTab === 'rfc' ? (
          rfc.rfc_markdown ? (
            <article className="prose prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-2xl font-bold font-sans text-white border-b border-[#222222] pb-3 mb-6 tracking-tight">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-lg font-semibold font-sans text-neutral-100 mt-8 mb-3 tracking-tight">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-semibold font-sans text-neutral-200 mt-6 mb-2">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-sm text-neutral-300 leading-relaxed my-3 font-sans">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-outside ml-5 my-3 space-y-1 text-sm text-neutral-300 font-sans">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-outside ml-5 my-3 space-y-1 text-sm text-neutral-300 font-sans">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-neutral-700 pl-4 py-1 my-4 text-neutral-400 italic font-sans text-sm">
                      {children}
                    </blockquote>
                  ),
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const lang = match ? match[1] : '';
                    const codeStr = String(children).replace(/\n$/, '');

                    if (!inline && (lang === 'mermaid' || codeStr.startsWith('sequenceDiagram') || codeStr.startsWith('flowchart') || codeStr.startsWith('graph'))) {
                      return <MermaidBlock chart={codeStr} />;
                    }

                    if (!inline) {
                      return (
                        <div className="my-4 rounded-lg bg-[#111111] border border-[#222222] overflow-x-auto p-4">
                          <code className="text-xs font-mono text-neutral-200" {...props}>
                            {codeStr}
                          </code>
                        </div>
                      );
                    }

                    return (
                      <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-neutral-900 border border-neutral-800 text-neutral-200" {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {rfc.rfc_markdown}
              </ReactMarkdown>
            </article>
          ) : (
            <div className="text-center py-16 text-neutral-500 font-mono text-xs">
              {isProcessing ? 'Generating RFC content...' : 'No RFC markdown content available.'}
            </div>
          )
        ) : (
          <div className="p-6 bg-[#121212] border border-[#1F1F1F] rounded-xl">
            <h3 className="text-xs font-mono uppercase tracking-wider text-neutral-400 mb-3 flex items-center gap-2">
              <Mic className="w-3.5 h-3.5 text-neutral-400" />
              Raw Voice Transcript
            </h3>
            {rfc.raw_transcript ? (
              <p className="text-sm font-sans text-neutral-300 leading-relaxed whitespace-pre-wrap">
                "{rfc.raw_transcript}"
              </p>
            ) : (
              <p className="text-xs font-mono text-neutral-600">
                {isProcessing ? 'Transcribing audio in background...' : 'No transcript recorded.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
