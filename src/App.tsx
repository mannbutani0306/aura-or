import React, { lazy, Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Wordmark,
  EcgStrip,
  EcgState,
  ThemeToggle,
  ThemeMode,
  CommandPalette,
  CommandItem,
  FirstLoadIntro,
  Tooltip,
  ConnectionChip,
  EventsDrawer,
  OfflineState,
  Modal,
  Button,
  Kbd,
  PulseControl,
  ProvenancePopover,
  ToastContainer,
  ToastMessage,
} from './design-system';
import {
  IconUnit,
  IconCall,
  IconRoute,
  IconZone,
  IconClock,
  IconSolver,
  IconSearch,
} from './design-system/icons';
import { isSoundEnabled, setSoundEnabled, playSoftAlertBeep } from './utils/audio';
import { dataSource, ConnectionStatus, EventLogRow } from './data';
import { CommandView } from './features/command/CommandView';

const DispatchView = lazy(() => import('./features/dispatch/DispatchView').then((module) => ({ default: module.DispatchView })));
const FleetView = lazy(() => import('./features/fleet/FleetView').then((module) => ({ default: module.FleetView })));
const RoutesView = lazy(() => import('./features/routes/RoutesView').then((module) => ({ default: module.RoutesView })));
const InsightsView = lazy(() => import('./features/insights/InsightsView').then((module) => ({ default: module.InsightsView })));
const DesignKitView = lazy(() => import('./features/kit/DesignKitView').then((module) => ({ default: module.DesignKitView })));

export type NavTabId = 'command' | 'dispatch' | 'fleet' | 'routes' | 'insights' | 'kit';

export default function App() {
  // 1. Session-based First-Load Intro
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !sessionStorage.getItem('aura_intro_shown');
  });

  const handleIntroComplete = useCallback(() => {
    sessionStorage.setItem('aura_intro_shown', 'true');
    setShowIntro(false);
  }, []);

  // 2. Connection State Machine
  const [connStatus, setConnStatus] = useState<ConnectionStatus>(dataSource.getConnectionStatus());
  const [roundTripMs, setRoundTripMs] = useState<number>(dataSource.getRoundTripMs());
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(dataSource.getLastSyncedAt());
  const [lastError, setLastError] = useState<string | null>(dataSource.getLastError());

  useEffect(() => {
    const unsub = dataSource.subscribeConnection((status, rtt, lastSync, err) => {
      setConnStatus(status);
      setRoundTripMs(rtt);
      setLastSyncedAt(lastSync);
      setLastError(err);
    });
    return () => unsub();
  }, []);

  // 3. Event Log Realtime Stream
  const [eventLogs, setEventLogs] = useState<EventLogRow[]>(() => dataSource.getEventLogs());
  const [isEventsDrawerOpen, setIsEventsDrawerOpen] = useState(false);

  useEffect(() => {
    const unsub = dataSource.subscribeEventLogs((logs) => {
      setEventLogs(logs);
    });
    return () => unsub();
  }, []);

  // 4. Reset Scenario State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = (id: string) => setToasts((current) => current.filter((toast) => toast.id !== id));

  const handleExecuteReset = async () => {
    setIsResetting(true);
    setResetMessage(null);
    try {
      await dataSource.resetDemo();
      setIsResetModalOpen(false);
      setToasts((current) => [...current, {
        id: `reset-${Date.now()}`,
        type: 'success',
        message: 'Scenario reset complete',
        stamp: 'CLEARED',
        stampLabel: 'RESET',
      }]);
    } catch (err: any) {
      setResetMessage(err.message || 'Failed to reset scenario');
    } finally {
      setIsResetting(false);
    }
  };

  // 5. Active Tab State & URL Hash Support for hidden /#/kit route
  const getInitialTab = (): NavTabId => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      if (['command', 'dispatch', 'fleet', 'routes', 'insights', 'kit'].includes(hash)) {
        return hash as NavTabId;
      }
    }
    return 'command';
  };

  const [activeTab, setActiveTab] = useState<NavTabId>(getInitialTab);

  useEffect(() => {
    const handleHashChange = () => {
      if (typeof window !== 'undefined' && window.location.hash) {
        const hash = window.location.hash.replace('#/', '').replace('#', '');
        if (['command', 'dispatch', 'fleet', 'routes', 'insights', 'kit'].includes(hash)) {
          setActiveTab(hash as NavTabId);
        }
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleNavigate = useCallback((route: string) => {
    setActiveTab(route as NavTabId);
    if (typeof window !== 'undefined') {
      window.location.hash = `#/${route}`;
    }
  }, []);

  // 6. Theme State
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'paper';
    const saved = localStorage.getItem('aura-theme-mode') as ThemeMode | null;
    return saved === 'night' || saved === 'paper' ? saved : 'paper';
  });

  // 7. Audio State
  const [soundActive, setSoundActive] = useState<boolean>(() => isSoundEnabled());

  const toggleSound = useCallback(() => {
    const next = !soundActive;
    setSoundEnabled(next);
    setSoundActive(next);
    if (next) {
      playSoftAlertBeep();
    }
  }, [soundActive]);

  // 8. Command Palette State
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // 9. Real-time Emergency Rhythm (feeds the ECG strip in header)
  const [ecgState, setEcgState] = useState<EcgState>('idle');

  useEffect(() => {
    if (connStatus === 'offline') {
      setEcgState('offline');
      return;
    }

    const checkEmergencies = async () => {
      try {
        const emergencies = await dataSource.getEmergencies();
        const pending = emergencies.filter((e) => e.status === 'Pending');
        if (pending.some((e) => e.priority === 'Critical')) {
          setEcgState('critical');
        } else if (pending.length > 0) {
          setEcgState('pending');
        } else {
          setEcgState('idle');
        }
      } catch {
        setEcgState('offline');
      }
    };

    checkEmergencies();
    const unsub = dataSource.subscribe(checkEmergencies);
    return () => unsub();
  }, [connStatus]);

  // 10. Global Keyboard Navigation (1-6, Cmd+K, T, M, ?)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      switch (e.key) {
        case '1':
          handleNavigate('command');
          break;
        case '2':
          handleNavigate('dispatch');
          break;
        case '3':
          handleNavigate('fleet');
          break;
        case '4':
          handleNavigate('routes');
          break;
        case '5':
          handleNavigate('insights');
          break;
        case '6':
          handleNavigate('kit');
          break;
        case 't':
        case 'T':
          setTheme((prev) => (prev === 'paper' ? 'night' : 'paper'));
          break;
        case 'm':
        case 'M':
          toggleSound();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSound, handleNavigate]);

  // Navigation Items Config
  const navItems: Array<{ id: NavTabId; label: string; shortcut: string; icon: React.ReactNode }> = [
    { id: 'command', label: 'Command', shortcut: '1', icon: <IconZone size={15} /> },
    { id: 'dispatch', label: 'Dispatch', shortcut: '2', icon: <IconSolver size={15} /> },
    { id: 'fleet', label: 'Fleet', shortcut: '3', icon: <IconUnit size={15} /> },
    { id: 'routes', label: 'Routes', shortcut: '4', icon: <IconRoute size={15} /> },
    { id: 'insights', label: 'Insights', shortcut: '5', icon: <IconClock size={15} /> },
  ];

  // Command Palette Items (Clean scrubbed copy, short verbs, unlisted design kit)
  const commandPaletteItems: CommandItem[] = useMemo(() => [
    {
      id: 'nav-command',
      category: 'Navigation',
      label: 'Go to Command',
      shortcut: '1',
      perform: () => handleNavigate('command'),
    },
    {
      id: 'nav-dispatch',
      category: 'Navigation',
      label: 'Dispatch',
      shortcut: '2',
      perform: () => handleNavigate('dispatch'),
    },
    {
      id: 'nav-fleet',
      category: 'Navigation',
      label: 'Fleet directory',
      shortcut: '3',
      perform: () => handleNavigate('fleet'),
    },
    {
      id: 'nav-routes',
      category: 'Navigation',
      label: 'Road network',
      shortcut: '4',
      perform: () => handleNavigate('routes'),
    },
    {
      id: 'nav-insights',
      category: 'Navigation',
      label: 'Insights',
      shortcut: '5',
      perform: () => handleNavigate('insights'),
    },
    {
      id: 'action-events',
      category: 'Action',
      label: 'Events',
      perform: () => setIsEventsDrawerOpen(true),
    },
    {
      id: 'action-reset-demo',
      category: 'Action',
      label: 'Reset scenario',
      perform: () => setIsResetModalOpen(true),
    },
    {
      id: 'action-theme',
      category: 'Action',
      label: 'Toggle theme',
      shortcut: 'T',
      perform: () => setTheme((prev) => (prev === 'paper' ? 'night' : 'paper')),
    },
    {
      id: 'action-sound',
      category: 'Action',
      label: soundActive ? 'Mute sound' : 'Sound on',
      shortcut: 'M',
      perform: toggleSound,
    },
  ], [soundActive, toggleSound, handleNavigate]);

  const handleSirenSweep = useCallback(() => {
    if (soundActive) {
      playSoftAlertBeep();
    }
  }, [soundActive]);

  // If Connection is Offline and no data can be loaded, show full-screen Offline State
  if (connStatus === 'offline') {
    return (
      <OfflineState
        error={lastError}
        onRetry={async () => {
          await dataSource.retryConnection();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--ink)] flex flex-col font-ui antialiased transition-colors duration-240 ecg-grid">
      {/* 1. First-Load Intro Sequence (≤1.2s, once per session, skippable) */}
      {showIntro && <FirstLoadIntro onComplete={handleIntroComplete} />}

      {/* 2. Top Header Bar (Desktop & Mobile) with Chunky Outline and Hard Offset Shadow */}
      <header className="min-h-16 h-auto min-w-0 px-3 sm:px-6 py-2 border-b-2 border-[var(--line)] bg-[var(--surface-raised)] sticky top-0 z-30 flex flex-wrap items-center justify-between gap-y-2 shrink-0 shadow-[0_2px_0_var(--shadow-ink)]">
        {/* Left: Brand Wordmark + Live Telematics Rhythm + Realtime Connection Chip */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Wordmark size="md" onClick={() => handleNavigate('command')} />
          <div className="hidden sm:block h-5 w-[2px] bg-[var(--line)] opacity-30" />
          <EcgStrip className="hidden lg:inline-flex" state={ecgState} showStatusLabel />
          <ConnectionChip status={connStatus} roundTripMs={roundTripMs} lastSyncedAt={lastSyncedAt} compact />
        </div>

        {/* Center: Desktop Navigation Dock (pills with 2px line and hard shadows) */}
        <nav
          aria-label="Main Navigation"
          className="hidden md:flex items-center gap-1.5 p-1 rounded-full bg-[var(--surface)] border-2 border-[var(--line)] shadow-[3px_3px_0_var(--shadow-ink)]"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <Tooltip key={item.id} content={item.label} shortcut={item.shortcut}>
                <button
                  onClick={() => handleNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-mono-numbers font-bold transition-all duration-120 focus-ring cursor-pointer select-none ${
                    isActive
                      ? 'bg-[var(--ink)] text-[var(--bg-app)] border-2 border-[var(--line)] shadow-[2px_2px_0_var(--signal)]'
                      : 'text-[var(--ink)] hover:bg-[var(--surface-raised)] border-2 border-transparent hover:border-[var(--line)]'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              </Tooltip>
            );
          })}
        </nav>

        {/* Right: Controls (Events, Pulse, provenance, sound, theme, search) */}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <PulseControl />
          <ProvenancePopover />
          {/* Live Events Stream Button: icon + "Events" */}
          <Tooltip content="Events" className="hidden sm:inline-flex">
            <button
              onClick={() => setIsEventsDrawerOpen(true)}
              aria-label="Events"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-[var(--line)] bg-[var(--surface-raised)] hover:bg-[var(--surface)] text-xs font-mono-numbers font-bold text-[var(--ink)] shadow-[2px_2px_0_var(--shadow-ink)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all focus-ring cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-[var(--unit-available)] animate-pulse border border-[var(--line)]" />
              <span className="hidden sm:inline">Events</span>
              <span className="text-[10px] text-[var(--ink-muted)] font-normal">({eventLogs.length})</span>
            </button>
          </Tooltip>

          {/* Audio Toggle */}
          <Tooltip content={soundActive ? 'Mute' : 'Sound'} shortcut="M" className="hidden sm:inline-flex">
            <button
              onClick={toggleSound}
              aria-label={soundActive ? 'Mute' : 'Sound'}
              className="w-9 h-9 flex items-center justify-center rounded-full border-2 border-[var(--line)] bg-[var(--surface-raised)] hover:bg-[var(--surface)] shadow-[2px_2px_0_var(--shadow-ink)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all focus-ring cursor-pointer"
            >
              <span className="text-sm">{soundActive ? '🔔' : '🔕'}</span>
            </button>
          </Tooltip>

          {/* Theme Toggle */}
          <ThemeToggle theme={theme} onToggle={setTheme} compact />

          {/* Command Palette Trigger: Search pill with Kbd ⌘K inside */}
          <Tooltip content="Search commands">
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              aria-label="Search commands"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--surface-raised)] border-2 border-[var(--line)] hover:bg-[var(--surface)] shadow-[2px_2px_0_var(--shadow-ink)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all duration-120 focus-ring cursor-pointer"
            >
              <IconSearch size={14} className="text-[var(--ink)]" />
              <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
            </button>
          </Tooltip>
        </div>
      </header>

      {/* Marquee Ticker: Tactical Telematics Slip Ticker */}
      <div className="w-full bg-[var(--surface)] border-b-2 border-[var(--line)] py-1 px-4 overflow-hidden select-none flex items-center gap-4 text-[11px] font-mono-numbers font-semibold">
        <span className="px-2 py-0.5 rounded-full bg-[var(--signal)] text-white text-[9px] uppercase tracking-wider font-extrabold shrink-0 border border-[var(--line)]">
          DISPATCH SLIP
        </span>
        <div className="flex items-center gap-6 overflow-x-auto whitespace-nowrap text-[var(--ink-muted)]">
          <span>MADURAI DISTRICT EMERGENCY SECTOR</span>
          <span>·</span>
          <span>ALS/BLS RAPID TRIAGE</span>
          <span>·</span>
          <span>GORIPALAYAM · ANNA NAGAR · PERIYAR · SIMMAKKAL</span>
          <span>·</span>
          <span className="text-[var(--ink)] font-bold">STATIONARY PROTOCOL: ACTIVE</span>
        </div>
      </div>

      {/* 3. Main View Container with 240ms Shared Page Transition */}
      <main className="flex-1 w-full max-w-full overflow-hidden p-3 sm:p-5 pb-20 md:pb-5 flex flex-col">
        <div key={activeTab} className="page-transition-enter w-full flex-1 flex flex-col">
          {activeTab === 'command' && (
            <CommandView
              onNavigate={handleNavigate}
              theme={theme}
              onTriggerSiren={handleSirenSweep}
            />
          )}

          {activeTab === 'dispatch' && (
            <Suspense fallback={<div role="status" className="rounded-[20px] border-2 border-[var(--line)] bg-[var(--surface-raised)] p-8 text-center font-mono-numbers text-xs uppercase tracking-widest text-[var(--ink-muted)]">Loading dispatch sheet…</div>}>
              <DispatchView onNavigate={handleNavigate} />
            </Suspense>
          )}

          {activeTab === 'fleet' && (
            <Suspense fallback={<div role="status" className="rounded-[20px] border-2 border-[var(--line)] bg-[var(--surface-raised)] p-8 text-center font-mono-numbers text-xs uppercase tracking-widest text-[var(--ink-muted)]">Loading fleet sheet…</div>}>
              <FleetView onNavigate={handleNavigate} />
            </Suspense>
          )}

          {activeTab === 'routes' && (
            <Suspense fallback={<div role="status" className="rounded-[20px] border-2 border-[var(--line)] bg-[var(--surface-raised)] p-8 text-center font-mono-numbers text-xs uppercase tracking-widest text-[var(--ink-muted)]">Loading route sheet…</div>}>
              <RoutesView onNavigate={handleNavigate} theme={theme} />
            </Suspense>
          )}

          {activeTab === 'insights' && (
            <Suspense fallback={<div role="status" className="rounded-[20px] border-2 border-[var(--line)] bg-[var(--surface-raised)] p-8 text-center font-mono-numbers text-xs uppercase tracking-widest text-[var(--ink-muted)]">Loading insights…</div>}>
              <InsightsView onNavigate={handleNavigate} />
            </Suspense>
          )}

          {activeTab === 'kit' && (
            <Suspense fallback={<div role="status" className="rounded-[20px] border-2 border-[var(--line)] bg-[var(--surface-raised)] p-8 text-center font-mono-numbers text-xs uppercase tracking-widest text-[var(--ink-muted)]">Loading components…</div>}>
              <DesignKitView />
            </Suspense>
          )}
        </div>
      </main>

      {/* 4. Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--surface-raised)] border-t-2 border-[var(--line)] h-16 flex items-center justify-around px-2 shadow-2xl"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 gap-1 transition-all focus-ring active:scale-95 cursor-pointer ${
                isActive
                  ? 'text-[var(--ink)] font-bold'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <div
                className={`p-1.5 rounded-full transition-all ${
                  isActive
                    ? 'bg-[var(--ink)] text-[var(--bg-app)] border-2 border-[var(--line)] shadow-[2px_2px_0_var(--signal)]'
                    : ''
                }`}
              >
                {item.icon}
              </div>
              <span className="text-[10px] font-mono-numbers uppercase tracking-wider font-bold">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* 5. Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        items={commandPaletteItems}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* 6. Realtime Events Drawer */}
      <EventsDrawer
        isOpen={isEventsDrawerOpen}
        onClose={() => setIsEventsDrawerOpen(false)}
        events={eventLogs}
      />

      {/* 7. Reset Scenario Confirmation Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Reset scenario"
      >
        <div className="flex flex-col gap-4 font-ui">
          <p className="text-xs text-[var(--ink)] leading-relaxed">
            Restore baseline ambulance allocations and clear active dispatches.
          </p>

          {resetMessage && (
            <div className="p-3 rounded-[12px] bg-[var(--blush)] border-2 border-[var(--critical)] text-xs font-mono-numbers text-[var(--critical)] font-bold">
              {resetMessage}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t-2 border-[var(--line)]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsResetModalOpen(false)}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={isResetting}
              onClick={handleExecuteReset}
            >
              Reset scenario
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
