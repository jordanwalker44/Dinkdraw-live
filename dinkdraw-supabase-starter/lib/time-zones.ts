export const LEAGUE_TIME_ZONES = [
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Phoenix', label: 'Arizona Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/New_York', label: 'Eastern Time' },
] as const;

export function detectDeviceTimeZone() {
  if (typeof Intl === 'undefined') return '';
  return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
}

export function timeZoneOptions(selectedTimeZone?: string) {
  if (!selectedTimeZone || LEAGUE_TIME_ZONES.some((zone) => zone.value === selectedTimeZone)) {
    return [...LEAGUE_TIME_ZONES];
  }
  return [{ value: selectedTimeZone, label: selectedTimeZone.replaceAll('_', ' ') }, ...LEAGUE_TIME_ZONES];
}
