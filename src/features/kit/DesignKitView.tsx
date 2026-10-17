import React, { useState } from 'react';
import {
  Wordmark,
  EcgStrip,
  TriageTag,
  HangTag,
  Wristband,
  StickerBlob,
  Stamp,
  Tape,
  EcgSquiggle,
  ChevronRule,
  SectionTitle,
  UnitMarker,
  SlaRing,
  Button,
  IconButton,
  Tooltip,
  Kbd,
  ProvenanceChip,
  ConnectionChip,
  Panel,
  Drawer,
  Modal,
  ThemeToggle,
  Skeleton,
  EmptyState,
  ErrorState,
  ToastContainer,
  ToastMessage,
  IconUnit,
  IconCall,
  IconRoute,
  IconZone,
  IconClock,
  IconSolver,
  IconRoadClosed,
  IconAls,
  IconBls,
  IconHeartbeat,
  IconSearch,
  IconClose,
  IconCheck,
  IconAlert,
  IconSun,
  IconMoon,
  IconOffline,
} from '../../design-system';

export function DesignKitView() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [ecgSimState, setEcgSimState] = useState<'idle' | 'pending' | 'critical' | 'offline'>('idle');
  const [stampAnimate, setStampAnimate] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const triggerToast = (type: 'undo' | 'error' | 'success') => {
    const id = String(Date.now());
    const newToast: ToastMessage = {
      id,
      type,
      message:
        type === 'undo'
          ? 'Unit AMB-04 dispatched to Anna Nagar'
          : type === 'error'
          ? 'Route obstructed on Periyar Flyover'
          : 'Scenario baseline applied',
      undoAction: type === 'undo' ? () => {} : undefined,
    };
    setToasts((prev) => [...prev, newToast]);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const triggerStampAnimation = () => {
    setStampAnimate(true);
    setTimeout(() => setStampAnimate(false), 500);
  };

  return (
    <div className="flex flex-col gap-10 w-full max-w-7xl mx-auto pb-24">
      {/* Chevron ambulance livery banner at the top */}
      <ChevronRule height={10} />

      {/* Top Section Header using SectionTitle */}
      <SectionTitle
        eyebrow="MADURAI DISPATCH SLIP"
        title="Visual system & tactile component inventory"
        accentWord="tactile"
        action={{
          label: "Trigger Test Stamp",
          onClick: triggerStampAnimation,
        }}
      />

      {/* 1. Vocabulary Primitives: Stickers, Stamps, Tape, Wristbands */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Organic Sticker Blobs */}
        <div className="relative rounded-[20px] border-2 border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-[6px_6px_0_var(--shadow-ink)] overflow-visible">
          <Tape position="top-right" rotation={4} />
          <div className="flex items-center justify-between pb-3 border-b-2 border-[var(--line)] mb-4">
            <h3 className="font-mono-numbers text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
              StickerBlob Primitives
            </h3>
            <span className="text-[10px] font-mono-numbers text-[var(--ink-muted)]">
              58% 42% 55% 45% / 48% 56% 44% 52%
            </span>
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <span className="text-[10px] font-mono-numbers uppercase text-[var(--ink-muted)] block mb-2 font-bold">
                Tones (mint · sky · blush · sun · paper)
              </span>
              <div className="flex flex-wrap items-center gap-4">
                <StickerBlob emoji="🫀" tone="blush" size="md" title="Blush tone" />
                <StickerBlob emoji="🚑" tone="sun" size="md" title="Sun tone" />
                <StickerBlob emoji="🌿" tone="mint" size="md" title="Mint tone" />
                <StickerBlob emoji="💧" tone="sky" size="md" title="Sky tone" />
                <StickerBlob emoji="📋" tone="paper" size="md" title="Paper tone" />
              </div>
            </div>

            <div className="pt-2 border-t border-[var(--line)]/20">
              <span className="text-[10px] font-mono-numbers uppercase text-[var(--ink-muted)] block mb-2 font-bold">
                Scale Sizes (sm · md · lg)
              </span>
              <div className="flex items-center gap-4">
                <StickerBlob emoji="🏥" tone="mint" size="sm" />
                <StickerBlob emoji="🏥" tone="mint" size="md" />
                <StickerBlob emoji="🏥" tone="mint" size="lg" />
              </div>
            </div>
          </div>
        </div>

        {/* Rubber Stamps */}
        <div className="relative rounded-[20px] border-2 border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-[6px_6px_0_var(--shadow-ink)] overflow-visible">
          <Tape position="top-left" rotation={-5} />
          <div className="flex items-center justify-between pb-3 border-b-2 border-[var(--line)] mb-4">
            <h3 className="font-mono-numbers text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
              Rubber Stamps & Seals
            </h3>
            <Button size="sm" variant="secondary" onClick={triggerStampAnimation}>
              Stamp down
            </Button>
          </div>

          <div className="flex flex-col gap-5">
            <div>
              <span className="text-[10px] font-mono-numbers uppercase text-[var(--ink-muted)] block mb-2 font-bold">
                Rectangular Stamp Variants (-6° rotated)
              </span>
              <div className="flex flex-wrap items-center gap-4">
                <Stamp variant="DISPATCHED" color="signal" animate={stampAnimate} />
                <Stamp variant="ON SCENE" color="available" animate={stampAnimate} />
                <Stamp variant="CLEARED" color="ink" animate={stampAnimate} />
                <Stamp variant="STAT" color="signal" animate={stampAnimate} />
                <Stamp variant="SIM" color="high" animate={stampAnimate} />
              </div>
            </div>

            <div className="pt-2 border-t border-[var(--line)]/20">
              <span className="text-[10px] font-mono-numbers uppercase text-[var(--ink-muted)] block mb-2 font-bold">
                Circular Dashed Stamp Seal
              </span>
              <div className="flex items-center gap-6">
                <Stamp variant="STAT" color="signal" shape="circle" animate={stampAnimate}>
                  MADURAI STAT
                </Stamp>
                <Stamp variant="CLEARED" color="ink" shape="circle" animate={stampAnimate}>
                  VERIFIED DISPATCH
                </Stamp>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SVG Divider that draws itself on mount */}
      <EcgSquiggle color="var(--line)" />

      {/* 2. Triage HangTags & Patient/Unit Wristbands */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* HangTags */}
        <div className="rounded-[20px] border-2 border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-[6px_6px_0_var(--shadow-ink)]">
          <div className="flex items-center justify-between pb-3 border-b-2 border-[var(--line)] mb-4">
            <h3 className="font-mono-numbers text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
              HangTag Triage Tokens
            </h3>
            <span className="text-[10px] font-mono-numbers text-[var(--ink-muted)]">
              Chamfered notch · String · Punched hole · Weight dots
            </span>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <HangTag priority="Critical" id="C-101" weight={4} size="lg" />
              <HangTag priority="High" id="H-204" weight={3} size="lg" />
              <HangTag priority="Medium" id="M-305" weight={2} size="lg" />
              <HangTag priority="Low" id="L-401" weight={1} size="lg" />
            </div>

            <div className="pt-2 border-t border-[var(--line)]/20 flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-mono-numbers uppercase text-[var(--ink-muted)] block w-full font-bold">
                Standard & Compact Sizes (TriageTag compatibility)
              </span>
              <TriageTag priority="Critical" weight={4} size="md" />
              <TriageTag priority="High" weight={3} size="md" />
              <TriageTag priority="Medium" weight={2} size="md" />
              <TriageTag priority="Low" weight={1} size="md" />
              <TriageTag priority="Critical" size="sm" />
            </div>
          </div>
        </div>

        {/* Wristbands */}
        <div className="rounded-[20px] border-2 border-[var(--line)] bg-[var(--surface-raised)] p-6 shadow-[6px_6px_0_var(--shadow-ink)]">
          <div className="flex items-center justify-between pb-3 border-b-2 border-[var(--line)] mb-4">
            <h3 className="font-mono-numbers text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
              Unit ID Wristbands
            </h3>
            <span className="text-[10px] font-mono-numbers text-[var(--ink-muted)]">
              Tear notches · ALS/BLS mark · Status tone
            </span>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <Wristband id="AMB-01" type="ALS" status="Available" />
              <Wristband id="AMB-02" type="BLS" status="Available" />
              <Wristband id="AMB-03" type="ALS" status="Busy" />
              <Wristband id="AMB-04" type="BLS" status="Offline" />
            </div>

            <div className="pt-2 border-t border-[var(--line)]/20">
              <span className="text-[10px] font-mono-numbers uppercase text-[var(--ink-muted)] block mb-2 font-bold">
                Unit Markers
              </span>
              <div className="flex flex-wrap items-center gap-5">
                <UnitMarker status="Available" id="AMB-01" type="ALS" size="md" />
                <UnitMarker status="Busy" id="AMB-02" type="BLS" size="md" />
                <UnitMarker status="Offline" id="AMB-03" type="ALS" size="sm" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Typography & Display Headlines */}
      <Panel title="Typography & Headline Anatomy" badge="REAL SAMPLE">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
            <div className="flex items-baseline gap-4">
              <Wordmark size="sm" />
              <Wordmark size="md" />
              <Wordmark size="lg" />
            </div>
            <div className="flex items-center gap-2">
              <Kbd>⌘K</Kbd>
              <Kbd>Esc</Kbd>
              <Kbd>1..6</Kbd>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t-2 border-[var(--line)]">
            <div>
              <span className="text-[10px] font-mono-numbers uppercase font-bold text-[var(--ink-muted)] block mb-1">
                Display: Fraunces (600–800, Italic)
              </span>
              <p className="font-serif-display text-3xl font-bold text-[var(--ink)] leading-tight">
                Rapid <span className="italic text-[var(--signal)]">triage</span> response
              </p>
              <p className="font-serif-display text-4xl font-extrabold text-[var(--ink)] mt-1 tabular-nums">
                128.5 <span className="font-mono-numbers text-xs font-bold text-[var(--ink-muted)]">sec</span>
              </p>
            </div>
            <div>
              <span className="text-[10px] font-mono-numbers uppercase font-bold text-[var(--ink-muted)] block mb-1">
                UI: Hanken Grotesk (400–700)
              </span>
              <p className="font-ui text-sm text-[var(--ink)] leading-relaxed">
                Hospital dispatch slips and emergency fleet allocation. Chunky ink outlines with zero blur hard offset shadows.
              </p>
            </div>
            <div>
              <span className="text-[10px] font-mono-numbers uppercase font-bold text-[var(--ink-muted)] block mb-1">
                Data: Geist Mono (Tabular Numerals)
              </span>
              <p className="font-mono-numbers text-sm font-bold text-[var(--ink)] leading-relaxed">
                AMB-04 · 09:42:18 · LAT: 9.9252 N<br />
                SLA: 07:42 / 10:00 [BENCHMARK]
              </p>
            </div>
          </div>
        </div>
      </Panel>

      {/* 4. Controls: Buttons, Pills, Switches, Chips */}
      <Panel title="Interactive Controls & Physics" badge="DERIVED">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary" size="md">
              Primary Ink Pill
            </Button>
            <Button variant="secondary" size="md">
              Secondary Paper Pill
            </Button>
            <Button variant="danger" size="md">
              Signal Action
            </Button>
            <Button variant="ghost" size="md">
              Ghost Button
            </Button>
            <Button variant="primary" size="sm">
              Small Pill
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-4 border-t-2 border-[var(--line)]">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono-numbers uppercase font-bold text-[var(--ink-muted)]">
                Theme Switch:
              </span>
              <ThemeToggle />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono-numbers uppercase font-bold text-[var(--ink-muted)]">
                Connection:
              </span>
              <ConnectionChip status="live" roundTripMs={14} />
              <ConnectionChip status="degraded" roundTripMs={120} />
              <ConnectionChip status="offline" />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono-numbers uppercase font-bold text-[var(--ink-muted)]">
                Honesty Stamps:
              </span>
              <ProvenanceChip kind="REAL SAMPLE" />
              <ProvenanceChip kind="SIMULATED" />
              <ProvenanceChip kind="DERIVED" />
            </div>
          </div>
        </div>
      </Panel>

      {/* 5. Telemetry Rhythm, SLA Ring, & Shimmer Skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Panel title="Cardiac Waveform" badge="REAL SAMPLE">
          <div className="flex flex-col gap-4">
            <EcgStrip state={ecgSimState} showStatusLabel />
            <div className="flex items-center gap-2">
              <Button size="sm" variant={ecgSimState === 'idle' ? 'primary' : 'secondary'} onClick={() => setEcgSimState('idle')}>
                Sinus
              </Button>
              <Button size="sm" variant={ecgSimState === 'pending' ? 'primary' : 'secondary'} onClick={() => setEcgSimState('pending')}>
                Pending
              </Button>
              <Button size="sm" variant={ecgSimState === 'critical' ? 'primary' : 'secondary'} onClick={() => setEcgSimState('critical')}>
                Critical
              </Button>
              <Button size="sm" variant={ecgSimState === 'offline' ? 'primary' : 'secondary'} onClick={() => setEcgSimState('offline')}>
                Flatline
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title="Response Clock" badge="DERIVED">
          <div className="flex items-center justify-around py-2">
            <SlaRing elapsedSeconds={420} benchmarkSeconds={600} size={48} />
            <SlaRing elapsedSeconds={645} benchmarkSeconds={600} size={48} />
          </div>
        </Panel>

        <Panel title="Paper Shimmer" badge="SIMULATED">
          <div className="flex flex-col gap-2.5">
            <Skeleton height={20} className="w-3/4" />
            <Skeleton height={36} className="w-full" />
            <Skeleton height={16} className="w-1/2" />
          </div>
        </Panel>
      </div>

      {/* 6. Overlays: Modal, Drawer & Stamp-style Toasts */}
      <Panel title="Overlays & Feedback" badge="DERIVED">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            Open Slip Modal
          </Button>

          <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>
            Open Perforated Drawer
          </Button>

          <Button variant="secondary" onClick={() => triggerToast('undo')}>
            Show Dispatch Toast
          </Button>

          <Button variant="danger" onClick={() => triggerToast('error')}>
            Show Warning Toast
          </Button>
        </div>
      </Panel>

      {/* 7. States: Empty & Error */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <EmptyState
          title="No pending dispatches"
          description="All units are stationed at their base sectors."
          actionLabel="Simulate Call"
          onAction={() => {}}
        />

        <ErrorState
          title="Telematics warning"
          message="GPS coordinate feed degraded across Simmakkal bridge."
          retryLabel="Reconnect"
          onRetry={() => {}}
        />
      </div>

      {/* Modal Demonstration */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Tactile Slip Modal"
      >
        <div className="flex flex-col gap-4 font-ui">
          <p className="text-xs text-[var(--ink)] leading-relaxed">
            This modal opens with a physical stamp-down animation, wears a surgical tape strip on its corner, and sits on a 28px radius slip with an 8px hard offset shadow.
          </p>
          <div className="flex items-center justify-end gap-3 pt-3 border-t-2 border-[var(--line)]">
            <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>
              Dismiss
            </Button>
            <Button variant="primary" size="sm" onClick={() => setIsModalOpen(false)}>
              Confirm Slip
            </Button>
          </div>
        </div>
      </Modal>

      {/* Drawer Demonstration */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Perforated Slip Drawer"
      >
        <div className="flex flex-col gap-4 font-ui">
          <p className="text-xs text-[var(--ink)] leading-relaxed">
            Sliding slip with a radial-gradient perforated tear edge along its boundary.
          </p>
          <div className="p-4 rounded-[14px] bg-[var(--surface)] border-2 border-[var(--line)] shadow-[3px_3px_0_var(--shadow-ink)] flex flex-col gap-2">
            <span className="font-mono-numbers text-xs font-bold uppercase text-[var(--ink)]">
              AMB-01 Telematics Card
            </span>
            <div className="flex items-center gap-2">
              <HangTag priority="Critical" id="C-101" size="sm" />
              <Stamp variant="DISPATCHED" color="signal" />
            </div>
          </div>
        </div>
      </Drawer>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />
    </div>
  );
}
