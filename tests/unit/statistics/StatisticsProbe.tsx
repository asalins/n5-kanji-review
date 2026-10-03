import { Dashboard } from '../../../src/features/progress/Dashboard';
import { useStatistics } from '../../../src/features/progress/useStatistics';

/** Renders the real dashboard with an injected clock (the production wrapper reads the system clock). */
export function StatisticsProbe({ now }: { now: () => number }) {
  const { state, reload } = useStatistics({ now });
  return <Dashboard state={state} onRetry={() => void reload()} />;
}
