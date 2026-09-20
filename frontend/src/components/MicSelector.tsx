'use client';

interface MicSelectorProps {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onChange: (deviceId: string) => void;
  disabled?: boolean;
}

export function MicSelector({ devices, selectedDeviceId, onChange, disabled }: MicSelectorProps) {
  if (devices.length === 0) return null;

  return (
    <select
      value={selectedDeviceId}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="max-w-[10rem] truncate rounded-lg border border-neutral-300 bg-white px-2 py-2 text-xs text-neutral-700 disabled:opacity-50"
      title="Microphone input"
    >
      {devices.map((d, i) => (
        <option key={d.deviceId || i} value={d.deviceId}>
          {d.label || `Microphone ${i + 1}`}
        </option>
      ))}
    </select>
  );
}
